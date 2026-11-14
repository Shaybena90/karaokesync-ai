#include "KanafUI.h"

#include "Fonts/CompositeFont.h"
#include "Framework/Application/SlateApplication.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"
#include "Kanaf/Json.h"
#include "KanafAircraftPawn.h"
#include "KanafConvert.h"
#include "KanafGameMode.h"
#include "KanafGameSubsystem.h"
#include "KanafSettings.h"

using namespace KanafConv;

// ---------------------------------------------------------------------------------------------
// Strings & fonts
// ---------------------------------------------------------------------------------------------

namespace
{
	TMap<FString, FText> GStrings;
	TSharedPtr<FStandaloneCompositeFont> GFontRegular, GFontBold;
	FString GDataDir;

	TSharedPtr<FStandaloneCompositeFont> MakeComposite(bool bBold)
	{
		const FString Dir = FPaths::Combine(GDataDir, TEXT("Fonts"));
		const FString Latin = FPaths::Combine(Dir, bBold ? TEXT("NotoSans-Bold.ttf") : TEXT("NotoSans-Regular.ttf"));
		const FString Hebrew = FPaths::Combine(Dir, bBold ? TEXT("NotoSansHebrew-Bold.ttf") : TEXT("NotoSansHebrew-Regular.ttf"));
		if (!FPaths::FileExists(Latin) || !FPaths::FileExists(Hebrew)) return nullptr;
		TSharedPtr<FStandaloneCompositeFont> CF = MakeShared<FStandaloneCompositeFont>();
		CF->DefaultTypeface.AppendFont(TEXT("Regular"), Latin, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
		FCompositeSubFont& Sub = CF->SubTypefaces.AddDefaulted_GetRef();
		Sub.CharacterRanges.Add(FInt32Range(0x0590, 0x0600));
		Sub.CharacterRanges.Add(FInt32Range(0xFB1D, 0xFB50));
		Sub.Typeface.AppendFont(TEXT("Regular"), Hebrew, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
		return CF;
	}

	const FLinearColor kBg(0.03f, 0.04f, 0.05f, 0.88f);
	const FLinearColor kAccent(0.35f, 0.8f, 0.55f);
	const FLinearColor kText(0.92f, 0.93f, 0.94f);
	const FLinearColor kDim(0.6f, 0.64f, 0.66f);
	const FLinearColor kWarn(1.f, 0.75f, 0.25f);
	const FLinearColor kBad(1.f, 0.4f, 0.35f);

	TSharedRef<STextBlock> T(const FText& Text, int32 Size = 16, const FLinearColor& C = kText, bool bBold = false)
	{
		return SNew(STextBlock).Text(Text).Font(KanafUI::Font(Size, bBold)).ColorAndOpacity(FSlateColor(C)).AutoWrapText(true)
			.TextFlowDirection(ETextFlowDirection::Auto).TextShapingMethod(ETextShapingMethod::FullShaping);
	}
	TSharedRef<SWidget> Btn(const FText& Text, FOnClicked OnClick, bool bEnabled = true, bool bSelected = false)
	{
		return SNew(SBox).Padding(FMargin(0, 3)).MinDesiredWidth(220)
		[
			SNew(SButton).IsEnabled(bEnabled).OnClicked(OnClick)
			.ButtonColorAndOpacity(FSlateColor(bSelected ? FLinearColor(0.15f, 0.45f, 0.3f) : FLinearColor(0.12f, 0.14f, 0.16f)))
			.ContentPadding(FMargin(14, 8))
			[ T(Text, 17, bEnabled ? kText : kDim) ]
		];
	}
	FText StatusText(const std::string& S)
	{
		const std::string K = "status_" + S;
		return KanafUI::S(K.c_str());
	}
}

void KanafUI::LoadStrings(const FString& DataDir)
{
	GDataDir = DataDir;
	GStrings.Reset();
	TArray<uint8> Bytes;
	if (FFileHelper::LoadFileToArray(Bytes, *FPaths::Combine(DataDir, TEXT("UI/strings.he.json"))))
	{
		const kanaf::JsonParseResult R = kanaf::parseJson(std::string(reinterpret_cast<const char*>(Bytes.GetData()), Bytes.Num()));
		for (const auto& M : R.value["s"].members()) GStrings.Add(ToF(M.first), ToT(M.second.str()));
	}
	GFontRegular = MakeComposite(false);
	GFontBold = MakeComposite(true);
}

FText KanafUI::S(const char* Key)
{
	if (const FText* F = GStrings.Find(UTF8_TO_TCHAR(Key))) return *F;
	return FText::FromString(FString::Printf(TEXT("[%s]"), UTF8_TO_TCHAR(Key)));
}

FSlateFontInfo KanafUI::Font(int32 Size, bool bBold)
{
	const TSharedPtr<FStandaloneCompositeFont>& CF = bBold ? GFontBold : GFontRegular;
	if (CF.IsValid()) return FSlateFontInfo(CF, Size, TEXT("Regular"));
	return FCoreStyle::GetDefaultFontStyle(bBold ? "Bold" : "Regular", Size);  // fallback (may lack Hebrew glyphs)
}

// ---------------------------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------------------------

void SKanafMenu::Construct(const FArguments& Args)
{
	GM = Args._GameMode;
	Data = Args._Data;
	ChildSlot
	[
		SNew(SBox).FlowDirectionPreference(EFlowDirectionPreference::RightToLeft)
		[
			SAssignNew(Content, SBox)
		]
	];
	SetScreen(Data.IsValid() && !Data->IsDataValid() ? EKanafScreen::Errors : EKanafScreen::Main);
}

void SKanafMenu::SetScreen(EKanafScreen S)
{
	Current = S;
	CapturingAction = NAME_None;
	if (Content.IsValid()) Content->SetContent(Build());
	if (GM.IsValid()) GM->OnMenuScreenChanged(S);
}

TSharedRef<SWidget> SKanafMenu::Build()
{
	switch (Current)
	{
		case EKanafScreen::Main: return MainScreen();
		case EKanafScreen::Aircraft: return AircraftScreen();
		case EKanafScreen::Loadout: return LoadoutScreen();
		case EKanafScreen::Base: return BaseScreen();
		case EKanafScreen::Mission: return MissionScreen();
		case EKanafScreen::Briefing: return BriefingScreen();
		case EKanafScreen::Settings: return SettingsScreen();
		case EKanafScreen::Bindings: return BindingsScreen();
		case EKanafScreen::Tutorial: return TutorialScreen();
		case EKanafScreen::Pause: return PauseScreen();
		case EKanafScreen::Summary: return SummaryScreen();
		case EKanafScreen::Errors: return ErrorScreen();
	}
	return SNullWidget::NullWidget;
}

// Panel docked on the right (RTL "start" side); the left part stays transparent so the 3D hangar
// remains visible and mouse input there reaches the hangar camera.
TSharedRef<SWidget> SKanafMenu::Panel(const FText& Title, TSharedRef<SWidget> Body, TSharedRef<SWidget> Footer)
{
	return SNew(SHorizontalBox)
	+ SHorizontalBox::Slot().AutoWidth()
	[
		SNew(SBox).WidthOverride(620)
		[
			SNew(SBorder).BorderBackgroundColor(FSlateColor(kBg)).BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).Padding(24)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[ T(Title, 28, kAccent, true) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 12)[ T(KanafUI::S("app_title"), 13, kDim) ]
				+ SVerticalBox::Slot().FillHeight(1.f)[ SNew(SScrollBox) + SScrollBox::Slot()[ Body ] ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 0)[ Footer ]
			]
		]
	]
	+ SHorizontalBox::Slot().FillWidth(1.f)[ SNew(SSpacer) ];
}

TSharedRef<SWidget> SKanafMenu::MainScreen()
{
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("menu_new_flight"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Aircraft); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("menu_tutorial"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Tutorial); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("menu_settings"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Settings); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("menu_quit"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->QuitGame(); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight().Padding(0, 24, 0, 0)[ T(KanafUI::S("disclaimer"), 13, kDim) ];
	return Panel(KanafUI::S("app_title"), B, SNullWidget::NullWidget);
}

TSharedRef<SWidget> SKanafMenu::AircraftScreen()
{
	const kanaf::Catalog& C = Data->Catalog();
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight().Padding(0, 0, 0, 8)[ T(KanafUI::S("hangar_hint"), 13, kDim) ];
	const kanaf::AircraftVariant* Sel = C.variant(ToStd(Data->Selection.AircraftId));
	for (const kanaf::AircraftVariant& V : C.variants)
	{
		const FString Label = FString::Printf(TEXT("%s  %s   ·  %s"), *ToF(V.nameEn), *ToF(V.nameHe), *StatusText(V.serviceStatus).ToString());
		const std::string Id = V.id;
		B->AddSlot().AutoHeight()[ Btn(FText::FromString(Label), FOnClicked::CreateLambda([this, Id] {
			Data->Selection.AircraftId = ToF(Id);
			SetScreen(EKanafScreen::Aircraft);
			return FReply::Handled();
		}), true, Sel && Sel->id == V.id) ];
	}
	if (Sel)
	{
		TSharedRef<SVerticalBox> Info = SNew(SVerticalBox);
		Info->AddSlot().AutoHeight()[ T(FText::FromString(FString::Printf(TEXT("%s · %s"), *ToF(Sel->designation), *ToF(Sel->type))), 15, kText, true) ];
		Info->AddSlot().AutoHeight()[ T(FText::Format(FText::FromString(TEXT("{0}: {1}   ·   {2}")), KanafUI::S("checked"), FText::FromString(TEXT("2026-11-14")),
			KanafUI::S(("impl_" + Sel->implementationStatus).c_str())), 14, Sel->isFlyable() ? kAccent : kWarn) ];
		Info->AddSlot().AutoHeight()[ T(ToT(Sel->statusNote), 13, kDim) ];
		FString Src;
		for (const std::string& S : Sel->statusSources)
			for (const kanaf::SourceDef& D : C.sources) if (D.id == S) Src += FString::Printf(TEXT("• %s (%s, %s)\n"), *ToF(D.title), *ToF(D.publisher), *ToF(D.accessMethod));
		Info->AddSlot().AutoHeight().Padding(0, 6)[ T(FText::FromString(KanafUI::S("sources").ToString() + TEXT(":\n") + Src), 12, kDim) ];
		FString Assets;
		for (const auto& A : Sel->assets) Assets += FString::Printf(TEXT("%s: %s   "), *ToF(A.first), *KanafUI::S(("asset_" + A.second.status).c_str()).ToString());
		Info->AddSlot().AutoHeight()[ T(FText::FromString(KanafUI::S("assets").ToString() + TEXT(": ") + Assets), 12, kDim) ];
		if (!Sel->isFlyable()) Info->AddSlot().AutoHeight().Padding(0, 6)[ T(KanafUI::S("not_flyable_reason"), 14, kWarn) ];
		B->AddSlot().AutoHeight().Padding(0, 12)[ Info ];
	}
	const bool bOk = Sel && Sel->isFlyable();
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("next"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Loadout); return FReply::Handled(); }), bOk) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Main); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("step_aircraft"), B, F);
}

TSharedRef<SWidget> SKanafMenu::LoadoutScreen()
{
	const kanaf::Catalog& C = Data->Catalog();
	const std::string Ac = ToStd(Data->Selection.AircraftId);
	const kanaf::AircraftVariant* V = C.variant(Ac);
	kanaf::LoadoutValidator LV(C);
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight().Padding(0, 0, 0, 8)[ T(KanafUI::S("loadout_note"), 13, kDim) ];
	if (V && !V->weaponsMenu)
	{
		// Mission aircraft: show mission equipment instead of a weapons menu.
		B->AddSlot().AutoHeight()[ T(KanafUI::S("mission_equipment"), 18, kAccent, true) ];
		for (const std::string& E : V->missionEquipment) B->AddSlot().AutoHeight()[ T(ToT("• " + E), 14) ];
	}
	for (const kanaf::LoadoutPreset& P : C.presets)
	{
		if (P.aircraftId != Ac || P.testOnly) continue;
		const kanaf::LoadoutResult R = LV.validate(Ac, P.stations);
		const std::string Id = P.id;
		B->AddSlot().AutoHeight()[ Btn(ToT(P.nameHe), FOnClicked::CreateLambda([this, Id] {
			Data->Selection.LoadoutId = ToF(Id);
			if (GM.IsValid()) GM->RefreshHangarModel();
			SetScreen(EKanafScreen::Loadout);
			return FReply::Handled();
		}), R.valid, Data->Selection.LoadoutId == ToF(P.id)) ];
		if (!R.valid) for (const std::string& E : R.errorsHe) B->AddSlot().AutoHeight()[ T(ToT("  " + E), 12, kBad) ];
	}
	// Station table for the selected preset + every candidate store with its evidence level
	for (const kanaf::LoadoutPreset& P : C.presets)
	{
		if (P.id != ToStd(Data->Selection.LoadoutId)) continue;
		B->AddSlot().AutoHeight().Padding(0, 10, 0, 4)[ T(KanafUI::S("loadout_station"), 16, kAccent, true) ];
		for (const auto& St : P.stations)
		{
			const kanaf::WeaponDef* W = C.weapon(St.second);
			const kanaf::CompatEntry* E = C.compatFor(Ac, St.second);
			if (!W) continue;
			B->AddSlot().AutoHeight()[ T(ToT(St.first + ": " + W->nameEn + " — " + W->categoryHe + (E ? "  [" + E->evidence + "]" : "")), 13) ];
			B->AddSlot().AutoHeight()[ T(ToT("    " + W->descriptionHe + " (נתונים פיזיים: " + W->dataStatus + "; ביצועים: ערכי משחק)"), 11, kDim) ];
		}
	}
	B->AddSlot().AutoHeight().Padding(0, 10, 0, 4)[ T(FText::FromString(TEXT("Research candidates (not selectable unless documented):")), 13, kDim) ];
	for (const kanaf::CompatEntry& E : C.compat)
	{
		if (E.aircraftId != Ac || C.isSelectableEvidence(E.evidence)) continue;
		const kanaf::WeaponDef* W = C.weapon(E.weaponId);
		B->AddSlot().AutoHeight()[ T(ToT("✗ " + (W ? W->nameEn : E.weaponId) + " — " + E.evidence + (E.note.empty() ? "" : " · " + E.note)), 12, kDim) ];
	}
	const kanaf::LoadoutPreset* SelP = nullptr;
	for (const kanaf::LoadoutPreset& P : C.presets) if (P.id == ToStd(Data->Selection.LoadoutId) && P.aircraftId == Ac) SelP = &P;
	const bool bOk = SelP && LV.validate(Ac, SelP->stations).valid;
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("next"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Base); return FReply::Handled(); }), bOk) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Aircraft); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("step_loadout"), B, F);
}

TSharedRef<SWidget> SKanafMenu::BaseScreen()
{
	const kanaf::Catalog& C = Data->Catalog();
	const kanaf::AircraftVariant* V = C.variant(ToStd(Data->Selection.AircraftId));
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight().Padding(0, 0, 0, 8)[ T(KanafUI::S("base_layout_note"), 13, kDim) ];
	for (const kanaf::BaseDef& Bd : C.bases)
	{
		const std::string Id = Bd.id;
		const bool bInDem = Data->Dem() && Data->Dem()->covers(Bd.lat, Bd.lon);
		B->AddSlot().AutoHeight()[ Btn(FText::FromString(FString::Printf(TEXT("%s (%s)%s"), *ToF(Bd.nameHe), *ToF(Bd.icao), bInDem ? TEXT("") : TEXT("  ⚠"))),
			FOnClicked::CreateLambda([this, Id] { Data->Selection.BaseId = ToF(Id); Data->Selection.RunwayEnd = TEXT("auto"); SetScreen(EKanafScreen::Base); return FReply::Handled(); }),
			true, Data->Selection.BaseId == ToF(Bd.id)) ];
	}
	if (const kanaf::BaseDef* Sel = C.base(ToStd(Data->Selection.BaseId)))
	{
		bool bHome = false;
		if (V) for (const std::string& H : V->homeBaseIds) if (H == Sel->id) bHome = true;
		B->AddSlot().AutoHeight().Padding(0, 10)[ T(KanafUI::S(bHome ? "base_home" : "base_not_home"), 14, bHome ? kAccent : kWarn) ];
		if (!(Data->Dem() && Data->Dem()->covers(Sel->lat, Sel->lon))) B->AddSlot().AutoHeight()[ T(KanafUI::S("base_outside_region"), 14, kWarn) ];
		FString Rw;
		for (const kanaf::RunwayDef& R : Sel->runways) Rw += FString::Printf(TEXT("%s  (%.0f m)\n"), *ToF(R.id), R.lengthM);
		B->AddSlot().AutoHeight()[ T(FText::FromString(KanafUI::S("briefing_runway").ToString() + TEXT(":\n") + Rw), 13, kDim) ];
		// Runway end choice
		for (const kanaf::RunwayDef& R : Sel->runways)
			for (const kanaf::RunwayEnd& E : R.ends)
			{
				const std::string Id = E.ident;
				B->AddSlot().AutoHeight()[ Btn(ToT(KanafConv::ToStd(KanafUI::S("briefing_runway").ToString()) + " " + E.ident),
					FOnClicked::CreateLambda([this, Id] { Data->Selection.RunwayEnd = ToF(Id); SetScreen(EKanafScreen::Base); return FReply::Handled(); }),
					true, Data->Selection.RunwayEnd == ToF(E.ident)) ];
			}
	}
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("next"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Mission); return FReply::Handled(); })) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Loadout); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("step_base"), B, F);
}

TSharedRef<SWidget> SKanafMenu::MissionScreen()
{
	const kanaf::Catalog& C = Data->Catalog();
	const std::string Ac = ToStd(Data->Selection.AircraftId);
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	for (const kanaf::MissionDef& M : C.missions)
	{
		const bool bAvail = M.phase <= 1 && M.allowsAircraft(Ac);
		const std::string Id = M.id;
		B->AddSlot().AutoHeight()[ Btn(FText::FromString(ToF(M.nameHe) + (M.phase > 1 ? TEXT("  · ") + KanafUI::S("mission_in_dev").ToString() : TEXT(""))),
			FOnClicked::CreateLambda([this, Id] { Data->Selection.MissionId = ToF(Id); SetScreen(EKanafScreen::Mission); return FReply::Handled(); }),
			bAvail, Data->Selection.MissionId == ToF(M.id)) ];
	}
	B->AddSlot().AutoHeight().Padding(0, 12, 0, 4)[ T(KanafUI::S("time_of_day"), 18, kAccent, true) ];
	struct Tod { const TCHAR* Id; const char* Key; };
	static const Tod Tods[] = {{TEXT("dawn"), "שחר"}, {TEXT("noon"), "צהריים"}, {TEXT("sunset"), "שקיעה"}, {TEXT("night"), "לילה"}};
	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	for (const Tod& Td : Tods)
	{
		const FString Id = Td.Id;
		Row->AddSlot().AutoWidth().Padding(4, 0)[ Btn(ToT(Td.Key), FOnClicked::CreateLambda([this, Id] { Data->Selection.TimeOfDayId = Id; SetScreen(EKanafScreen::Mission); return FReply::Handled(); }),
			true, Data->Selection.TimeOfDayId == Id) ];
	}
	B->AddSlot().AutoHeight()[ Row ];
	const kanaf::MissionDef* Sel = C.mission(ToStd(Data->Selection.MissionId));
	const bool bOk = Sel && Sel->phase <= 1 && Sel->allowsAircraft(Ac);
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("next"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Briefing); return FReply::Handled(); }), bOk) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Base); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("step_mission"), B, F);
}

TSharedRef<SWidget> SKanafMenu::BriefingScreen()
{
	const kanaf::Catalog& C = Data->Catalog();
	const kanaf::MissionDef* M = C.mission(ToStd(Data->Selection.MissionId));
	const kanaf::BaseDef* Bd = C.base(ToStd(Data->Selection.BaseId));
	const kanaf::CallsignDef* Cs = M ? C.callsign(M->callsignId.empty() ? "ofroni" : M->callsignId) : nullptr;
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	if (M)
	{
		B->AddSlot().AutoHeight()[ T(ToT(M->nameHe), 20, kText, true) ];
		B->AddSlot().AutoHeight().Padding(0, 6)[ T(ToT(M->briefingHe), 15) ];
		B->AddSlot().AutoHeight()[ T(FText::FromString(FString::Printf(TEXT("%s: %s אחת   ·   %s   ·   %s: %s"), *KanafUI::S("briefing_callsign").ToString(),
			Cs ? *ToF(Cs->he) : TEXT("—"), Bd ? *ToF(Bd->nameHe) : TEXT(""), *KanafUI::S("briefing_runway").ToString(), *Data->Selection.RunwayEnd)), 14, kAccent) ];
		B->AddSlot().AutoHeight().Padding(0, 8, 0, 2)[ T(KanafUI::S("briefing_objectives"), 16, kAccent, true) ];
		for (const kanaf::ObjectiveDef& O : M->objectives) B->AddSlot().AutoHeight()[ T(ToT("• " + O.textHe + (O.optional ? " (רשות)" : "")), 14) ];
		for (const kanaf::WaypointDef& W : M->waypoints) B->AddSlot().AutoHeight()[ T(ToT("   ◦ " + W.nameHe), 13, kDim) ];
	}
	B->AddSlot().AutoHeight().Padding(0, 10)[ T(KanafUI::S("briefing_controls"), 13, kDim) ];
	B->AddSlot().AutoHeight()[ T(KanafUI::S("terrain_artistic"), 12, kDim) ];
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("fly"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->StartFlight(); return FReply::Handled(); })) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Mission); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("step_briefing"), B, F);
}

TSharedRef<SWidget> SKanafMenu::SettingsScreen()
{
	UKanafSettingsSave* St = Data->Settings();
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight()[ T(KanafUI::S("settings_graphics"), 16, kAccent, true) ];
	TSharedRef<SHorizontalBox> Q = SNew(SHorizontalBox);
	for (int32 i = 0; i < 4; ++i)
	{
		const std::string K = "q" + std::to_string(i);
		Q->AddSlot().AutoWidth().Padding(3, 0)[ Btn(KanafUI::S(K.c_str()), FOnClicked::CreateLambda([this, St, i] { St->QualityLevel = i; Data->ApplyGraphicsSettings(); SetScreen(EKanafScreen::Settings); return FReply::Handled(); }), true, St->QualityLevel == i) ];
	}
	B->AddSlot().AutoHeight()[ Q ];
	auto Check = [&](const char* Key, bool* Value) {
		B->AddSlot().AutoHeight().Padding(0, 4)
		[
			SNew(SCheckBox).IsChecked_Lambda([Value] { return *Value ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
			.OnCheckStateChanged_Lambda([this, Value](ECheckBoxState S) { *Value = S == ECheckBoxState::Checked; Data->ApplyGraphicsSettings(); })
			[ T(KanafUI::S(Key), 15) ]
		];
	};
	auto Slider = [&](const char* Key, float* Value, float Min, float Max) {
		B->AddSlot().AutoHeight().Padding(0, 4)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.45f)[ T(KanafUI::S(Key), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.55f)
			[
				SNew(SSlider).MinValue(Min).MaxValue(Max).Value_Lambda([Value] { return *Value; })
				.OnValueChanged_Lambda([Value](float V) { *Value = V; })
			]
		];
	};
	Check("settings_lumen", &St->bLumen);
	Slider("settings_terrain_detail", &St->TerrainDetail, 0.5f, 2.f);
	B->AddSlot().AutoHeight().Padding(0, 10, 0, 2)[ T(FText::FromString(TEXT("Audio / קשר")), 16, kAccent, true) ];
	Slider("settings_master", &St->MasterVolume, 0.f, 1.f);
	Slider("settings_engine", &St->EngineVolume, 0.f, 1.f);
	Slider("settings_radio", &St->RadioVolume, 0.f, 1.f);
	Slider("settings_radio_noise", &St->RadioNoise, 0.f, 1.f);
	Slider("settings_radio_effect", &St->RadioEffect, 0.f, 1.f);
	Check("settings_subtitles", &St->bSubtitles);
	Check("settings_autotune", &St->bRadioAutoTune);
	B->AddSlot().AutoHeight().Padding(0, 10, 0, 2)[ T(FText::FromString(TEXT("שליטה")), 16, kAccent, true) ];
	Check("settings_beginner", &St->bBeginnerMode);
	Check("settings_invert", &St->bInvertPitch);
	Check("settings_bipolar", &St->bThrottleAxisBipolar);
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("settings_bindings"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Bindings); return FReply::Handled(); })) ];
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("settings_save"), FOnClicked::CreateLambda([this] {
			Data->SaveSettings();
			Data->ApplyGraphicsSettings();
			SetScreen(GM.IsValid() && GM->IsFlying() ? EKanafScreen::Pause : EKanafScreen::Main);
			return FReply::Handled(); })) ];
	return Panel(KanafUI::S("settings_title"), B, F);
}

TSharedRef<SWidget> SKanafMenu::BindingsScreen()
{
	UKanafSettingsSave* St = Data->Settings();
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight()[ T(FText::FromString(TEXT("HOTAS: requires RawInput device configuration (see README).")), 12, kDim) ];
	for (int32 i = 0; i < St->Bindings.Num(); ++i)
	{
		const FKanafBinding& Bd = St->Bindings[i];
		TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox) + SHorizontalBox::Slot().FillWidth(0.35f)[ T(FText::FromName(Bd.Action), 14) ];
		for (int32 k = 0; k < 3; ++k)
		{
			const bool bCap = CapturingAction == Bd.Action && CapturingSlot == k;
			const FText Label = bCap ? KanafUI::S("bind_press") : FText::FromName(k < Bd.Keys.Num() ? Bd.Keys[k] : FName(TEXT("—")));
			const FName Act = Bd.Action;
			Row->AddSlot().FillWidth(0.21f).Padding(2, 0)
			[
				SNew(SButton).OnClicked_Lambda([this, Act, k] { CapturingAction = Act; CapturingSlot = k; Content->SetContent(Build()); FSlateApplication::Get().SetKeyboardFocus(SharedThis(this)); return FReply::Handled(); })
				[ T(Label, 12, bCap ? kWarn : kText) ]
			];
		}
		B->AddSlot().AutoHeight().Padding(0, 1)[ Row ];
	}
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] {
			Data->SaveSettings();
			if (GM.IsValid()) GM->OnBindingsChanged();
			SetScreen(EKanafScreen::Settings);
			return FReply::Handled(); })) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("bind_reset"), FOnClicked::CreateLambda([this, St] {
			St->Bindings = UKanafSettingsSave::DefaultBindings();
			SetScreen(EKanafScreen::Bindings);
			return FReply::Handled(); })) ];
	return Panel(KanafUI::S("settings_bindings"), B, F);
}

void SKanafMenu::CaptureKey(const FKey& K)
{
	if (CapturingAction.IsNone()) return;
	for (FKanafBinding& Bd : Data->Settings()->Bindings)
	{
		if (Bd.Action != CapturingAction) continue;
		while (Bd.Keys.Num() <= CapturingSlot) Bd.Keys.Add(NAME_None);
		Bd.Keys[CapturingSlot] = K == EKeys::Escape ? NAME_None : K.GetFName();  // Esc clears the slot
		Bd.Keys.RemoveAll([](const FName& N) { return N.IsNone(); });
	}
	CapturingAction = NAME_None;
	CapturingSlot = -1;
	Content->SetContent(Build());
}

FReply SKanafMenu::OnKeyDown(const FGeometry& G, const FKeyEvent& E)
{
	if (!CapturingAction.IsNone()) { CaptureKey(E.GetKey()); return FReply::Handled(); }
	if (E.GetKey() == EKeys::Escape && Current == EKanafScreen::Pause && GM.IsValid()) { GM->TogglePauseMenu(); return FReply::Handled(); }
	return FReply::Unhandled();
}

FReply SKanafMenu::OnMouseButtonDown(const FGeometry& G, const FPointerEvent& E)
{
	if (!CapturingAction.IsNone() && E.GetEffectingButton() != EKeys::LeftMouseButton) { CaptureKey(E.GetEffectingButton()); return FReply::Handled(); }
	return FReply::Unhandled();
}

FReply SKanafMenu::OnAnalogValueChanged(const FGeometry& G, const FAnalogInputEvent& E)
{
	if (!CapturingAction.IsNone() && FMath::Abs(E.GetAnalogValue()) > 0.6f) { CaptureKey(E.GetKey()); return FReply::Handled(); }
	return FReply::Unhandled();
}

TSharedRef<SWidget> SKanafMenu::TutorialScreen()
{
	return Panel(KanafUI::S("tutorial_title"), T(KanafUI::S("tutorial_text"), 15),
		Btn(KanafUI::S("back"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Main); return FReply::Handled(); })));
}

TSharedRef<SWidget> SKanafMenu::PauseScreen()
{
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("pause_resume"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->TogglePauseMenu(); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("pause_restart"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->RestartFlight(); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("menu_settings"), FOnClicked::CreateLambda([this] { SetScreen(EKanafScreen::Settings); return FReply::Handled(); })) ];
	B->AddSlot().AutoHeight()[ Btn(KanafUI::S("pause_end"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->EndMissionByPlayer(); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("pause_title"), B, SNullWidget::NullWidget);
}

TSharedRef<SWidget> SKanafMenu::SummaryScreen()
{
	const kanaf::MissionSummary& S = Data->LastSummary;
	TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
	const bool bOk = S.result == kanaf::MissionResult::Success;
	B->AddSlot().AutoHeight()[ T(ToT(S.missionNameHe + " — " + S.resultHe), 20, bOk ? kAccent : kWarn, true) ];
	if (!S.failReasonHe.empty()) B->AddSlot().AutoHeight()[ T(FText::FromString(KanafUI::S("summary_fail_reason").ToString() + TEXT(": ") + ToF(S.failReasonHe)), 15, kBad) ];
	auto Row = [&](const char* Key, const FString& Val) {
		B->AddSlot().AutoHeight().Padding(0, 2)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.5f)[ T(KanafUI::S(Key), 15, kDim) ]
			+ SHorizontalBox::Slot().FillWidth(0.5f)[ T(FText::FromString(Val), 15) ]
		];
	};
	Row("summary_score", FString::Printf(TEXT("%d / 100"), S.score));
	Row("summary_time", FString::Printf(TEXT("%d:%02d"), int(S.flightTimeS) / 60, int(S.flightTimeS) % 60));
	Row("summary_distance", FString::Printf(TEXT("%.1f km"), S.distanceKm));
	Row("summary_max_alt", FString::Printf(TEXT("%.0f ft"), S.maxAltMslM / kanaf::kFt2M));
	Row("summary_max_g", FString::Printf(TEXT("%.1f g"), S.maxG));
	Row("summary_fuel", FString::Printf(TEXT("%.0f kg"), S.fuelUsedKg));
	if (S.touchdownSinkMs >= 0) Row("summary_touchdown", FString::Printf(TEXT("%.2f m/s · %.1f m"), S.touchdownSinkMs, S.touchdownCrossM));
	B->AddSlot().AutoHeight().Padding(0, 8, 0, 2)[ T(KanafUI::S("objectives"), 16, kAccent, true) ];
	for (const auto& O : S.objectives) B->AddSlot().AutoHeight()[ T(ToT((O.second ? "✓ " : "✗ ") + O.first), 14, O.second ? kText : kDim) ];
	TSharedRef<SHorizontalBox> F = SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()[ Btn(KanafUI::S("summary_retry"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->StartFlight(); return FReply::Handled(); })) ]
		+ SHorizontalBox::Slot().AutoWidth().Padding(12, 0)[ Btn(KanafUI::S("summary_menu"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->EnterMenu(); return FReply::Handled(); })) ];
	return Panel(KanafUI::S("summary_title"), B, F);
}

TSharedRef<SWidget> SKanafMenu::ErrorScreen()
{
	FString All;
	for (const FString& E : Data->LoadErrors()) All += TEXT("• ") + E + TEXT("\n");
	return Panel(KanafUI::S("data_errors"), T(FText::FromString(All), 13, kBad),
		Btn(KanafUI::S("menu_quit"), FOnClicked::CreateLambda([this] { if (GM.IsValid()) GM->QuitGame(); return FReply::Handled(); })));
}

// ---------------------------------------------------------------------------------------------
// In-flight overlay: subtitles, radio menu/channel, objectives, terrain notices, attribution
// ---------------------------------------------------------------------------------------------

void SKanafFlightOverlay::Construct(const FArguments& Args)
{
	Pawn = Args._Pawn;
	Data = Args._Data;
	TWeakObjectPtr<AKanafAircraftPawn> P = Pawn;
	TWeakObjectPtr<UKanafGameSubsystem> D = Data;
	auto Sub = [P, D]() { return P.IsValid() && P->HasSubtitle() && D.IsValid() && D->Settings()->bSubtitles ? EVisibility::HitTestInvisible : EVisibility::Collapsed; };
	ChildSlot
	[
		SNew(SOverlay).FlowDirectionPreference(EFlowDirectionPreference::RightToLeft).Visibility(EVisibility::HitTestInvisible)
		// Subtitles + speaker (top, start side)
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(30, 40))
		[
			SNew(SBorder).Visibility_Lambda(Sub).BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).BorderBackgroundColor(FSlateColor(FLinearColor(0, 0, 0, 0.55f))).Padding(12)
			[
				SNew(SBox).MaxDesiredWidth(760)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[ SNew(STextBlock).Font(KanafUI::Font(14, true)).ColorAndOpacity(FSlateColor(kAccent)).Text_Lambda([P] { return P.IsValid() ? FText::FromString(P->SubtitleSpeaker()) : FText(); }) ]
					+ SVerticalBox::Slot().AutoHeight()[ SNew(STextBlock).Font(KanafUI::Font(20)).ColorAndOpacity(FSlateColor(kText)).AutoWrapText(true).Text_Lambda([P] { return P.IsValid() ? FText::FromString(P->SubtitleText()) : FText(); }) ]
				]
			]
		]
		// Radio channel + menu (start side, middle)
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Center).Padding(FMargin(30, 0))
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(STextBlock).Font(KanafUI::Font(14)).ColorAndOpacity(FSlateColor(kText)).Text_Lambda([P, D] {
					if (!P.IsValid() || !D.IsValid()) return FText();
					FString S = KanafUI::S("radio_channel").ToString() + TEXT(": ") + ToF(D->Phrasebook().channelNameHe(P->Radio().playerChannel()));
					const std::string Pend = P->Radio().pendingCallChannel();
					if (!Pend.empty()) S += TEXT("   ⚠ ") + KanafUI::S("radio_call_waiting").ToString() + TEXT(" ") + ToF(D->Phrasebook().channelNameHe(Pend));
					return FText::FromString(S);
				})
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 6)
			[
				SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).BorderBackgroundColor(FSlateColor(FLinearColor(0, 0, 0, 0.6f))).Padding(10)
				.Visibility_Lambda([P] { return P.IsValid() && (P->IsRadioMenuOpen() || !P->Radio().availableReplies().empty()) ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
				[
					SNew(STextBlock).Font(KanafUI::Font(16)).ColorAndOpacity(FSlateColor(kText)).Text_Lambda([P] {
						if (!P.IsValid()) return FText();
						const auto R = P->Radio().availableReplies();
						FString S = KanafUI::S("radio_menu_title").ToString() + (P->IsRadioMenuOpen() ? TEXT("") : TEXT("  (Tab / T)")) + TEXT("\n");
						if (R.empty()) S += KanafUI::S("radio_no_replies").ToString();
						for (size_t i = 0; i < R.size(); ++i) S += FString::Printf(TEXT("%d. %s\n"), int32(i + 1), *ToF(R[i].labelHe));
						return FText::FromString(S);
					})
				]
			]
		]
		// Objectives + mission state (end side, top)
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(FMargin(30, 40))
		[
			SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).BorderBackgroundColor(FSlateColor(FLinearColor(0, 0, 0, 0.45f))).Padding(10)
			[
				SNew(STextBlock).Font(KanafUI::Font(14)).ColorAndOpacity(FSlateColor(kText)).Text_Lambda([P] {
					if (!P.IsValid()) return FText();
					const kanaf::MissionRuntime& M = P->Mission();
					FString S = KanafUI::S("objectives").ToString() + TEXT("\n");
					for (const kanaf::ObjectiveState& O : M.objectives()) S += (O.done ? TEXT("✓ ") : (O.failed ? TEXT("✗ ") : TEXT("○ "))) + ToF(O.def.textHe) + TEXT("\n");
					if (M.def().type == "navigation" && M.nextWaypoint() < int32(M.def().waypoints.size()))
					{
						const kanaf::WaypointDef& W = M.def().waypoints[size_t(M.nextWaypoint())];
						const kanaf::FlightData& Fd = P->Session().fm.data();
						const double Dist = kanaf::greatCircleDistanceM(Fd.latDeg, Fd.lonDeg, W.lat, W.lon) / kanaf::kNm2M;
						const double Brg = kanaf::initialBearingDeg(Fd.latDeg, Fd.lonDeg, W.lat, W.lon);
						S += FString::Printf(TEXT("→ %s  %03.0f°  %.1f NM\n"), *ToF(W.nameHe), Brg, Dist);
					}
					if (M.result() == kanaf::MissionResult::Success) S += KanafUI::S("mission_success").ToString();
					if (M.result() == kanaf::MissionResult::Failed) S += KanafUI::S("mission_failed").ToString() + TEXT(": ") + ToF(M.summary().failReasonHe);
					if (P->Session().fm.state().crashed) S += TEXT("\n") + KanafUI::S("crashed").ToString();
					return FText::FromString(S);
				})
			]
		]
		// Terrain notice + attribution (bottom, end side)
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(16, 0, 16, 6))
		[
			SNew(STextBlock).Font(KanafUI::Font(10)).ColorAndOpacity(FSlateColor(FLinearColor(1, 1, 1, 0.7f))).Text_Lambda([P] {
				if (!P.IsValid()) return FText();
				const kanaf::FlightSession& S = P->Session();
				FString T2 = S.terrainMessageHe.empty() ? KanafUI::S("terrain_attribution").ToString() + TEXT("  ·  ") + KanafUI::S("terrain_artistic").ToString() : ToF(S.terrainMessageHe);
				return FText::FromString(T2);
			})
		]
		// Help
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
		[
			SNew(SBorder).Visibility_Lambda([P] { return P.IsValid() && P->IsHelpOpen() ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).BorderBackgroundColor(FSlateColor(FLinearColor(0, 0, 0, 0.75f))).Padding(20)
			[ SNew(SBox).MaxDesiredWidth(700)[ T(KanafUI::S("briefing_controls"), 16) ] ]
		]
	];
}
