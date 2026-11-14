#include "KanafPlaceholderModel.h"

#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "KanafConvert.h"

using namespace KanafConv;

namespace
{
	const FLinearColor kCamo(0.36f, 0.34f, 0.28f);   // neutral desert grey-tan (livery not researched yet)
	const FLinearColor kDark(0.05f, 0.05f, 0.06f);
	const FLinearColor kGlass(0.05f, 0.08f, 0.12f);
	const FLinearColor kStore(0.55f, 0.56f, 0.52f);
	const FLinearColor kRubber(0.02f, 0.02f, 0.02f);

	USceneComponent* AddPivot(AActor* Owner, USceneComponent* Parent, const FVector& LocCm, const TCHAR* Name)
	{
		USceneComponent* S = NewObject<USceneComponent>(Owner, MakeUniqueObjectName(Owner, USceneComponent::StaticClass(), FName(Name)));
		S->SetupAttachment(Parent);
		S->SetRelativeLocation(LocCm);
		S->RegisterComponent();
		return S;
	}
	FVector M(double x, double y, double z) { return BodyToLocal(kanaf::Vec3(x, y, z)); }  // body metres -> local cm
}

UStaticMeshComponent* KanafModel::AddShape(AActor* Owner, USceneComponent* Parent, const TCHAR* Shape, const FVector& LocCm, const FRotator& Rot, const FVector& Scale, const FLinearColor& Color)
{
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Shape, Shape));
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(Owner);
	C->SetupAttachment(Parent);
	C->SetStaticMesh(Mesh);
	C->SetRelativeLocation(LocCm);
	C->SetRelativeRotation(Rot);
	C->SetRelativeScale3D(Scale);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetCastShadow(true);
	if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, C);
		MID->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(0, MID);
	}
	C->RegisterComponent();
	return C;
}

void KanafModel::BuildF16Placeholder(AActor* O, USceneComponent* P, const kanaf::Catalog& Cat, const std::map<std::string, std::string>& Stations, FKanafAircraftParts& Out)
{
	// Basic shapes are 1 m (100 cm) unit size; scale = metres. Cylinder/cone axis is local Z.
	const FRotator AlongX(-90, 0, 0);
	auto Add = [&](const TCHAR* S, FVector L, FRotator R, FVector Sc, FLinearColor C) { UStaticMeshComponent* X = AddShape(O, P, S, L, R, Sc, C); Out.All.Add(X); return X; };
	Add(TEXT("Cylinder"), M(-0.4, 0, 0), AlongX, FVector(1.25, 1.25, 12.2), kCamo);                // fuselage
	Add(TEXT("Cone"), M(7.2, 0, 0), AlongX, FVector(1.2, 1.2, 2.4), kCamo);                        // nose / radome
	Add(TEXT("Cube"), M(1.8, 0, 0.75), FRotator::ZeroRotator, FVector(3.8, 1.0, 0.75), kCamo);    // ventral intake
	Add(TEXT("Cube"), M(-0.8, 0, -0.7), FRotator::ZeroRotator, FVector(7.5, 0.7, 0.45), kCamo);   // dorsal spine (F-16I)
	Add(TEXT("Cube"), M(-0.6, -0.78, -0.3), FRotator::ZeroRotator, FVector(6.2, 0.45, 0.5), kCamo); // conformal fuel tanks (F-16I)
	Add(TEXT("Cube"), M(-0.6, 0.78, -0.3), FRotator::ZeroRotator, FVector(6.2, 0.45, 0.5), kCamo);
	Add(TEXT("Cube"), M(-1.2, -2.7, 0.1), FRotator(0, 22, 0), FVector(3.6, 4.0, 0.12), kCamo);     // wings
	Add(TEXT("Cube"), M(-1.2, 2.7, 0.1), FRotator(0, -22, 0), FVector(3.6, 4.0, 0.12), kCamo);
	Add(TEXT("Cube"), M(-5.0, 0, -2.0), FRotator(0, 0, 0), FVector(2.8, 0.14, 2.6), kCamo);        // fin
	Add(TEXT("Cube"), M(-4.6, 0, 0.75), FRotator(0, 0, 0), FVector(1.2, 0.05, 0.6), kCamo);        // ventral fins (approx)

	// Movable surfaces: pivot (hinge) + shape offset aft of the hinge.
	auto Surface = [&](const TCHAR* Name, FVector Hinge, FVector Offset, FVector Scale) {
		USceneComponent* H = AddPivot(O, P, Hinge, Name);
		UStaticMeshComponent* S = AddShape(O, H, TEXT("Cube"), Offset, FRotator::ZeroRotator, Scale, kCamo);
		Out.All.Add(S);
		return H;
	};
	Out.LeftStab = Surface(TEXT("LeftStab"), M(-5.6, -2.0, 0.05), M(-0.6, 0, 0), FVector(1.9, 2.3, 0.09));
	Out.RightStab = Surface(TEXT("RightStab"), M(-5.6, 2.0, 0.05), M(-0.6, 0, 0), FVector(1.9, 2.3, 0.09));
	Out.Rudder = Surface(TEXT("Rudder"), M(-6.3, 0, -1.9), M(-0.45, 0, 0), FVector(0.9, 0.1, 2.0));
	Out.LeftFlaperon = Surface(TEXT("LeftFlaperon"), M(-2.6, -2.9, 0.1), M(-0.35, 0, 0), FVector(0.7, 2.6, 0.07));
	Out.RightFlaperon = Surface(TEXT("RightFlaperon"), M(-2.6, 2.9, 0.1), M(-0.35, 0, 0), FVector(0.7, 2.6, 0.07));
	Out.SpeedbrakeL = Surface(TEXT("SpeedbrakeL"), M(-6.4, -0.5, 0), M(-0.4, 0, 0), FVector(0.8, 0.05, 0.6));
	Out.SpeedbrakeR = Surface(TEXT("SpeedbrakeR"), M(-6.4, 0.5, 0), M(-0.4, 0, 0), FVector(0.8, 0.05, 0.6));

	// Canopy on a rear hinge
	Out.CanopyHinge = AddPivot(O, P, M(2.6, 0, -0.6), TEXT("CanopyHinge"));
	Out.All.Add(AddShape(O, Out.CanopyHinge, TEXT("Sphere"), M(1.8, 0, -0.15), FRotator::ZeroRotator, FVector(3.4, 0.85, 0.75), kGlass));

	// Nozzle (scaled with afterburner)
	Out.Nozzle = AddShape(O, P, TEXT("Cylinder"), M(-7.0, 0, 0), AlongX, FVector(1.0, 1.0, 0.8), kDark);

	// Landing gear: pivots at the wells, leg + wheel below
	struct G { const TCHAR* N; double x, y; double wheel; };
	const G Gs[3] = {{TEXT("GearNose"), 4.3, 0.0, 0.45}, {TEXT("GearLeft"), -0.7, -1.2, 0.7}, {TEXT("GearRight"), -0.7, 1.2, 0.7}};
	for (const G& g : Gs)
	{
		USceneComponent* Piv = AddPivot(O, P, M(g.x, g.y, 0.55), g.N);
		AddShape(O, Piv, TEXT("Cylinder"), M(0, 0, 0.6), FRotator::ZeroRotator, FVector(0.12, 0.12, 1.15), kStore);
		AddShape(O, Piv, TEXT("Cylinder"), M(0, 0, 1.4 - g.wheel / 2 + 0.1), FRotator(0, 0, 90), FVector(g.wheel, g.wheel, 0.22), kRubber);
		Out.GearPivots.Add(Piv);
	}

	// External stores at the (game-assumed) station positions
	auto It = Cat.stations.find("f16i");
	for (const auto& S : Stations)
	{
		const kanaf::StationDef* St = Cat.station("f16i", S.first);
		const kanaf::WeaponDef* W = Cat.weapon(S.second);
		if (!St || !W || It == Cat.stations.end()) continue;
		const double Len = W->lengthM, Dia = W->diameterM;
		const int Count = W->perRack > 1 ? 2 : 1;  // racks: show two visible bodies side by side
		for (int i = 0; i < Count; ++i)
		{
			kanaf::Vec3 Pos = St->posM;
			Pos.z += Dia * 0.5 + 0.05;
			if (Count > 1) Pos.y += (i == 0 ? -1 : 1) * (Dia * 0.6);
			UStaticMeshComponent* C = AddShape(O, P, TEXT("Cylinder"), M(Pos.x, Pos.y, Pos.z), AlongX, FVector(Dia, Dia, Len), kStore);
			Out.Stores.Add(C);
			Out.All.Add(C);
		}
	}

	// Visible placeholder marking
	UTextRenderComponent* T = NewObject<UTextRenderComponent>(O);
	T->SetupAttachment(P);
	T->SetRelativeLocation(M(-1.0, -0.66, -0.1));
	T->SetRelativeRotation(FRotator(0, 90, 0));
	T->SetText(FText::FromString(TEXT("PLACEHOLDER MODEL")));
	T->SetTextRenderColor(FColor::Yellow);
	T->SetWorldSize(22.f);
	T->SetHorizontalAlignment(EHTA_Center);
	T->RegisterComponent();
}

void KanafModel::Animate(FKanafAircraftParts& P, double De, double Da, double Dr, double Flaps, double Sb, double Gear, double Canopy, double Ab)
{
	const double D = kanaf::kRad2Deg;
	// Elevator: trailing edge up (negative de) = nose up. Horizontal tails also act differentially for roll.
	if (P.LeftStab) P.LeftStab->SetRelativeRotation(FRotator((-De + 0.5 * Da) * D, 0, 0));
	if (P.RightStab) P.RightStab->SetRelativeRotation(FRotator((-De - 0.5 * Da) * D, 0, 0));
	if (P.Rudder) P.Rudder->SetRelativeRotation(FRotator(0, Dr * D, 0));
	const double FlapDeg = Flaps * 20.0;
	if (P.LeftFlaperon) P.LeftFlaperon->SetRelativeRotation(FRotator(-(FlapDeg + Da * D), 0, 0));
	if (P.RightFlaperon) P.RightFlaperon->SetRelativeRotation(FRotator(-(FlapDeg - Da * D), 0, 0));
	if (P.SpeedbrakeL) P.SpeedbrakeL->SetRelativeRotation(FRotator(0, -Sb * 60.0, 0));
	if (P.SpeedbrakeR) P.SpeedbrakeR->SetRelativeRotation(FRotator(0, Sb * 60.0, 0));
	if (P.CanopyHinge) P.CanopyHinge->SetRelativeRotation(FRotator(Canopy * 35.0, 0, 0));
	for (int32 i = 0; i < P.GearPivots.Num(); ++i)
	{
		USceneComponent* G = P.GearPivots[i];
		if (!G) continue;
		const double Up = 1.0 - Gear;
		G->SetRelativeRotation(i == 0 ? FRotator(-Up * 95.0, 0, 0) : FRotator(0, 0, (i == 1 ? -1 : 1) * Up * 95.0));
		G->SetVisibility(Gear > 0.02, true);
	}
	if (P.Nozzle) P.Nozzle->SetRelativeScale3D(FVector(1.0 + 0.15 * Ab, 1.0 + 0.15 * Ab, 0.8));
}
