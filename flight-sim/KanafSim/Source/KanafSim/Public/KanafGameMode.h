#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "KanafUI.h"
#include "KanafGameMode.generated.h"

class AKanafAircraftPawn;
class AKanafHangarPawn;
class UKanafGameSubsystem;

UCLASS()
class KANAFSIM_API AKanafGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	AKanafGameMode();
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	void EnterMenu();
	void StartFlight();
	void RestartFlight();
	void ShowSummary();
	void TogglePauseMenu();
	void EndMissionByPlayer();
	void QuitGame();
	void RefreshHangarModel();
	void OnBindingsChanged();
	void OnMenuScreenChanged(EKanafScreen S);
	bool IsFlying() const { return FlightPawn != nullptr; }

private:
	void ShowMenu(EKanafScreen S);
	void HideMenu();
	void ClearFlightWorld();
	void SetUiInput(bool bUi);

	UPROPERTY() TObjectPtr<UKanafGameSubsystem> Data;
	UPROPERTY() TObjectPtr<AKanafHangarPawn> Hangar;
	UPROPERTY() TObjectPtr<AKanafAircraftPawn> FlightPawn;
	UPROPERTY() TArray<TObjectPtr<AActor>> WorldActors;
	TSharedPtr<SKanafMenu> Menu;
	TSharedPtr<SWidget> MenuHost;
	TSharedPtr<SKanafFlightOverlay> Overlay;
	bool bPaused = false;
};
