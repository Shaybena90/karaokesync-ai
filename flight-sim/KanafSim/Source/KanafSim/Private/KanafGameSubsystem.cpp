#include "KanafGameSubsystem.h"

#include "GameFramework/GameUserSettings.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "KanafConvert.h"
#include "KanafSettings.h"
#include "KanafSim.h"

using namespace KanafConv;

FString UKanafGameSubsystem::DataDir() { return FPaths::Combine(FPaths::ProjectContentDir(), TEXT("KanafData")); }

bool UKanafGameSubsystem::LoadBytes(const FString& Rel, std::string& Out)
{
	TArray<uint8> Bytes;
	if (!FFileHelper::LoadFileToArray(Bytes, *FPaths::Combine(DataDir(), Rel))) return false;
	Out.assign(reinterpret_cast<const char*>(Bytes.GetData()), Bytes.Num());
	return true;
}

void UKanafGameSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	// --- Catalog (JSON, separate from code)
	std::map<std::string, std::string> Files;
	for (const std::string& F : kanaf::Catalog::requiredFiles())
	{
		std::string S;
		if (LoadBytes(FString(TEXT("Catalog/")) + ToF(F), S)) Files[F] = S;
		else Errors.Add(FString::Printf(TEXT("Missing catalog file %s"), *ToF(F)));
	}
	// flight profiles: load every file in Catalog/flight_profiles
	TArray<FString> Profiles;
	IFileManager::Get().FindFiles(Profiles, *FPaths::Combine(DataDir(), TEXT("Catalog/flight_profiles/*.json")), true, false);
	for (const FString& P : Profiles)
	{
		std::string S;
		if (LoadBytes(FString(TEXT("Catalog/flight_profiles/")) + P, S)) Files["flight_profiles/" + ToStd(P)] = S;
	}
	bCatalogOk = Cat.loadFromStrings(Files);
	for (const std::string& E : Cat.errors()) Errors.Add(ToF(E));
	for (const std::string& W : Cat.warnings()) UE_LOG(LogKanaf, Warning, TEXT("Catalog: %s"), *ToF(W));

	// --- Terrain grid (Copernicus DEM). Failure is non-fatal: sessions fall back to flat terrain.
	{
		std::string Meta, Raw;
		if (LoadBytes(TEXT("Terrain/negev_height.json"), Meta) && LoadBytes(TEXT("Terrain/negev_height.r16"), Raw))
		{
			std::string Err;
			std::vector<unsigned char> RawV(Raw.begin(), Raw.end());
			bDemLoaded = DemGrid.loadFromMemory(Meta, RawV, Err);
			if (!bDemLoaded) DemErr = ToF(Err);
		}
		else
		{
			DemErr = TEXT("terrain files missing");
		}
		if (!bDemLoaded) UE_LOG(LogKanaf, Warning, TEXT("Terrain DEM not loaded: %s"), *DemErr);
	}

	// --- Radio phrases + voice clips
	{
		std::string Text, Err;
		if (LoadBytes(TEXT("Radio/phrases.he.json"), Text) && Phrases.load(Text, Err))
		{
			for (const kanaf::RadioMessageDef& M : Phrases.messages)
			{
				for (const auto& Fr : Phrases.fragments)
				{
					if (VoiceBank.has(M.voice, Fr.first)) continue;
					std::string Bytes;
					if (!LoadBytes(FString::Printf(TEXT("Audio/Radio/%s/%s.wav"), *ToF(M.voice), *ToF(Fr.first)), Bytes)) continue;
					kanaf::PcmBuffer Pcm;
					std::string WErr;
					if (kanaf::decodeWav(std::vector<unsigned char>(Bytes.begin(), Bytes.end()), Pcm, WErr)) VoiceBank.add(M.voice, Fr.first, Pcm);
				}
			}
			UE_LOG(LogKanaf, Log, TEXT("Radio: %d voice clips loaded"), int32(VoiceBank.size()));
		}
		else
		{
			Errors.Add(FString::Printf(TEXT("Radio phrases: %s"), *ToF(Err)));
		}
	}

	// --- Settings
	if (UGameplayStatics::DoesSaveGameExist(UKanafSettingsSave::SlotName, 0))
		SettingsObj = Cast<UKanafSettingsSave>(UGameplayStatics::LoadGameFromSlot(UKanafSettingsSave::SlotName, 0));
	if (!SettingsObj) SettingsObj = Cast<UKanafSettingsSave>(UGameplayStatics::CreateSaveGameObject(UKanafSettingsSave::StaticClass()));
	if (SettingsObj->Bindings.Num() == 0) SettingsObj->Bindings = UKanafSettingsSave::DefaultBindings();
	ApplyGraphicsSettings();

	for (const FString& E : Errors) UE_LOG(LogKanaf, Error, TEXT("%s"), *E);
}

void UKanafGameSubsystem::SaveSettings()
{
	if (SettingsObj) UGameplayStatics::SaveGameToSlot(SettingsObj, UKanafSettingsSave::SlotName, 0);
}

void UKanafGameSubsystem::ApplyGraphicsSettings()
{
	if (!SettingsObj) return;
	if (UGameUserSettings* GUS = UGameUserSettings::GetGameUserSettings())
	{
		GUS->SetOverallScalabilityLevel(FMath::Clamp(SettingsObj->QualityLevel, 0, 3));
		GUS->ApplySettings(false);
	}
	if (IConsoleVariable* GI = IConsoleManager::Get().FindConsoleVariable(TEXT("r.DynamicGlobalIlluminationMethod")))
		GI->Set(SettingsObj->bLumen ? 1 : 0, ECVF_SetByGameSetting);
	if (IConsoleVariable* Refl = IConsoleManager::Get().FindConsoleVariable(TEXT("r.ReflectionMethod")))
		Refl->Set(SettingsObj->bLumen ? 1 : 2, ECVF_SetByGameSetting);
}

double UKanafGameSubsystem::LocalHourFor(const FString& Id) const
{
	const kanaf::Catalog& C = Cat;
	(void)C;
	if (Id == TEXT("dawn")) return 6.0;
	if (Id == TEXT("sunset")) return 17.4;
	if (Id == TEXT("night")) return 22.0;
	return 12.0;
}
