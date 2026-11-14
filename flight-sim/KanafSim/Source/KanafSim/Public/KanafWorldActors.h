// Runtime-built world: DEM terrain (chunked procedural mesh with distance LOD and progressive
// streaming), schematic runways from OurAirports data, and environment (sun/sky/fog/clouds).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Kanaf/Session.h"
#include "KanafWorldActors.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;

UCLASS()
class KANAFSIM_API AKanafTerrainActor : public AActor
{
	GENERATED_BODY()
public:
	AKanafTerrainActor();
	// Ground is the session's GroundModel (DEM + runway flattening) so visuals == physics.
	void Init(const kanaf::GroundModel* Ground, const kanaf::HeightGridProvider* Dem, double CenterLat, double CenterLon, double RadiusKm, float DetailScale, double FallbackHeightM);
	virtual void Tick(float Dt) override;
	int32 PendingChunks() const { return Queue.Num(); }
	int32 BuiltChunks() const { return Built; }
	bool IsFallback() const { return bFallback; }

private:
	struct FChunk { int32 R0 = 0, C0 = 0; int32 Lod = -1; int32 Wanted = 0; int32 Section = -1; FVector CenterUe; };
	void BuildChunk(FChunk& Ch);
	void BuildFallbackPlane(double HeightM);
	int32 LodFor(double DistM) const;
	FLinearColor ColorFor(double H, double Slope, kanaf::SurfaceType S) const;

	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Mesh;
	UPROPERTY() TObjectPtr<UMaterialInterface> Material;
	const kanaf::GroundModel* Ground = nullptr;
	const kanaf::HeightGridProvider* Dem = nullptr;
	TArray<FChunk> Chunks;
	TArray<int32> Queue;
	double LatStep = 0, LonStep = 0, North = 0, West = 0;
	int32 ChunkCells = 64, Built = 0;
	float Detail = 1.f;
	float UpdateTimer = 0.f;
	bool bFallback = false;
};

UCLASS()
class KANAFSIM_API AKanafRunwayActor : public AActor
{
	GENERATED_BODY()
public:
	AKanafRunwayActor();
	void Build(const kanaf::FlightSession& Session, const kanaf::Catalog& Cat, bool bNight);
private:
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Mesh;
};

namespace KanafEnvironment
{
	struct FSun { double ElevationDeg = 45, AzimuthDeg = 180; };
	// Approximate solar position (NOAA-style simplified) for a local clock hour (Israel standard time UTC+2).
	FSun SolarPosition(double LatDeg, double LonDeg, double LocalHour, int32 DayOfYear, double UtcOffsetH = 2.0);
	// Spawns sun/moon, sky atmosphere, sky light, height fog, volumetric clouds and post-process.
	void Spawn(UWorld* World, double LatDeg, double LonDeg, double LocalHour, double OriginMslM, TArray<AActor*>& OutActors);
}
