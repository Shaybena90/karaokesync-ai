// Canvas HUD + generic digital instrument panel. Instrument captions stay in English (as on real
// aircraft displays); all Hebrew text is drawn by Slate widgets (proper RTL shaping).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "KanafHUD.generated.h"

class AKanafAircraftPawn;

UCLASS()
class KANAFSIM_API AKanafHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
private:
	void DrawFlightHud(AKanafAircraftPawn* P, const FLinearColor& C);
	void DrawPanel(AKanafAircraftPawn* P, bool bLit);
	void DrawExternalBox(AKanafAircraftPawn* P);
	void Txt(const FString& S, float X, float Y, const FLinearColor& C, float Scale = 1.f, bool bCenter = false);
	void Box(float X, float Y, float W, float H, const FLinearColor& C, float T = 1.5f);
};
