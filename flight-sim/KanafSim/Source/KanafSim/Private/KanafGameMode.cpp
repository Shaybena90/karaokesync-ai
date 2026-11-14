#include "KanafGameMode.h"

#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Widgets/SWeakWidget.h"
#include "KanafAircraftPawn.h"
#include "KanafConvert.h"
#include "KanafGameSubsystem.h"
#include "KanafHangar.h"
#include "KanafHUD.h"
#include "KanafSettings.h"
#include "KanafTerrainProviders.h"
#include "KanafSim.h"
#include "KanafWorldActors.h"

AKanafGameMode::AKanafGameMode()
{
	DefaultPawnClass = AKanafHangarPawn::StaticClass();
	HUDClass = AKanafHUD::StaticClass();
}

void AKanafGameMode::BeginPlay()
{
	Super::BeginPlay();
	Data = GetGameInstance()->GetSubsystem<UKanafGameSubsystem>();
	KanafUI::LoadStrings(UKanafGameSubsystem::DataDir());
	EnterMenu();
}

void AKanafGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	HideMenu();
	if (Overlay.IsValid() && GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(Overlay.ToSharedRef());
	Overlay.Reset();
	Super::EndPlay(Reason);
}

void AKanafGameMode::SetUiInput(bool bUi)
{
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!PC) return;
	if (bUi)
	{
		FInputModeGameAndUI M;
		M.SetHideCursorDuringCapture(false);
		M.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		if (Menu.IsValid()) M.SetWidgetToFocus(Menu);
		PC->SetInputMode(M);
		PC->bShowMouseCursor = true;
	}
	else
	{
		PC->SetInputMode(FInputModeGameOnly());
		PC->bShowMouseCursor = false;
	}
}

void AKanafGameMode::ShowMenu(EKanafScreen S)
{
	if (!GEngine || !GEngine->GameViewport) return;
	if (!Menu.IsValid())
	{
		SAssignNew(Menu, SKanafMenu).GameMode(this).Data(Data);
		MenuHost = SNew(SWeakWidget).PossiblyNullContent(Menu);
		GEngine->GameViewport->AddViewportWidgetContent(MenuHost.ToSharedRef(), 10);
	}
	Menu->SetScreen(S);
	SetUiInput(true);
}

void AKanafGameMode::HideMenu()
{
	if (MenuHost.IsValid() && GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(MenuHost.ToSharedRef());
	MenuHost.Reset();
	Menu.Reset();
}

void AKanafGameMode::ClearFlightWorld()
{
	if (Overlay.IsValid() && GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(Overlay.ToSharedRef());
	Overlay.Reset();
	for (AActor* A : WorldActors) if (IsValid(A)) A->Destroy();
	WorldActors.Reset();
	if (IsValid(FlightPawn)) FlightPawn->Destroy();
	FlightPawn = nullptr;
	if (bPaused) { UGameplayStatics::SetGamePaused(this, false); bPaused = false; }
}

void AKanafGameMode::EnterMenu()
{
	ClearFlightWorld();
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!IsValid(Hangar))
	{
		Hangar = PC ? Cast<AKanafHangarPawn>(PC->GetPawn()) : nullptr;
		if (!Hangar) Hangar = GetWorld()->SpawnActor<AKanafHangarPawn>(FVector::ZeroVector, FRotator::ZeroRotator);
	}
	if (PC && PC->GetPawn() != Hangar) PC->Possess(Hangar);
	Hangar->SetActorHiddenInGame(false);
	Hangar->BuildScene(Data);
	ShowMenu(EKanafScreen::Main);
}

void AKanafGameMode::RefreshHangarModel() { if (IsValid(Hangar)) Hangar->BuildScene(Data); }
void AKanafGameMode::OnMenuScreenChanged(EKanafScreen S) { if (S == EKanafScreen::Aircraft || S == EKanafScreen::Loadout) RefreshHangarModel(); }
void AKanafGameMode::OnBindingsChanged() { if (IsValid(FlightPawn)) FlightPawn->RebuildInputMapping(); }

void AKanafGameMode::StartFlight()
{
	ClearFlightWorld();
	HideMenu();
	if (IsValid(Hangar)) Hangar->SetActorHiddenInGame(true);
	UWorld* W = GetWorld();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	FlightPawn = W->SpawnActor<AKanafAircraftPawn>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	FString Err;
	if (!FlightPawn || !FlightPawn->InitFlight(Data, Err))
	{
		UE_LOG(LogKanaf, Error, TEXT("Cannot start flight: %s"), *Err);
		if (FlightPawn) FlightPawn->Destroy();
		FlightPawn = nullptr;
		if (IsValid(Hangar)) Hangar->SetActorHiddenInGame(false);
		ShowMenu(EKanafScreen::Briefing);
		return;
	}
	const kanaf::FlightSession& S = FlightPawn->Session();
	const double Hour = Data->LocalHourFor(Data->Selection.TimeOfDayId);
	TArray<AActor*> Env;
	KanafEnvironment::Spawn(W, S.base->lat, S.base->lon, Hour, S.base->elevationM, Env);
	for (AActor* A : Env) WorldActors.Add(A);
	const KanafEnvironment::FSun Sun = KanafEnvironment::SolarPosition(S.base->lat, S.base->lon, Hour, FDateTime::Now().GetDayOfYear());
	FlightPawn->SunElevationDeg = Sun.ElevationDeg;

	// Optional photorealistic visual layer (plugin). Physics always uses the core ground model.
	bool bExternalVisuals = false;
	for (const TSharedRef<IKanafVisualTerrainProvider>& Prov : FKanafTerrainProviderRegistry::Get())
	{
		FString Why;
		if (!Prov->IsAvailable(Why)) { UE_LOG(LogKanaf, Log, TEXT("Visual terrain provider %s unavailable: %s"), *Prov->Id().ToString(), *Why); continue; }
		if (AActor* A = Prov->Spawn(W, S.base->lat, S.base->lon, S.base->elevationM + S.config.geoidUndulationM))
		{
			WorldActors.Add(A);
			bExternalVisuals = true;
			UE_LOG(LogKanaf, Log, TEXT("Visual terrain provider: %s"), *Prov->Id().ToString());
			break;
		}
	}
	AKanafTerrainActor* Terrain = W->SpawnActor<AKanafTerrainActor>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	double Fallback = S.base->elevationM;
	for (const kanaf::RunwayDef& R : S.base->runways) for (const kanaf::RunwayEnd& E : R.ends) if (E.hasElevation) Fallback = FMath::Min(Fallback, E.elevationM);
	Terrain->Init(&S.ground, Data->Dem(), S.base->lat, S.base->lon, 60.0, Data->Settings()->TerrainDetail, Fallback - 0.5);
	Terrain->SetActorHiddenInGame(bExternalVisuals);  // DEM mesh stays as the fallback layer
	WorldActors.Add(Terrain);
	AKanafRunwayActor* Rw = W->SpawnActor<AKanafRunwayActor>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	Rw->Build(S, Data->Catalog(), Sun.ElevationDeg < -4);
	WorldActors.Add(Rw);

	if (APlayerController* PC = W->GetFirstPlayerController()) PC->Possess(FlightPawn);
	SAssignNew(Overlay, SKanafFlightOverlay).Pawn(FlightPawn).Data(Data);
	if (GEngine && GEngine->GameViewport) GEngine->GameViewport->AddViewportWidgetContent(Overlay.ToSharedRef(), 5);
	SetUiInput(false);
	UE_LOG(LogKanaf, Log, TEXT("Flight started: %s at %s runway %s, mission %s"), *Data->Selection.AircraftId, *Data->Selection.BaseId,
	       *KanafConv::ToF(S.activeRunwayEnd), *Data->Selection.MissionId);
}

void AKanafGameMode::RestartFlight()
{
	if (bPaused) TogglePauseMenu();
	if (IsValid(FlightPawn)) FlightPawn->ResetFlight();
}

void AKanafGameMode::ShowSummary()
{
	if (Overlay.IsValid() && GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(Overlay.ToSharedRef());
	Overlay.Reset();
	ShowMenu(EKanafScreen::Summary);
}

void AKanafGameMode::TogglePauseMenu()
{
	if (!IsValid(FlightPawn)) return;
	bPaused = !bPaused;
	UGameplayStatics::SetGamePaused(this, bPaused);
	if (bPaused) ShowMenu(EKanafScreen::Pause);
	else { HideMenu(); SetUiInput(false); }
}

void AKanafGameMode::EndMissionByPlayer()
{
	if (!IsValid(FlightPawn)) return;
	if (bPaused) { UGameplayStatics::SetGamePaused(this, false); bPaused = false; }
	kanaf::MissionRuntime M = FlightPawn->Mission();
	M.endByPlayer();
	Data->LastSummary = M.summary();
	Data->bHasSummary = true;
	ShowSummary();
}

void AKanafGameMode::QuitGame()
{
	UKismetSystemLibrary::QuitGame(this, GetWorld()->GetFirstPlayerController(), EQuitPreference::Quit, false);
}
