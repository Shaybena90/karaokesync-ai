// The flyable aircraft. All flight physics run in the engine-independent core
// (kanaf::FlightSession); this pawn maps input, cameras, visuals, audio, mission and radio.
#pragma once
#include <memory>

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "Kanaf/Mission.h"
#include "Kanaf/Radio.h"
#include "Kanaf/Session.h"
#include "KanafPlaceholderModel.h"
#include "KanafAircraftPawn.generated.h"

class UCameraComponent;
class UAudioComponent;
class UInputAction;
class UInputMappingContext;
class UKanafEngineSound;
class UKanafGameSubsystem;

UENUM()
enum class EKanafView : uint8 { Cockpit, Chase };

UCLASS()
class KANAFSIM_API AKanafAircraftPawn : public APawn
{
	GENERATED_BODY()
public:
	AKanafAircraftPawn();
	bool InitFlight(UKanafGameSubsystem* Sub, FString& OutError);
	virtual void Tick(float Dt) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PIC) override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void UnPossessed() override;
	void RebuildInputMapping();  // after key rebinding

	// --- read-only accessors for HUD / UI
	const kanaf::FlightSession& Session() const { return Sess; }
	const kanaf::MissionRuntime& Mission() const { return Mis; }
	kanaf::RadioDirector& Radio() { return Rad; }
	const kanaf::ControlInputs& Inputs() const { return In; }
	EKanafView View() const { return ViewMode; }
	bool InstrumentLightsOn() const { return bInstrumentLights; }
	bool IsRadioMenuOpen() const { return bRadioMenu; }
	bool IsHelpOpen() const { return bHelp; }
	float SmoothedFps() const { return Fps; }
	float HeadYawDeg() const { return HeadYaw; }
	float HeadPitchDeg() const { return HeadPitch; }
	float CockpitFov() const;
	const FString& SubtitleSpeaker() const { return SubSpeaker; }
	const FString& SubtitleText() const { return SubText; }
	bool HasSubtitle() const { return SubTimer > 0.f; }
	double SunElevationDeg = 45.0;
	TArray<FString> Warnings;  // active warnings (English instrument captions)

	void ResetFlight();
	void ChooseRadioReply(int32 Index);  // 0-based

private:
	void BuildInput();
	float Axis(FName Action) const;
	void HandleEvents(const std::vector<kanaf::SimEventRecord>& Ev);
	void UpdateCamera(float Dt);
	void UpdateAudio(float Dt);
	void UpdateRadio(float Dt);
	void UpdateWarnings();
	void WritePerfLog(float Dt);
	// discrete actions
	void OnGear(); void OnSpeedbrake(); void OnParking(); void OnCanopy(); void OnCamera(); void OnRadioMenu();
	void OnReply1(); void OnReply2(); void OnReply3(); void OnAck(); void OnRepeat(); void OnChannel();
	void OnLights(); void OnReset(); void OnPause(); void OnHelp(); void OnControlMode(); void OnLookCenter();

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<USceneComponent> ModelRoot;
	UPROPERTY() TObjectPtr<UCameraComponent> CockpitCam;
	UPROPERTY() TObjectPtr<UCameraComponent> ChaseCam;
	UPROPERTY() TObjectPtr<UAudioComponent> EngineAudio;
	UPROPERTY() TObjectPtr<UAudioComponent> RadioAudio;
	UPROPERTY() TObjectPtr<UKanafEngineSound> EngineSound;
	UPROPERTY() TObjectPtr<UInputMappingContext> Mapping;
	UPROPERTY() TMap<FName, TObjectPtr<UInputAction>> Actions;
	UPROPERTY() TObjectPtr<UKanafGameSubsystem> Data;

	TWeakObjectPtr<class UEnhancedInputComponent> BoundInput;
	FKanafAircraftParts Parts;
	kanaf::FlightSession Sess;
	kanaf::MissionRuntime Mis;
	kanaf::RadioDirector Rad;
	kanaf::ControlInputs In;
	kanaf::RadioFxSettings RadioFx;

	EKanafView ViewMode = EKanafView::Cockpit;
	float HeadYaw = 0, HeadPitch = -8, ChaseYaw = 180, ChasePitch = -12, ChaseDist = 2600;
	float LastThrottleAxis = -10.f;
	double Canopy = 0, CanopyTarget = 0;
	bool bInstrumentLights = false, bRadioMenu = false, bHelp = false, bEndRequested = false;
	float EndTimer = -1.f, Fps = 60.f, SubTimer = 0.f, PerfTimer = 0.f;
	FString SubSpeaker, SubText;
	TArray<float> FrameTimes;
};
