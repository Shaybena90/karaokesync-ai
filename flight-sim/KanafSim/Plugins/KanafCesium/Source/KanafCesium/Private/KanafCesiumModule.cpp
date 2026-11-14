// Google Photorealistic 3D Tiles via Cesium for Unreal (official renderer integration).
// - The API key is NEVER stored in the repository: it is read from the environment variable
//   KANAF_GOOGLE_MAPS_KEY or from <Project>/Saved/Config/KanafSecrets.ini ([Google] MapTilesKey=...).
// - Google requires its logo and data attributions on screen: Cesium's credit system shows them
//   (ShowCreditsOnScreen = true). Do not hide them.
// - No tiles are extracted or stored by this project. Review Cesium's request cache settings
//   against the current Map Tiles API policies before shipping.
// - Billing: Map Tiles API usage may incur cost; see docs/MAPS.md.
// STATUS: written against Cesium for Unreal 2.x; NOT compiled or tested in this repo's
// environment (no Unreal Engine, Cesium ion blocked, no API key). Verify axis alignment.
#include "Cesium3DTileset.h"
#include "CesiumGeoreference.h"
#include "Engine/World.h"
#include "HAL/PlatformMisc.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"
#include "KanafTerrainProviders.h"

namespace
{
	FString ReadKey()
	{
		FString Key = FPlatformMisc::GetEnvironmentVariable(TEXT("KANAF_GOOGLE_MAPS_KEY"));
		if (Key.IsEmpty())
		{
			const FString Ini = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Config"), TEXT("KanafSecrets.ini"));
			if (FPaths::FileExists(Ini))
			{
				FConfigFile Cfg;
				Cfg.Read(Ini);
				Cfg.GetString(TEXT("Google"), TEXT("MapTilesKey"), Key);
			}
		}
		return Key.TrimStartAndEnd();
	}

	class FGoogleTilesProvider : public IKanafVisualTerrainProvider
	{
	public:
		virtual FName Id() const override { return TEXT("google_photorealistic_3d_tiles"); }
		virtual bool IsAvailable(FString& Why) const override
		{
			if (ReadKey().IsEmpty()) { Why = TEXT("no API key (set KANAF_GOOGLE_MAPS_KEY or Saved/Config/KanafSecrets.ini)"); return false; }
			return true;
		}
		virtual AActor* Spawn(UWorld* W, double Lat, double Lon, double HEll) override
		{
			ACesiumGeoreference* Geo = W->SpawnActor<ACesiumGeoreference>();
			Geo->SetOriginPlacement(EOriginPlacement::CartographicOrigin);
			Geo->SetOriginLongitudeLatitudeHeight(FVector(Lon, Lat, HEll));
			// Cesium's Unreal frame is X=east, Y=south, Z=up; Kanaf uses X=north, Y=east.
			// A +90 deg yaw maps Cesium east -> Kanaf +Y and north -> Kanaf +X. VERIFY in-engine.
			Geo->SetActorRotation(FRotator(0, 90, 0));
			ACesium3DTileset* T = W->SpawnActor<ACesium3DTileset>();
			T->SetGeoreference(Geo);
			T->SetTilesetSource(ETilesetSource::FromUrl);
			T->SetUrl(TEXT("https://tile.googleapis.com/v1/3dtiles/root.json?key=") + ReadKey());
			T->SetShowCreditsOnScreen(true);
			T->SetCreatePhysicsMeshes(false);  // gameplay collision comes from the core ground model
			return T;
		}
	};
}

class FKanafCesiumModule : public IModuleInterface
{
public:
	virtual void StartupModule() override { FKanafTerrainProviderRegistry::Register(MakeShared<FGoogleTilesProvider>()); }
	virtual void ShutdownModule() override { FKanafTerrainProviderRegistry::Unregister(TEXT("google_photorealistic_3d_tiles")); }
};

IMPLEMENT_MODULE(FKanafCesiumModule, KanafCesium);
