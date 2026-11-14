#include "KanafWorldActors.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SkyLight.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"
#include "Kanaf/Geo.h"
#include "KanafConvert.h"
#include "KanafSim.h"

using namespace KanafConv;

// ------------------------------------------------------------------------------------------
// Terrain
// ------------------------------------------------------------------------------------------

AKanafTerrainActor::AKanafTerrainActor()
{
	PrimaryActorTick.bCanEverTick = true;
	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Terrain"));
	RootComponent = Mesh;
	Mesh->bUseAsyncCooking = true;
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);  // physics uses the core GroundModel
	Mesh->SetCastShadow(true);
}

void AKanafTerrainActor::Init(const kanaf::GroundModel* InGround, const kanaf::HeightGridProvider* InDem, double Lat, double Lon, double RadiusKm, float DetailScale, double FallbackH)
{
	Ground = InGround;
	Dem = InDem;
	Detail = FMath::Clamp(DetailScale, 0.5f, 2.f);
	Material = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
	if (!Material) Material = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (!Dem || !Dem->covers(Lat, Lon))
	{
		BuildFallbackPlane(FallbackH);
		return;
	}
	North = Dem->north();
	West = Dem->west();
	LatStep = (Dem->north() - Dem->south()) / (Dem->height() - 1);
	LonStep = (Dem->east() - Dem->west()) / (Dem->width() - 1);
	const double DegLat = RadiusKm * 1000.0 / 111132.0, DegLon = RadiusKm * 1000.0 / (111320.0 * FMath::Cos(FMath::DegreesToRadians(Lat)));
	const int32 R0 = FMath::Max(0, int32((North - (Lat + DegLat)) / LatStep)), R1 = FMath::Min(Dem->height() - 2, int32((North - (Lat - DegLat)) / LatStep));
	const int32 C0 = FMath::Max(0, int32((Lon - DegLon - West) / LonStep)), C1 = FMath::Min(Dem->width() - 2, int32((Lon + DegLon - West) / LonStep));
	for (int32 R = R0; R < R1; R += ChunkCells)
		for (int32 C = C0; C < C1; C += ChunkCells)
		{
			FChunk Ch;
			Ch.R0 = R;
			Ch.C0 = C;
			const double CLat = North - (R + ChunkCells / 2) * LatStep, CLon = West + (C + ChunkCells / 2) * LonStep;
			Ch.CenterUe = NedToUe(Ground->frame().toNed({CLat, CLon, Dem->heightMsl(CLat, CLon)}));
			Chunks.Add(Ch);
		}
	UE_LOG(LogKanaf, Log, TEXT("Terrain: %d chunks within %.0f km"), Chunks.Num(), RadiusKm);
	UpdateTimer = 0.f;
	SetActorTickEnabled(true);
}

int32 AKanafTerrainActor::LodFor(double D) const
{
	const double K = Detail;
	if (D < 7000 * K) return 0;
	if (D < 16000 * K) return 1;
	if (D < 32000 * K) return 2;
	return 3;
}

FLinearColor AKanafTerrainActor::ColorFor(double H, double Slope, kanaf::SurfaceType S) const
{
	// ARTISTIC desert palette (no imagery): elevation and slope based. Documented as non-real.
	if (S == kanaf::SurfaceType::Runway) return FLinearColor(0.07f, 0.07f, 0.075f);
	const FLinearColor Low(0.55f, 0.47f, 0.36f), Mid(0.62f, 0.52f, 0.40f), High(0.48f, 0.40f, 0.33f), Rock(0.36f, 0.30f, 0.26f), Salt(0.70f, 0.68f, 0.62f);
	FLinearColor C = H < -350 ? Salt : (H < 400 ? FMath::Lerp(Low, Mid, float((H + 350) / 750)) : FMath::Lerp(Mid, High, float(FMath::Clamp((H - 400) / 600, 0.0, 1.0))));
	return FMath::Lerp(C, Rock, float(FMath::Clamp((Slope - 0.15) / 0.5, 0.0, 1.0)));
}

void AKanafTerrainActor::BuildChunk(FChunk& Ch)
{
	const int32 Step = 1 << Ch.Wanted;
	const int32 N = ChunkCells / Step + 1;
	TArray<FVector> V; TArray<int32> Tri; TArray<FVector> Nrm; TArray<FVector2D> UV; TArray<FLinearColor> Col; TArray<FProcMeshTangent> Tan;
	V.Reserve(N * N + 4 * N); Col.Reserve(N * N + 4 * N);
	TArray<double> Hs; Hs.SetNumUninitialized(N * N);
	TArray<kanaf::SurfaceType> Ss; Ss.SetNumUninitialized(N * N);
	for (int32 i = 0; i < N; ++i)
		for (int32 j = 0; j < N; ++j)
		{
			const int32 R = FMath::Min(Ch.R0 + i * Step, Dem->height() - 1), C = FMath::Min(Ch.C0 + j * Step, Dem->width() - 1);
			const double Lat = North - R * LatStep, Lon = West + C * LonStep;
			kanaf::GroundSample G = Ground->sampleGeo(Lat, Lon);
			Hs[i * N + j] = G.heightMslM;
			Ss[i * N + j] = G.surface;
			V.Add(NedToUe(Ground->frame().toNed({Lat, Lon, G.heightMslM - (G.surface == kanaf::SurfaceType::Runway ? 0.15 : 0.0)})));
			UV.Add(FVector2D(j, i));
		}
	for (int32 i = 0; i < N; ++i)
		for (int32 j = 0; j < N; ++j)
		{
			const int32 a = FMath::Max(i - 1, 0), b = FMath::Min(i + 1, N - 1), c = FMath::Max(j - 1, 0), d = FMath::Min(j + 1, N - 1);
			const FVector Dx = V[i * N + d] - V[i * N + c], Dy = V[b * N + j] - V[a * N + j];
			FVector Nn = FVector::CrossProduct(Dy, Dx).GetSafeNormal();
			if (Nn.Z < 0) Nn = -Nn;
			Nrm.Add(Nn);
			Col.Add(ColorFor(Hs[i * N + j], 1.0 - Nn.Z, Ss[i * N + j]));
			Tan.Add(FProcMeshTangent(Dx.GetSafeNormal(), false));
		}
	for (int32 i = 0; i < N - 1; ++i)
		for (int32 j = 0; j < N - 1; ++j)
		{
			const int32 k = i * N + j;
			Tri.Append({k, k + 1, k + N, k + 1, k + N + 1, k + N});
		}
	// Skirts hide cracks between neighbouring chunks at different LODs.
	auto Skirt = [&](int32 ia, int32 ib) {
		const int32 s0 = V.Num();
		V.Add(V[ia] - FVector(0, 0, 4000)); Nrm.Add(Nrm[ia]); Col.Add(Col[ia]); UV.Add(UV[ia]); Tan.Add(Tan[ia]);
		V.Add(V[ib] - FVector(0, 0, 4000)); Nrm.Add(Nrm[ib]); Col.Add(Col[ib]); UV.Add(UV[ib]); Tan.Add(Tan[ib]);
		Tri.Append({ia, s0, ib, ib, s0, s0 + 1});
		Tri.Append({ia, ib, s0, ib, s0 + 1, s0});  // double-sided skirt
	};
	for (int32 j = 0; j < N - 1; ++j) { Skirt(j, j + 1); Skirt((N - 1) * N + j, (N - 1) * N + j + 1); }
	for (int32 i = 0; i < N - 1; ++i) { Skirt(i * N, (i + 1) * N); Skirt(i * N + N - 1, (i + 1) * N + N - 1); }

	if (Ch.Section < 0) Ch.Section = Built++;
	Mesh->CreateMeshSection_LinearColor(Ch.Section, V, Tri, Nrm, UV, Col, Tan, false);
	if (Material) Mesh->SetMaterial(Ch.Section, Material);
	Ch.Lod = Ch.Wanted;
}

void AKanafTerrainActor::BuildFallbackPlane(double H)
{
	bFallback = true;
	// Flat ARTISTIC fallback: 80 km square at the fallback height. Clearly reported in the UI.
	const double S = 40000.0 * 100.0;
	const double Zue = NedToUe(Ground->frame().toNed({Ground->frame().originLat(), Ground->frame().originLon(), H})).Z;
	TArray<FVector> V = {FVector(-S, -S, Zue), FVector(-S, S, Zue), FVector(S, S, Zue), FVector(S, -S, Zue)};
	TArray<int32> T = {0, 2, 1, 0, 3, 2};
	TArray<FVector> N = {FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector};
	TArray<FVector2D> UV = {FVector2D(0, 0), FVector2D(0, 1), FVector2D(1, 1), FVector2D(1, 0)};
	TArray<FLinearColor> C;
	C.Init(FLinearColor(0.5f, 0.45f, 0.38f), 4);
	Mesh->CreateMeshSection_LinearColor(0, V, T, N, UV, C, {}, false);
	if (Material) Mesh->SetMaterial(0, Material);
	SetActorTickEnabled(false);
	UE_LOG(LogKanaf, Warning, TEXT("Terrain: using flat fallback plane at %.1f m"), H);
}

void AKanafTerrainActor::Tick(float Dt)
{
	Super::Tick(Dt);
	if (bFallback || Chunks.Num() == 0) return;
	UpdateTimer -= Dt;
	if (UpdateTimer <= 0.f)
	{
		UpdateTimer = 0.5f;
		FVector Cam = FVector::ZeroVector;
		if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
			if (PC->PlayerCameraManager) Cam = PC->PlayerCameraManager->GetCameraLocation();
		Queue.Reset();
		for (int32 i = 0; i < Chunks.Num(); ++i)
		{
			const double D = FVector::Dist2D(Cam, Chunks[i].CenterUe) / 100.0;
			Chunks[i].Wanted = LodFor(D);
			if (Chunks[i].Wanted != Chunks[i].Lod) Queue.Add(i);
		}
		Queue.Sort([this, Cam](int32 A, int32 B) { return FVector::DistSquared2D(Cam, Chunks[A].CenterUe) < FVector::DistSquared2D(Cam, Chunks[B].CenterUe); });
	}
	// Progressive streaming: spend at most ~4 ms per frame building chunks, nearest first.
	const double T0 = FPlatformTime::Seconds();
	while (Queue.Num() > 0 && FPlatformTime::Seconds() - T0 < 0.004)
	{
		BuildChunk(Chunks[Queue[0]]);
		Queue.RemoveAt(0);
	}
}

// ------------------------------------------------------------------------------------------
// Runways (schematic, from OurAirports thresholds; elevations follow the session's ground model)
// ------------------------------------------------------------------------------------------

AKanafRunwayActor::AKanafRunwayActor()
{
	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Runways"));
	RootComponent = Mesh;
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AKanafRunwayActor::Build(const kanaf::FlightSession& S, const kanaf::Catalog& Cat, bool bNight)
{
	UMaterialInterface* Mat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"));
	TArray<FVector> V; TArray<int32> T; TArray<FVector> N; TArray<FVector2D> UV; TArray<FLinearColor> C;
	auto Quad = [&](const FVector& A, const FVector& B, const FVector& Cc, const FVector& D, const FLinearColor& Col) {
		const int32 k = V.Num();
		V.Append({A, B, Cc, D});
		N.Append({FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector});
		UV.Append({FVector2D(0, 0), FVector2D(1, 0), FVector2D(1, 1), FVector2D(0, 1)});
		C.Append({Col, Col, Col, Col});
		T.Append({k, k + 2, k + 1, k, k + 3, k + 2});
	};
	const kanaf::GroundModel& G = S.ground;
	for (const kanaf::BaseDef& B : Cat.bases)
	{
		if (kanaf::greatCircleDistanceM(B.lat, B.lon, S.base->lat, S.base->lon) > 80000) continue;
		for (const kanaf::RunwayDef& R : B.runways)
		{
			const kanaf::GroundSample Ga = G.sampleGeo(R.ends[0].lat, R.ends[0].lon), Gb = G.sampleGeo(R.ends[1].lat, R.ends[1].lon);
			const kanaf::Vec3 A = S.frame.toNed({R.ends[0].lat, R.ends[0].lon, Ga.heightMslM + 0.08});
			const kanaf::Vec3 Bn = S.frame.toNed({R.ends[1].lat, R.ends[1].lon, Gb.heightMslM + 0.08});
			kanaf::Vec3 Dir = Bn - A; const double Len = Dir.length(); Dir = Dir / Len;
			const kanaf::Vec3 Right(-Dir.y, Dir.x, 0);
			const double W = R.widthM > 0 ? R.widthM : 45;
			auto P = [&](double Along, double Lat, double Up) { return NedToUe(A + Dir * Along + Right * Lat + kanaf::Vec3(0, 0, -Up)); };
			Quad(P(0, -W / 2, 0), P(0, W / 2, 0), P(Len, W / 2, 0), P(Len, -W / 2, 0), FLinearColor(0.06f, 0.06f, 0.065f));
			const FLinearColor White(0.85f, 0.85f, 0.85f);
			for (double s = 120; s < Len - 120; s += 50) Quad(P(s, -0.45, 0.03), P(s, 0.45, 0.03), P(s + 30, 0.45, 0.03), P(s + 30, -0.45, 0.03), White);
			for (int e = 0; e < 2; ++e)  // threshold bars
			{
				const double a0 = e == 0 ? 6 : Len - 36;
				for (double l = -W / 2 + 3; l < W / 2 - 3; l += 3.6) Quad(P(a0, l, 0.03), P(a0, l + 1.8, 0.03), P(a0 + 30, l + 1.8, 0.03), P(a0 + 30, l, 0.03), White);
				// designator text lying on the runway
				UTextRenderComponent* Txt = NewObject<UTextRenderComponent>(this);
				Txt->SetupAttachment(RootComponent);
				const double At = e == 0 ? 60 : Len - 60;
				Txt->SetWorldLocation(P(At, 0, 0.05));
				const double Hdg = FMath::RadiansToDegrees(FMath::Atan2(Dir.y, Dir.x)) + (e == 0 ? 0 : 180);
				Txt->SetWorldRotation(FRotator(90, Hdg + 180, 0));
				Txt->SetText(FText::FromString(KanafConv::ToF(R.ends[e].ident)));
				Txt->SetWorldSize(1800.f);
				Txt->SetTextRenderColor(FColor(220, 220, 220));
				Txt->SetHorizontalAlignment(EHTA_Center);
				Txt->RegisterComponent();
			}
			if (bNight && &B == S.base)
			{
				for (double s = 0; s <= Len; s += 300)
					for (int side = -1; side <= 1; side += 2)
					{
						UPointLightComponent* L = NewObject<UPointLightComponent>(this);
						L->SetupAttachment(RootComponent);
						L->SetWorldLocation(P(s, side * (W / 2 + 1.5), 0.6));
						L->SetIntensity(2000.f);
						L->SetAttenuationRadius(6000.f);
						L->SetLightColor(FLinearColor(1.f, 0.9f, 0.7f));
						L->SetCastShadows(false);
						L->RegisterComponent();
					}
			}
		}
	}
	Mesh->CreateMeshSection_LinearColor(0, V, T, N, UV, C, {}, false);
	if (Mat) Mesh->SetMaterial(0, Mat);
}

// ------------------------------------------------------------------------------------------
// Environment
// ------------------------------------------------------------------------------------------

KanafEnvironment::FSun KanafEnvironment::SolarPosition(double Lat, double Lon, double LocalHour, int32 Doy, double UtcOffset)
{
	const double G = 2 * PI / 365.0 * (Doy - 1 + (LocalHour - 12) / 24);
	const double Decl = 0.006918 - 0.399912 * FMath::Cos(G) + 0.070257 * FMath::Sin(G) - 0.006758 * FMath::Cos(2 * G) + 0.000907 * FMath::Sin(2 * G) - 0.002697 * FMath::Cos(3 * G) + 0.00148 * FMath::Sin(3 * G);
	const double EqT = 229.18 * (0.000075 + 0.001868 * FMath::Cos(G) - 0.032077 * FMath::Sin(G) - 0.014615 * FMath::Cos(2 * G) - 0.040849 * FMath::Sin(2 * G));
	const double SolarMin = LocalHour * 60 + EqT + 4 * Lon - 60 * UtcOffset;
	const double Ha = FMath::DegreesToRadians(SolarMin / 4 - 180);
	const double Phi = FMath::DegreesToRadians(Lat);
	const double CosZ = FMath::Sin(Phi) * FMath::Sin(Decl) + FMath::Cos(Phi) * FMath::Cos(Decl) * FMath::Cos(Ha);
	const double Zen = FMath::Acos(FMath::Clamp(CosZ, -1.0, 1.0));
	double Az = FMath::Atan2(FMath::Sin(Ha), FMath::Cos(Ha) * FMath::Sin(Phi) - FMath::Tan(Decl) * FMath::Cos(Phi));
	FSun S;
	S.ElevationDeg = 90 - FMath::RadiansToDegrees(Zen);
	S.AzimuthDeg = FMath::Fmod(FMath::RadiansToDegrees(Az) + 180 + 360, 360.0);
	return S;
}

void KanafEnvironment::Spawn(UWorld* W, double Lat, double Lon, double Hour, double OriginMslM, TArray<AActor*>& Out)
{
	const FDateTime Now = FDateTime::Now();
	const FSun Sun = SolarPosition(Lat, Lon, Hour, Now.GetDayOfYear());
	const bool bNight = Sun.ElevationDeg < -4;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	ADirectionalLight* SunA = W->SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-Sun.ElevationDeg, Sun.AzimuthDeg + 180, 0), P);
	if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(SunA->GetLightComponent()))
	{
		L->SetMobility(EComponentMobility::Movable);
		L->SetAtmosphereSunLight(true);
		L->SetAtmosphereSunLightIndex(0);
		L->SetIntensity(bNight ? 0.f : 75000.f);  // lux, physically based with the sky atmosphere
		L->SetDynamicShadowDistanceMovableLight(20000.f);
	}
	Out.Add(SunA);
	if (bNight)  // dim moonlight so terrain silhouettes remain readable (artistic choice)
	{
		ADirectionalLight* Moon = W->SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-35, 120, 0), P);
		if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Moon->GetLightComponent()))
		{
			L->SetMobility(EComponentMobility::Movable);
			L->SetAtmosphereSunLight(true);
			L->SetAtmosphereSunLightIndex(1);
			L->SetIntensity(0.3f);
			L->SetLightColor(FLinearColor(0.6f, 0.7f, 1.f));
		}
		Out.Add(Moon);
	}
	// The frame origin is at base elevation; put the planet surface (sea level) below it.
	AActor* SkyA = W->SpawnActor<AActor>(AActor::StaticClass(), FTransform(FVector(0, 0, -OriginMslM * 100.0)), P);
	USkyAtmosphereComponent* Sky = NewObject<USkyAtmosphereComponent>(SkyA);
	SkyA->SetRootComponent(Sky);
	Sky->RegisterComponent();
	// Planet surface at sea level: our frame origin is at base elevation, so lower the planet top.
	Sky->TransformMode = ESkyAtmosphereTransformMode::PlanetTopAtComponentTransform;
	Out.Add(SkyA);

	ASkyLight* SL = W->SpawnActor<ASkyLight>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	if (USkyLightComponent* C = SL->GetLightComponent())
	{
		C->SetMobility(EComponentMobility::Movable);
		C->bRealTimeCapture = true;
		C->SetLowerHemisphereColor(FLinearColor(0.15f, 0.12f, 0.1f));
		C->RecaptureSky();
	}
	Out.Add(SL);

	AExponentialHeightFog* Fog = W->SpawnActor<AExponentialHeightFog>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	if (UExponentialHeightFogComponent* F = Fog->GetComponent())
	{
		F->SetFogDensity(0.012f);
		F->SetFogHeightFalloff(0.12f);
		F->SetFogInscatteringColor(FLinearColor(0.55f, 0.5f, 0.42f));  // desert haze
		F->SetStartDistance(2000.f);
	}
	Out.Add(Fog);

	if (UMaterialInterface* CloudMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineSky/VolumetricClouds/m_SimpleVolumetricCloud_Inst.m_SimpleVolumetricCloud_Inst")))
	{
		AActor* CloudA = W->SpawnActor<AActor>(AActor::StaticClass(), FTransform::Identity, P);
		UVolumetricCloudComponent* Cl = NewObject<UVolumetricCloudComponent>(CloudA);
		CloudA->SetRootComponent(Cl);
		Cl->SetMaterial(CloudMat);
		Cl->SetLayerBottomAltitude(4.0f);  // km
		Cl->SetLayerHeight(4.0f);
		Cl->RegisterComponent();
		Out.Add(CloudA);
	}
	else
	{
		UE_LOG(LogKanaf, Warning, TEXT("Volumetric cloud material not found; clouds disabled"));
	}

	APostProcessVolume* PP = W->SpawnActor<APostProcessVolume>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	PP->bUnbound = true;
	PP->Settings.bOverride_AutoExposureMinBrightness = true;
	PP->Settings.bOverride_AutoExposureMaxBrightness = true;
	PP->Settings.AutoExposureMinBrightness = bNight ? -3.f : 10.f;  // EV100 (extended luminance range)
	PP->Settings.AutoExposureMaxBrightness = bNight ? 4.f : 16.f;
	Out.Add(PP);
	UE_LOG(LogKanaf, Log, TEXT("Environment: sun elevation %.1f deg, azimuth %.1f deg (local hour %.1f)"), Sun.ElevationDeg, Sun.AzimuthDeg, Hour);
}
