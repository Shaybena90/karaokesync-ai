#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "KanafSettings.generated.h"

// One rebindable action: action id -> up to 3 keys (keyboard, gamepad, HOTAS axis/button).
USTRUCT()
struct FKanafBinding
{
	GENERATED_BODY()
	UPROPERTY() FName Action;
	UPROPERTY() TArray<FName> Keys;
	UPROPERTY() bool bNegate = false;  // for split axes (e.g. S = pitch down)
};

UCLASS()
class KANAFSIM_API UKanafSettingsSave : public USaveGame
{
	GENERATED_BODY()
public:
	static constexpr const TCHAR* SlotName = TEXT("KanafSettings");

	UPROPERTY() int32 Version = 1;
	// Graphics
	UPROPERTY() int32 QualityLevel = 2;      // 0 low .. 3 epic (engine scalability)
	UPROPERTY() bool bLumen = true;
	UPROPERTY() float TerrainDetail = 1.0f;  // 0.5 .. 2 (terrain LOD distance multiplier)
	// Audio
	UPROPERTY() float MasterVolume = 0.9f;
	UPROPERTY() float EngineVolume = 0.8f;
	UPROPERTY() float RadioVolume = 1.0f;
	UPROPERTY() float RadioNoise = 0.5f;
	UPROPERTY() float RadioEffect = 1.0f;
	// Radio / UI
	UPROPERTY() bool bSubtitles = true;
	UPROPERTY() bool bRadioAutoTune = true;
	UPROPERTY() bool bShowTutorial = true;
	// Controls
	UPROPERTY() bool bBeginnerMode = true;
	UPROPERTY() bool bInvertPitch = false;
	UPROPERTY() bool bThrottleAxisBipolar = true;  // HOTAS throttle reports -1..1 (true) or 0..1
	UPROPERTY() float MouseLookSensitivity = 0.15f;
	UPROPERTY() TArray<FKanafBinding> Bindings;     // empty => defaults

	static TArray<FKanafBinding> DefaultBindings();
};
