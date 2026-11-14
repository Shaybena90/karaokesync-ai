// Hebrew RTL user interface built with Slate (no binary widget assets needed).
#pragma once
#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Widgets/SCompoundWidget.h"

class AKanafGameMode;
class UKanafGameSubsystem;
class AKanafAircraftPawn;

namespace KanafUI
{
	void LoadStrings(const FString& DataDir);
	FText S(const char* Key);
	FSlateFontInfo Font(int32 Size, bool bBold = false);
}

enum class EKanafScreen : uint8 { Main, Aircraft, Loadout, Base, Mission, Briefing, Settings, Bindings, Tutorial, Pause, Summary, Errors };

class SKanafMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKanafMenu) {}
	SLATE_ARGUMENT(TWeakObjectPtr<AKanafGameMode>, GameMode)
	SLATE_ARGUMENT(TWeakObjectPtr<UKanafGameSubsystem>, Data)
	SLATE_END_ARGS()

	void Construct(const FArguments& Args);
	void SetScreen(EKanafScreen S);
	EKanafScreen Screen() const { return Current; }
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& G, const FKeyEvent& E) override;
	virtual FReply OnMouseButtonDown(const FGeometry& G, const FPointerEvent& E) override;
	virtual FReply OnAnalogValueChanged(const FGeometry& G, const FAnalogInputEvent& E) override;

private:
	TSharedRef<SWidget> Build();
	TSharedRef<SWidget> Panel(const FText& Title, TSharedRef<SWidget> Body, TSharedRef<SWidget> Footer);
	TSharedRef<SWidget> MainScreen();
	TSharedRef<SWidget> AircraftScreen();
	TSharedRef<SWidget> LoadoutScreen();
	TSharedRef<SWidget> BaseScreen();
	TSharedRef<SWidget> MissionScreen();
	TSharedRef<SWidget> BriefingScreen();
	TSharedRef<SWidget> SettingsScreen();
	TSharedRef<SWidget> BindingsScreen();
	TSharedRef<SWidget> TutorialScreen();
	TSharedRef<SWidget> PauseScreen();
	TSharedRef<SWidget> SummaryScreen();
	TSharedRef<SWidget> ErrorScreen();
	void CaptureKey(const FKey& K);

	TWeakObjectPtr<AKanafGameMode> GM;
	TWeakObjectPtr<UKanafGameSubsystem> Data;
	EKanafScreen Current = EKanafScreen::Main;
	TSharedPtr<class SBox> Content;
	FName CapturingAction;
	int32 CapturingSlot = -1;
};

class SKanafFlightOverlay : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKanafFlightOverlay) {}
	SLATE_ARGUMENT(TWeakObjectPtr<AKanafAircraftPawn>, Pawn)
	SLATE_ARGUMENT(TWeakObjectPtr<UKanafGameSubsystem>, Data)
	SLATE_END_ARGS()
	void Construct(const FArguments& Args);
private:
	TWeakObjectPtr<AKanafAircraftPawn> Pawn;
	TWeakObjectPtr<UKanafGameSubsystem> Data;
};
