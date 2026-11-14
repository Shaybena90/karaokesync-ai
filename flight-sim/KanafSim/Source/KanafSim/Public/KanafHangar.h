// 3D hangar for aircraft/loadout selection: simple shelter geometry, studio lights, the selected
// aircraft (placeholder model with the selected stores), and an orbit camera (drag / wheel).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "KanafPlaceholderModel.h"
#include "KanafHangar.generated.h"

class UCameraComponent;

UCLASS()
class KANAFSIM_API AKanafHangarPawn : public APawn
{
	GENERATED_BODY()
public:
	AKanafHangarPawn();
	virtual void Tick(float Dt) override;
	void BuildScene(const class UKanafGameSubsystem* Data);
	void ClearModel();
private:
	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<USceneComponent> ModelRoot;
	UPROPERTY() TObjectPtr<UCameraComponent> Cam;
	bool bSceneBuilt = false;
	float Yaw = 215.f, Pitch = -12.f, Dist = 2300.f;
	FKanafAircraftParts Parts;
};
