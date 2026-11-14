// Owns all loaded game data (catalog, terrain grid, radio phrases/voices), the player's
// selections in the menu flow, persistent settings and the last mission summary.
#pragma once
#include <map>
#include <memory>
#include <string>

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Kanaf/Catalog.h"
#include "Kanaf/Mission.h"
#include "Kanaf/Radio.h"
#include "Kanaf/RadioAudio.h"
#include "Kanaf/Terrain.h"
#include "KanafGameSubsystem.generated.h"

class UKanafSettingsSave;

USTRUCT()
struct FKanafSelection
{
	GENERATED_BODY()
	UPROPERTY() FString AircraftId = TEXT("f16i");
	UPROPERTY() FString LoadoutId = TEXT("f16i_clean");
	UPROPERTY() FString BaseId = TEXT("ramon");
	UPROPERTY() FString RunwayEnd = TEXT("auto");
	UPROPERTY() FString MissionId = TEXT("pattern_practice");
	UPROPERTY() FString TimeOfDayId = TEXT("noon");
};

UCLASS()
class KANAFSIM_API UKanafGameSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	static FString DataDir();  // <Project>/Content/KanafData

	const kanaf::Catalog& Catalog() const { return Cat; }
	const kanaf::HeightGridProvider* Dem() const { return bDemLoaded ? &DemGrid : nullptr; }
	const FString& DemError() const { return DemErr; }
	const kanaf::RadioPhrasebook& Phrasebook() const { return Phrases; }
	const kanaf::RadioVoiceBank& Voices() const { return VoiceBank; }
	bool IsDataValid() const { return bCatalogOk; }
	const TArray<FString>& LoadErrors() const { return Errors; }
	int32 MissingVoiceClips() const { return MissingClips; }
	double LocalHourFor(const FString& TimeOfDayId) const;

	UPROPERTY() FKanafSelection Selection;
	UKanafSettingsSave* Settings() const { return SettingsObj; }
	void SaveSettings();
	void ApplyGraphicsSettings();

	kanaf::MissionSummary LastSummary;
	bool bHasSummary = false;

private:
	bool LoadBytes(const FString& Rel, std::string& Out);
	kanaf::Catalog Cat;
	kanaf::HeightGridProvider DemGrid;
	kanaf::RadioPhrasebook Phrases;
	kanaf::RadioVoiceBank VoiceBank;
	bool bCatalogOk = false, bDemLoaded = false;
	FString DemErr;
	TArray<FString> Errors;
	int32 MissingClips = 0;
	UPROPERTY() TObjectPtr<UKanafSettingsSave> SettingsObj;
};
