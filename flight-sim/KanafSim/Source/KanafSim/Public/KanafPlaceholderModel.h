// PLACEHOLDER aircraft model assembled from engine primitive shapes at the published overall
// F-16 dimensions. It is clearly labelled in-game and listed in docs/ASSETS.md for replacement
// by a licensed, detailed F-16I model (CFTs, dorsal spine, PBR materials, Nanite).
#pragma once
#include <map>
#include <string>

#include "CoreMinimal.h"
#include "Kanaf/Catalog.h"

class UStaticMeshComponent;
class USceneComponent;
class UMaterialInstanceDynamic;

struct FKanafAircraftParts
{
	TArray<TObjectPtr<UStaticMeshComponent>> All;
	TObjectPtr<USceneComponent> LeftStab, RightStab, Rudder, LeftFlaperon, RightFlaperon, CanopyHinge, SpeedbrakeL, SpeedbrakeR;
	TArray<TObjectPtr<USceneComponent>> GearPivots;  // nose, left main, right main
	TArray<TObjectPtr<UStaticMeshComponent>> Stores;
	TObjectPtr<USceneComponent> Nozzle;
};

namespace KanafModel
{
	// Builds the model under Parent. Station positions come from compatibility.json.
	void BuildF16Placeholder(AActor* Owner, USceneComponent* Parent, const kanaf::Catalog& Cat, const std::map<std::string, std::string>& Stations, FKanafAircraftParts& Out);
	// Animate control surfaces/gear/canopy. Angles in radians, gear 0 (up) .. 1 (down).
	void Animate(FKanafAircraftParts& P, double Elevator, double Aileron, double Rudder, double Flaps, double Speedbrake, double Gear, double Canopy, double AbLevel);
	UStaticMeshComponent* AddShape(AActor* Owner, USceneComponent* Parent, const TCHAR* Shape, const FVector& LocCm, const FRotator& Rot, const FVector& Scale, const FLinearColor& Color);
}
