#include "KanafHangar.h"

#include "Camera/CameraComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/RectLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "KanafGameSubsystem.h"

AKanafHangarPawn::AKanafHangarPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	ModelRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Model"));
	ModelRoot->SetupAttachment(Root);
	ModelRoot->SetRelativeLocation(FVector(0, 0, 190));  // gear height above the floor
	Cam = CreateDefaultSubobject<UCameraComponent>(TEXT("Cam"));
	Cam->SetupAttachment(Root);
	Cam->SetUsingAbsoluteLocation(true);
	Cam->SetUsingAbsoluteRotation(true);
	Cam->SetFieldOfView(60.f);
}

void AKanafHangarPawn::ClearModel()
{
	TArray<USceneComponent*> Children;
	ModelRoot->GetChildrenComponents(true, Children);
	for (USceneComponent* C : Children) if (C) C->DestroyComponent();
	Parts = FKanafAircraftParts();
}

void AKanafHangarPawn::BuildScene(const UKanafGameSubsystem* Data)
{
	if (!bSceneBuilt)
	{
		bSceneBuilt = true;
		const FLinearColor Floor(0.18f, 0.18f, 0.19f), Wall(0.28f, 0.27f, 0.25f);
		KanafModel::AddShape(this, Root, TEXT("Cube"), FVector(0, 0, -5), FRotator::ZeroRotator, FVector(60, 50, 0.1), Floor);
		KanafModel::AddShape(this, Root, TEXT("Cube"), FVector(-2400, 0, 600), FRotator::ZeroRotator, FVector(0.3, 50, 12), Wall);
		KanafModel::AddShape(this, Root, TEXT("Cube"), FVector(0, -2400, 600), FRotator::ZeroRotator, FVector(60, 0.3, 12), Wall);
		KanafModel::AddShape(this, Root, TEXT("Cube"), FVector(0, 2400, 600), FRotator::ZeroRotator, FVector(60, 0.3, 12), Wall);
		KanafModel::AddShape(this, Root, TEXT("Cube"), FVector(0, 0, 1250), FRotator::ZeroRotator, FVector(60, 50, 0.3), Wall);
		const FVector Lights[] = {FVector(600, 0, 1100), FVector(-600, 700, 1100), FVector(-600, -700, 1100), FVector(1500, 0, 400)};
		for (const FVector& L : Lights)
		{
			UPointLightComponent* P = NewObject<UPointLightComponent>(this);
			P->SetupAttachment(Root);
			P->SetRelativeLocation(L);
			P->SetIntensity(60000.f);
			P->SetAttenuationRadius(5000.f);
			P->SetSourceRadius(60.f);
			P->SetLightColor(FLinearColor(1.f, 0.95f, 0.88f));
			P->RegisterComponent();
		}
		USkyLightComponent* Sky = NewObject<USkyLightComponent>(this);
		Sky->SetupAttachment(Root);
		Sky->SetMobility(EComponentMobility::Movable);
		Sky->SourceType = ESkyLightSourceType::SLS_SpecifiedCubemap;
		Sky->SetIntensity(0.4f);
		Sky->RegisterComponent();
	}
	ClearModel();
	if (!Data) return;
	const kanaf::Catalog& C = Data->Catalog();
	std::map<std::string, std::string> Stations;
	for (const kanaf::LoadoutPreset& P : C.presets)
		if (P.id == TCHAR_TO_UTF8(*Data->Selection.LoadoutId) && P.aircraftId == TCHAR_TO_UTF8(*Data->Selection.AircraftId)) Stations = P.stations;
	// Only the implemented aircraft has a (placeholder) model; others show an empty stand.
	const kanaf::AircraftVariant* V = C.variant(TCHAR_TO_UTF8(*Data->Selection.AircraftId));
	if (V && V->assets.count("exteriorModel") && V->assets.at("exteriorModel").status != "missing")
	{
		KanafModel::BuildF16Placeholder(this, ModelRoot, C, Stations, Parts);
		KanafModel::Animate(Parts, 0, 0, 0, 0, 0, 1, 0.0, 0);
	}
}

void AKanafHangarPawn::Tick(float Dt)
{
	Super::Tick(Dt);
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		float Mx = 0, My = 0;
		PC->GetInputMouseDelta(Mx, My);
		if (PC->IsInputKeyDown(EKeys::LeftMouseButton) || PC->IsInputKeyDown(EKeys::RightMouseButton))
		{
			Yaw += Mx * 2.5f;
			Pitch = FMath::Clamp(Pitch + My * 2.f, -60.f, 5.f);
		}
		else
		{
			Yaw += Dt * 4.f;  // slow turntable
		}
		if (PC->WasInputKeyJustPressed(EKeys::MouseScrollUp)) Dist = FMath::Max(900.f, Dist - 150.f);
		if (PC->WasInputKeyJustPressed(EKeys::MouseScrollDown)) Dist = FMath::Min(4500.f, Dist + 150.f);
		const float Gx = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightX), Gy = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightY);
		Yaw += Gx * 90.f * Dt;
		Pitch = FMath::Clamp(Pitch + Gy * 60.f * Dt, -60.f, 5.f);
	}
	const FVector Target = GetActorLocation() + FVector(0, 0, 220);
	const FRotator R(Pitch, Yaw, 0);
	Cam->SetWorldLocation(Target - R.Vector() * Dist);
	Cam->SetWorldRotation(R);
}
