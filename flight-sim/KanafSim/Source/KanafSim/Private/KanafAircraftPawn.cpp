#include "KanafAircraftPawn.h"

#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Kanaf/Geo.h"
#include "KanafAudio.h"
#include "KanafConvert.h"
#include "KanafGameMode.h"
#include "KanafGameSubsystem.h"
#include "KanafSettings.h"
#include "KanafSim.h"

using namespace KanafConv;

AKanafAircraftPawn::AKanafAircraftPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	ModelRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Model"));
	ModelRoot->SetupAttachment(Root);
	CockpitCam = CreateDefaultSubobject<UCameraComponent>(TEXT("CockpitCam"));
	CockpitCam->SetupAttachment(Root);
	CockpitCam->SetFieldOfView(80.f);
	ChaseCam = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCam"));
	ChaseCam->SetupAttachment(Root);
	ChaseCam->SetUsingAbsoluteLocation(true);
	ChaseCam->SetUsingAbsoluteRotation(true);
	ChaseCam->SetFieldOfView(75.f);
	ChaseCam->SetAutoActivate(false);
	EngineAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("EngineAudio"));
	EngineAudio->SetupAttachment(Root);
	EngineAudio->bAutoActivate = false;
	RadioAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("RadioAudio"));
	RadioAudio->SetupAttachment(Root);
	RadioAudio->bAutoActivate = false;
	RadioAudio->bIsUISound = true;  // radio is "in the headset": not spatialised
	AutoPossessPlayer = EAutoReceiveInput::Disabled;
}

bool AKanafAircraftPawn::InitFlight(UKanafGameSubsystem* Sub, FString& OutError)
{
	Data = Sub;
	const FKanafSelection& S = Sub->Selection;
	const UKanafSettingsSave* Set = Sub->Settings();
	kanaf::SessionConfig Cfg;
	Cfg.aircraftId = ToStd(S.AircraftId);
	Cfg.baseId = ToStd(S.BaseId);
	Cfg.runwayEnd = ToStd(S.RunwayEnd);
	Cfg.missionId = ToStd(S.MissionId);
	Cfg.loadoutPresetId = ToStd(S.LoadoutId);
	Cfg.controlMode = Set->bBeginnerMode ? kanaf::ControlMode::Beginner : kanaf::ControlMode::Advanced;
	std::string Err;
	if (!Sess.initWithProvider(Sub->Catalog(), Cfg, Sub->Dem(), ToStd(Sub->DemError()), Err))
	{
		OutError = ToF(Err);
		return false;
	}
	Mis.start(*Sess.mission, Sess);
	const kanaf::CallsignDef* Cs = Sub->Catalog().callsign(Sess.mission->callsignId.empty() ? "ofroni" : Sess.mission->callsignId);
	kanaf::RadioContext Ctx{Cs ? Cs->id : "ofroni", Cs ? Cs->he : "עפרוני", Sess.base->id, Sess.base->shortHe, Sess.activeRunwayEnd};
	Rad.init(&Sub->Phrasebook(), Ctx, Sess.mission->type == "takeoff_landing" || Sess.mission->type == "free_flight");
	Rad.setAutoTune(Set->bRadioAutoTune);

	KanafModel::BuildF16Placeholder(this, ModelRoot, Sub->Catalog(), Sess.stations, Parts);
	CockpitCam->SetRelativeLocation(BodyToLocal(Sess.fm.profile().eyePoint));
	// Simple cockpit frame (game representation, not a reconstruction of the F-16I panel)
	const FLinearColor Panel(0.04f, 0.045f, 0.05f);
	const kanaf::Vec3 E = Sess.fm.profile().eyePoint;
	KanafModel::AddShape(this, ModelRoot, TEXT("Cube"), BodyToLocal(kanaf::Vec3(E.x + 0.75, 0, E.z + 0.42)), FRotator(-25, 0, 0), FVector(0.25, 0.75, 0.35), Panel);
	KanafModel::AddShape(this, ModelRoot, TEXT("Cube"), BodyToLocal(kanaf::Vec3(E.x + 0.55, 0, E.z + 0.1)), FRotator(35, 0, 0), FVector(0.01, 0.16, 0.14), FLinearColor(0.1f, 0.25f, 0.15f));  // HUD combiner

	EngineSound = NewObject<UKanafEngineSound>(this);
	EngineAudio->SetSound(EngineSound);
	EngineAudio->Play();
	RadioFx.noiseLevel = Set->RadioNoise;
	RadioFx.effectStrength = Set->RadioEffect;
	RadioFx.volume = 1.0;
	SetActorLocationAndRotation(NedToUe(Sess.fm.state().pos), AttToUe(Sess.fm.state().att));
	return true;
}

// ---------------------------------------------------------------------------------------------
// Input (Enhanced Input objects are created at runtime from the saved, rebindable bindings)
// ---------------------------------------------------------------------------------------------

static bool IsAxisAction(FName A)
{
	static const TSet<FName> Axes = {"PitchUp", "PitchDown", "PitchAxis", "RollLeft", "RollRight", "RollAxis", "YawLeft", "YawRight", "YawAxis",
	                                 "ThrottleUp", "ThrottleDown", "ThrottleAxis", "Brakes", "LookHold", "LookX", "LookY"};
	return Axes.Contains(A);
}

void AKanafAircraftPawn::BuildInput()
{
	Mapping = NewObject<UInputMappingContext>(this);
	Actions.Reset();
	for (const FKanafBinding& B : Data->Settings()->Bindings)
	{
		UInputAction* IA = NewObject<UInputAction>(this, MakeUniqueObjectName(this, UInputAction::StaticClass(), B.Action));
		IA->ValueType = IsAxisAction(B.Action) ? EInputActionValueType::Axis1D : EInputActionValueType::Boolean;
		Actions.Add(B.Action, IA);
		for (const FName& K : B.Keys)
		{
			const FKey Key(K);
			if (!Key.IsValid()) continue;  // e.g. HOTAS keys when RawInput is not configured
			FEnhancedActionKeyMapping& Map = Mapping->MapKey(IA, Key);
			if (Key.IsAnalog() && !Key.IsMouseButton() && K != FName("MouseX") && K != FName("MouseY"))
			{
				UInputModifierDeadZone* DZ = NewObject<UInputModifierDeadZone>(Mapping);
				DZ->LowerThreshold = 0.06f;
				Map.Modifiers.Add(DZ);
			}
			if (B.bNegate) Map.Modifiers.Add(NewObject<UInputModifierNegate>(Mapping));
		}
	}
}

void AKanafAircraftPawn::RebuildInputMapping()
{
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (Mapping) Sub->RemoveMappingContext(Mapping);
			BuildInput();
			Sub->AddMappingContext(Mapping, 0);
			if (InputComponent) SetupPlayerInputComponent(InputComponent);
		}
	}
}

void AKanafAircraftPawn::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	if (APlayerController* PC = Cast<APlayerController>(NewController))
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (!Mapping) BuildInput();
			Sub->AddMappingContext(Mapping, 0);
		}
}

void AKanafAircraftPawn::UnPossessed()
{
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
			if (Mapping) Sub->RemoveMappingContext(Mapping);
	Super::UnPossessed();
}

void AKanafAircraftPawn::SetupPlayerInputComponent(UInputComponent* PIC)
{
	Super::SetupPlayerInputComponent(PIC);
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PIC);
	if (!EIC || !Data) return;
	if (!Mapping) BuildInput();
	EIC->ClearActionBindings();
	EIC->ClearActionValueBindings();
	for (auto& KV : Actions)
		if (IsAxisAction(KV.Key)) EIC->BindActionValue(KV.Value);
	BoundInput = EIC;
	auto Bind = [&](const TCHAR* Name, void (AKanafAircraftPawn::*Fn)()) {
		if (TObjectPtr<UInputAction>* A = Actions.Find(FName(Name))) EIC->BindAction(A->Get(), ETriggerEvent::Started, this, Fn);
	};
	Bind(TEXT("Gear"), &AKanafAircraftPawn::OnGear);
	Bind(TEXT("Speedbrake"), &AKanafAircraftPawn::OnSpeedbrake);
	Bind(TEXT("ParkingBrake"), &AKanafAircraftPawn::OnParking);
	Bind(TEXT("Canopy"), &AKanafAircraftPawn::OnCanopy);
	Bind(TEXT("CameraToggle"), &AKanafAircraftPawn::OnCamera);
	Bind(TEXT("RadioMenu"), &AKanafAircraftPawn::OnRadioMenu);
	Bind(TEXT("RadioReply1"), &AKanafAircraftPawn::OnReply1);
	Bind(TEXT("RadioReply2"), &AKanafAircraftPawn::OnReply2);
	Bind(TEXT("RadioReply3"), &AKanafAircraftPawn::OnReply3);
	Bind(TEXT("RadioAck"), &AKanafAircraftPawn::OnAck);
	Bind(TEXT("RadioRepeat"), &AKanafAircraftPawn::OnRepeat);
	Bind(TEXT("RadioChannel"), &AKanafAircraftPawn::OnChannel);
	Bind(TEXT("InstrumentLights"), &AKanafAircraftPawn::OnLights);
	Bind(TEXT("ResetFlight"), &AKanafAircraftPawn::OnReset);
	Bind(TEXT("Pause"), &AKanafAircraftPawn::OnPause);
	Bind(TEXT("Help"), &AKanafAircraftPawn::OnHelp);
	Bind(TEXT("ControlMode"), &AKanafAircraftPawn::OnControlMode);
	Bind(TEXT("LookCenter"), &AKanafAircraftPawn::OnLookCenter);
}

float AKanafAircraftPawn::Axis(FName A) const
{
	// Query by action (never keep pointers into the component's binding array: it reallocates).
	const TObjectPtr<UInputAction>* IA = Actions.Find(A);
	if (!IA || !BoundInput.IsValid()) return 0.f;
	return BoundInput->GetBoundActionValue(IA->Get()).Get<float>();
}

float AKanafAircraftPawn::CockpitFov() const { return CockpitCam ? CockpitCam->FieldOfView : 80.f; }

void AKanafAircraftPawn::OnGear() { In.gearDown = !In.gearDown; }
void AKanafAircraftPawn::OnSpeedbrake() { In.speedbrake = In.speedbrake > 0.5 ? 0.0 : 1.0; }
void AKanafAircraftPawn::OnParking() { In.parkingBrake = !In.parkingBrake; }
void AKanafAircraftPawn::OnCanopy()
{
	// Canopy may only open when stopped on the ground.
	if (Sess.fm.data().weightOnWheels && Sess.fm.data().groundSpeed < 1.0) CanopyTarget = CanopyTarget > 0.5 ? 0.0 : 1.0;
}
void AKanafAircraftPawn::OnCamera()
{
	ViewMode = ViewMode == EKanafView::Cockpit ? EKanafView::Chase : EKanafView::Cockpit;
	CockpitCam->SetActive(ViewMode == EKanafView::Cockpit);
	ChaseCam->SetActive(ViewMode == EKanafView::Chase);
	if (EngineSound) EngineSound->bInCockpit = ViewMode == EKanafView::Cockpit;
}
void AKanafAircraftPawn::OnRadioMenu() { bRadioMenu = !bRadioMenu; }
void AKanafAircraftPawn::ChooseRadioReply(int32 Index)
{
	const std::vector<kanaf::RadioReplyDef> R = Rad.availableReplies();
	if (Index >= 0 && Index < int32(R.size())) Rad.chooseReply(R[size_t(Index)].id);
	bRadioMenu = false;
}
void AKanafAircraftPawn::OnReply1() { if (bRadioMenu) ChooseRadioReply(0); }
void AKanafAircraftPawn::OnReply2() { if (bRadioMenu) ChooseRadioReply(1); }
void AKanafAircraftPawn::OnReply3() { if (bRadioMenu) ChooseRadioReply(2); }
void AKanafAircraftPawn::OnAck() { Rad.acknowledgeQuick(); }
void AKanafAircraftPawn::OnRepeat() { Rad.repeatLast(); }
void AKanafAircraftPawn::OnChannel()
{
	static const char* Ch[] = {"tower", "control", "formation"};
	int32 i = 0;
	for (int32 k = 0; k < 3; ++k) if (Rad.playerChannel() == Ch[k]) i = k;
	Rad.setPlayerChannel(Ch[(i + 1) % 3]);
}
void AKanafAircraftPawn::OnLights() { bInstrumentLights = !bInstrumentLights; }
void AKanafAircraftPawn::OnReset() { ResetFlight(); }
void AKanafAircraftPawn::OnPause() { if (AKanafGameMode* GM = GetWorld()->GetAuthGameMode<AKanafGameMode>()) GM->TogglePauseMenu(); }
void AKanafAircraftPawn::OnHelp() { bHelp = !bHelp; }
void AKanafAircraftPawn::OnControlMode()
{
	Sess.fcs.setMode(Sess.fcs.mode() == kanaf::ControlMode::Beginner ? kanaf::ControlMode::Advanced : kanaf::ControlMode::Beginner);
}
void AKanafAircraftPawn::OnLookCenter() { HeadYaw = 0; HeadPitch = -8; }

void AKanafAircraftPawn::ResetFlight()
{
	Sess.resetToStart();
	Mis.start(*Sess.mission, Sess);
	kanaf::RadioContext Ctx{"", "", "", "", ""};
	const kanaf::CallsignDef* Cs = Data->Catalog().callsign(Sess.mission->callsignId.empty() ? "ofroni" : Sess.mission->callsignId);
	Ctx = {Cs ? Cs->id : "ofroni", Cs ? Cs->he : "עפרוני", Sess.base->id, Sess.base->shortHe, Sess.activeRunwayEnd};
	Rad.init(&Data->Phrasebook(), Ctx, Sess.mission->type == "takeoff_landing" || Sess.mission->type == "free_flight");
	Rad.setAutoTune(Data->Settings()->bRadioAutoTune);
	In = kanaf::ControlInputs();
	CanopyTarget = Canopy = 0;
	EndTimer = -1.f;
	bEndRequested = false;
	if (RadioAudio) RadioAudio->Stop();
}

// ---------------------------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------------------------

void AKanafAircraftPawn::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!Data) return;
	Fps = FMath::Lerp(Fps, Dt > 0 ? 1.f / Dt : 60.f, 0.05f);
	const UKanafSettingsSave* Set = Data->Settings();
	const float Sim = FMath::Min(Dt, 0.05f);  // avoid huge steps after hitches

	// --- inputs -> pilot controls
	const float Inv = Set->bInvertPitch ? -1.f : 1.f;
	In.pitch = FMath::Clamp(Inv * (Axis("PitchUp") - Axis("PitchDown") - Axis("PitchAxis")), -1.f, 1.f);
	In.roll = FMath::Clamp(Axis("RollRight") - Axis("RollLeft") + Axis("RollAxis"), -1.f, 1.f);
	In.yaw = FMath::Clamp(Axis("YawRight") - Axis("YawLeft") + Axis("YawAxis"), -1.f, 1.f);
	const float Ta = Axis("ThrottleAxis");
	if (FMath::Abs(Ta - LastThrottleAxis) > 0.02f && LastThrottleAxis > -5.f)
		In.throttle = Set->bThrottleAxisBipolar ? (1.0 - Ta) * 0.5 : Ta;  // HOTAS lever (absolute)
	LastThrottleAxis = Ta;
	In.throttle = FMath::Clamp(In.throttle + (Axis("ThrottleUp") - Axis("ThrottleDown")) * 0.45 * Sim, 0.0, 1.0);
	const float Brk = Axis("Brakes");
	In.brakeLeft = In.brakeRight = Brk;

	// --- simulation
	Sess.tick(Sim, In);
	std::vector<kanaf::SimEventRecord> Ev = Sess.fm.takeEvents();
	Mis.update(Sim, Sess, Ev);
	std::vector<kanaf::MissionEvent> MEv = Mis.takeEvents();
	Rad.update(Sim, Sess, Ev, MEv, &Mis);
	HandleEvents(Ev);

	// --- transform & visuals
	const kanaf::AircraftState& St = Sess.fm.state();
	SetActorLocationAndRotation(NedToUe(St.pos), AttToUe(St.att));
	Canopy = kanaf::approach(Canopy, CanopyTarget, Sim / 4.0);
	KanafModel::Animate(Parts, St.de, St.da, St.dr, St.flapPos, St.sbPos, St.gearPos, Canopy, St.abLevel);

	UpdateCamera(Dt);
	UpdateAudio(Dt);
	UpdateRadio(Dt);
	UpdateWarnings();
	WritePerfLog(Dt);

	// --- mission end -> summary
	if (Mis.result() != kanaf::MissionResult::Running && EndTimer < 0.f) EndTimer = St.crashed ? 4.f : 6.f;
	if (EndTimer > 0.f)
	{
		EndTimer -= Dt;
		if (EndTimer <= 0.f && !bEndRequested)
		{
			bEndRequested = true;
			Data->LastSummary = Mis.summary();
			Data->bHasSummary = true;
			if (AKanafGameMode* GM = GetWorld()->GetAuthGameMode<AKanafGameMode>()) GM->ShowSummary();
		}
	}
}

void AKanafAircraftPawn::HandleEvents(const std::vector<kanaf::SimEventRecord>& Ev)
{
	for (const kanaf::SimEventRecord& E : Ev)
	{
		switch (E.type)
		{
			case kanaf::SimEvent::Crash: UE_LOG(LogKanaf, Log, TEXT("Crash: %s (%.2f)"), *ToF(E.detail), E.value); break;
			case kanaf::SimEvent::Touchdown: UE_LOG(LogKanaf, Log, TEXT("Touchdown: sink %.2f m/s on %s"), E.value, *ToF(E.detail)); break;
			default: break;
		}
	}
}

void AKanafAircraftPawn::UpdateCamera(float Dt)
{
	const UKanafSettingsSave* Set = Data->Settings();
	const bool bLook = Axis("LookHold") > 0.5f;
	const float Lx = Axis("LookX"), Ly = Axis("LookY");
	if (ViewMode == EKanafView::Cockpit)
	{
		// Free head movement: hold RMB + mouse, or right stick.
		if (bLook) { HeadYaw += Lx * Set->MouseLookSensitivity * 10.f; HeadPitch += Ly * Set->MouseLookSensitivity * 10.f; }
		else if (FMath::Abs(Lx) > 0.2f || FMath::Abs(Ly) > 0.2f) { HeadYaw += Lx * 120.f * Dt; HeadPitch += Ly * 90.f * Dt; }
		HeadYaw = FMath::Clamp(HeadYaw, -155.f, 155.f);
		HeadPitch = FMath::Clamp(HeadPitch, -60.f, 85.f);
		// small G-induced head offset for a sense of load (game effect)
		const float GOffset = float(FMath::Clamp(Sess.fm.data().nz - 1.0, -2.0, 8.0)) * -0.6f;
		CockpitCam->SetRelativeLocation(BodyToLocal(Sess.fm.profile().eyePoint) + FVector(0, 0, GOffset));
		CockpitCam->SetRelativeRotation(FRotator(HeadPitch, HeadYaw, 0));
	}
	else
	{
		if (bLook || FMath::Abs(Lx) > 0.2f || FMath::Abs(Ly) > 0.2f)
		{
			ChaseYaw += Lx * (bLook ? Set->MouseLookSensitivity * 10.f : 120.f * Dt);
			ChasePitch = FMath::Clamp(ChasePitch + Ly * (bLook ? Set->MouseLookSensitivity * 10.f : 90.f * Dt), -80.f, 60.f);
		}
		const FRotator Base(0, GetActorRotation().Yaw + ChaseYaw, 0);
		const FRotator R = Base + FRotator(ChasePitch, 0, 0);
		const FVector Target = GetActorLocation();
		ChaseCam->SetWorldLocation(FMath::VInterpTo(ChaseCam->GetComponentLocation(), Target - R.Vector() * ChaseDist, Dt, 12.f));
		ChaseCam->SetWorldRotation((Target - ChaseCam->GetComponentLocation()).Rotation());
	}
}

void AKanafAircraftPawn::UpdateAudio(float Dt)
{
	if (!EngineSound) return;
	const UKanafSettingsSave* Set = Data->Settings();
	const kanaf::AircraftState& St = Sess.fm.state();
	EngineSound->Rpm = float(St.spool);
	EngineSound->Afterburner = float(St.abLevel);
	EngineSound->AirspeedMs = float(Sess.fm.data().tas);
	EngineSound->EngineGain = Set->EngineVolume * Set->MasterVolume * (St.crashed ? 0.f : 1.f);
	EngineSound->WindGain = 0.6f * Set->MasterVolume;
}

void AKanafAircraftPawn::UpdateRadio(float Dt)
{
	const UKanafSettingsSave* Set = Data->Settings();
	SubTimer = FMath::Max(0.f, SubTimer - Dt);
	kanaf::RadioTransmission Tx;
	if (Rad.startNext(Tx))
	{
		std::vector<std::string> Missing;
		kanaf::PcmBuffer Dry = Data->Voices().assemble(Tx, Data->Phrasebook(), &Missing);
		RadioFx.noiseLevel = Set->RadioNoise;
		RadioFx.effectStrength = Set->RadioEffect;
		kanaf::PcmBuffer Wet = kanaf::RadioFx::process(Dry, RadioFx, uint32(FPlatformTime::Cycles()));
		Rad.setCurrentDuration(Wet.seconds());  // radio channel is busy for exactly the audio length
		USoundWaveProcedural* Wave = KanafAudio::MakeRadioWave(this, Wet);
		RadioAudio->SetSound(Wave);
		RadioAudio->SetVolumeMultiplier(Set->RadioVolume * Set->MasterVolume);
		RadioAudio->Play();
		SubSpeaker = ToF(Tx.speakerHe) + TEXT(" · ") + ToF(Data->Phrasebook().channelNameHe(Tx.channel));
		SubText = ToF(Tx.subtitleHe);
		SubTimer = float(Wet.seconds()) + 2.5f;
		for (const std::string& M : Missing) UE_LOG(LogKanaf, Warning, TEXT("Radio clip missing: %s"), *ToF(M));
	}
}

void AKanafAircraftPawn::UpdateWarnings()
{
	Warnings.Reset();
	const kanaf::FlightData& D = Sess.fm.data();
	const kanaf::AircraftState& St = Sess.fm.state();
	if (St.crashed) { Warnings.Add(TEXT("CRASH")); return; }
	if (D.stallWarning) Warnings.Add(TEXT("AOA / STALL"));
	if (D.nz > Sess.fm.profile().maxG) Warnings.Add(TEXT("OVER-G"));
	if (!D.weightOnWheels && St.gearPos < 0.5 && D.wheelAgl < 300 && D.cas < 200 * kanaf::kKt2Ms && D.vsMs < 0) Warnings.Add(TEXT("GEAR"));
	if (!D.weightOnWheels && D.agl < 300 && D.vsMs < -25) Warnings.Add(TEXT("PULL UP"));
	if (St.fuelKg < 800) Warnings.Add(St.fuelKg < 450 ? TEXT("BINGO FUEL") : TEXT("FUEL LOW"));
	if (In.parkingBrake) Warnings.Add(TEXT("PARK BRK"));
	if (!D.groundDataReal) Warnings.Add(TEXT("TERRAIN: FALLBACK"));
}

void AKanafAircraftPawn::WritePerfLog(float Dt)
{
	FrameTimes.Add(Dt * 1000.f);
	PerfTimer += Dt;
	if (PerfTimer < 60.f) return;
	PerfTimer = 0.f;
	TArray<float> S = FrameTimes;
	S.Sort();
	float Avg = 0;
	for (float F : S) Avg += F;
	Avg /= FMath::Max(1, S.Num());
	const float P95 = S.Num() ? S[FMath::Min(S.Num() - 1, int32(S.Num() * 0.95f))] : 0.f;
	const FString Path = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Logs"), TEXT("KanafPerf.csv"));
	if (!IFileManager::Get().FileExists(*Path)) FFileHelper::SaveStringToFile(TEXT("utc,avg_ms,p95_ms,quality,lumen,gpu\n"), *Path);
	const FString Line = FString::Printf(TEXT("%s,%.2f,%.2f,%d,%d,%s\n"), *FDateTime::UtcNow().ToIso8601(), Avg, P95, Data->Settings()->QualityLevel,
	                                     Data->Settings()->bLumen ? 1 : 0, *FPlatformMisc::GetPrimaryGPUBrand());
	FFileHelper::SaveStringToFile(Line, *Path, FFileHelper::EEncodingOptions::AutoDetect, &IFileManager::Get(), FILEWRITE_Append);
	FrameTimes.Reset();
}
