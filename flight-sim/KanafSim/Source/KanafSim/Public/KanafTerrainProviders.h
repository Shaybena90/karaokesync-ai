// Swappable VISUAL terrain providers. The default is the built-in DEM mesh (AKanafTerrainActor).
// Plugins (e.g. KanafCesium: Cesium for Unreal + Google Photorealistic 3D Tiles) register here.
// Physics/collision always use kanaf::GroundModel (DEM + runways), so gameplay never depends on
// a streaming service being reachable.
#pragma once
#include "CoreMinimal.h"

class UWorld;
class AActor;

class IKanafVisualTerrainProvider
{
public:
	virtual ~IKanafVisualTerrainProvider() = default;
	virtual FName Id() const = 0;
	virtual bool IsAvailable(FString& OutWhyNot) const = 0;
	// Origin = the session's GeoFrame origin. Must map: UE +X = north, +Y = east, +Z = up.
	virtual AActor* Spawn(UWorld* World, double OriginLatDeg, double OriginLonDeg, double OriginEllipsoidHeightM) = 0;
};

class KANAFSIM_API FKanafTerrainProviderRegistry
{
public:
	static void Register(const TSharedRef<IKanafVisualTerrainProvider>& P) { Get().Add(P); }
	static void Unregister(FName Id) { Get().RemoveAll([Id](const TSharedRef<IKanafVisualTerrainProvider>& P) { return P->Id() == Id; }); }
	static TArray<TSharedRef<IKanafVisualTerrainProvider>>& Get();
};
