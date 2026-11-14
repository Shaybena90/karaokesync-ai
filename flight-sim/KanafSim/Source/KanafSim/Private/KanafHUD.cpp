#include "KanafHUD.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Kanaf/MathTypes.h"
#include "KanafAircraftPawn.h"

using namespace kanaf;

void AKanafHUD::Txt(const FString& S, float X, float Y, const FLinearColor& C, float Scale, bool bCenter)
{
	UFont* F = GEngine->GetMediumFont();
	float W = 0, H = 0;
	if (bCenter) { GetTextSize(S, W, H, F, Scale); X -= W / 2; }
	DrawText(S, C, X, Y, F, Scale);
}

void AKanafHUD::Box(float X, float Y, float W, float H, const FLinearColor& C, float T)
{
	DrawLine(X, Y, X + W, Y, C, T); DrawLine(X + W, Y, X + W, Y + H, C, T);
	DrawLine(X + W, Y + H, X, Y + H, C, T); DrawLine(X, Y + H, X, Y, C, T);
}

void AKanafHUD::DrawHUD()
{
	Super::DrawHUD();
	AKanafAircraftPawn* P = Cast<AKanafAircraftPawn>(GetOwningPawn());
	if (!P || !Canvas) return;
	const bool bNight = P->SunElevationDeg < -2.0;
	const bool bLit = P->InstrumentLightsOn() || bNight;
	// HUD brightness follows ambient light (day bright, night dim to preserve night vision).
	const FLinearColor HudC = bNight ? FLinearColor(0.15f, 0.7f, 0.25f, 0.85f) : FLinearColor(0.3f, 1.f, 0.45f, 1.f);
	if (P->View() == EKanafView::Cockpit)
	{
		if (FMath::Abs(P->HeadYawDeg()) < 25.f && FMath::Abs(P->HeadPitchDeg() + 8.f) < 25.f) DrawFlightHud(P, HudC);
		DrawPanel(P, bLit);
	}
	else
	{
		DrawExternalBox(P);
	}
	// Warnings
	float Y = Canvas->ClipY * 0.18f;
	for (const FString& W : P->Warnings)
	{
		const bool bRed = W != TEXT("PARK BRK") && W != TEXT("TERRAIN: FALLBACK");
		Txt(W, Canvas->ClipX * 0.5f, Y, bRed ? FLinearColor(1, 0.15f, 0.1f) : FLinearColor(1, 0.8f, 0.2f), 1.3f, true);
		Y += 26;
	}
	Txt(FString::Printf(TEXT("%.0f FPS"), P->SmoothedFps()), 10, 8, FLinearColor(0.8f, 0.8f, 0.8f, 0.7f), 0.8f);
}

void AKanafHUD::DrawFlightHud(AKanafAircraftPawn* P, const FLinearColor& C)
{
	const FlightData& D = P->Session().fm.data();
	const float Cx = Canvas->ClipX * 0.5f, Cy = Canvas->ClipY * 0.5f;
	const float Aspect = Canvas->ClipX / FMath::Max(1.f, Canvas->ClipY);
	const float VFov = 2.f * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(P->CockpitFov() * 0.5f)) / Aspect);
	const float Ppd = (Canvas->ClipY * 0.5f) / FMath::Tan(VFov * 0.5f) * FMath::Tan(FMath::DegreesToRadians(1.f));
	// Boresight (body x axis) on screen, given head rotation.
	const float Bx = Cx - P->HeadYawDeg() * Ppd, By = Cy + P->HeadPitchDeg() * Ppd;
	const float Phi = FMath::DegreesToRadians(float(D.rollDeg));
	const FVector2D Along(FMath::Cos(Phi), -FMath::Sin(Phi)), Perp(FMath::Sin(Phi), FMath::Cos(Phi));
	const float Lim = Canvas->ClipY * 0.28f;
	// Pitch ladder (earth-referenced, rotates with roll)
	for (int L = -30; L <= 30; L += 5)
	{
		const float Dd = float(D.pitchDeg - L) * Ppd;
		if (FMath::Abs(Dd) > Lim) continue;
		const FVector2D Cn = FVector2D(Bx, By) + Perp * Dd;
		const float Half = L == 0 ? Canvas->ClipX * 0.18f : 70.f, Gap = L == 0 ? 40.f : 25.f;
		const FVector2D A1 = Cn - Along * Half, A2 = Cn - Along * Gap, B1 = Cn + Along * Gap, B2 = Cn + Along * Half;
		DrawLine(A1.X, A1.Y, A2.X, A2.Y, C, L < 0 ? 1.f : 1.6f);
		DrawLine(B1.X, B1.Y, B2.X, B2.Y, C, L < 0 ? 1.f : 1.6f);
		if (L != 0) Txt(FString::Printf(TEXT("%d"), L), B2.X + 6, B2.Y - 8, C, 0.8f);
	}
	// Waterline (gun cross) and flight path marker (body-fixed)
	DrawLine(Bx - 18, By, Bx - 6, By + 6, C, 1.6f); DrawLine(Bx - 6, By + 6, Bx, By, C, 1.6f);
	DrawLine(Bx, By, Bx + 6, By + 6, C, 1.6f); DrawLine(Bx + 6, By + 6, Bx + 18, By, C, 1.6f);
	if (!D.weightOnWheels && D.tas > 20)
	{
		const float Fx = Bx + float(D.beta * kRad2Deg) * Ppd, Fy = By + float(D.alpha * kRad2Deg) * Ppd;
		Box(Fx - 7, Fy - 7, 14, 14, C, 1.6f);
		DrawLine(Fx - 22, Fy, Fx - 7, Fy, C, 1.6f); DrawLine(Fx + 7, Fy, Fx + 22, Fy, C, 1.6f); DrawLine(Fx, Fy - 7, Fx, Fy - 17, C, 1.6f);
	}
	// Speed (left), altitude (right), heading (top)
	const float Sx = Bx - Canvas->ClipX * 0.22f, Ax = Bx + Canvas->ClipX * 0.17f;
	Box(Sx - 5, By - 14, 80, 30, C); Txt(FString::Printf(TEXT("%4.0f"), D.cas / kKt2Ms), Sx, By - 12, C, 1.2f);
	Txt(FString::Printf(TEXT("M %.2f"), D.mach), Sx, By + 22, C, 0.85f);
	Txt(FString::Printf(TEXT("G %.1f"), D.nz), Sx, By + 44, C, 0.85f);
	Txt(FString::Printf(TEXT("AOA %.1f"), D.alpha * kRad2Deg), Sx, By + 66, C, 0.85f);
	Box(Ax - 5, By - 14, 95, 30, C); Txt(FString::Printf(TEXT("%5.0f"), D.altMsl / kFt2M), Ax, By - 12, C, 1.2f);
	Txt(FString::Printf(TEXT("VS %+5.0f"), D.vsMs / kFt2M * 60.0), Ax, By + 22, C, 0.85f);
	if (D.agl < 1500 * kFt2M) Txt(FString::Printf(TEXT("R %4.0f"), D.wheelAgl / kFt2M), Ax, By + 44, C, 0.85f);
	const float Hy = By - Canvas->ClipY * 0.3f;
	for (int k = -3; k <= 3; ++k)
	{
		const double H = std::floor(D.headingDeg / 10.0) * 10.0 + k * 10.0;
		const float X = Bx + float(H - D.headingDeg) * 6.f;
		DrawLine(X, Hy, X, Hy + 8, C, 1.2f);
		Txt(FString::Printf(TEXT("%02d"), int(wrap360(H) / 10.0) % 36), X, Hy - 20, C, 0.8f, true);
	}
	DrawLine(Bx, Hy + 10, Bx, Hy + 20, C, 2.f);
	// Gear / throttle cues
	const AircraftState& St = P->Session().fm.state();
	if (St.gearPos > 0.99) Txt(TEXT("GEAR DN"), Bx, By + Canvas->ClipY * 0.22f, C, 0.9f, true);
	Txt(FString::Printf(TEXT("THR %3.0f%%%s"), P->Inputs().throttle * 100.0, St.abLevel > 0.05 ? TEXT(" AB") : TEXT("")), Sx, By + 92, C, 0.85f);
}

void AKanafHUD::DrawPanel(AKanafAircraftPawn* P, bool bLit)
{
	const FlightData& D = P->Session().fm.data();
	const AircraftState& St = P->Session().fm.state();
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float Top = H * 0.82f;
	DrawRect(FLinearColor(0.02f, 0.025f, 0.03f, 0.85f), 0, Top, W, H - Top);
	// Instrument lighting: dim amber at night/with lights, neutral white in daylight (game model)
	const FLinearColor Tc = bLit ? FLinearColor(1.f, 0.62f, 0.25f) : FLinearColor(0.85f, 0.9f, 0.9f);
	const FLinearColor Dim = Tc * 0.6f;
	struct Cell { const TCHAR* Cap; FString Val; };
	const Cell Cells[] = {
		{TEXT("KCAS"), FString::Printf(TEXT("%.0f"), D.cas / kKt2Ms)},
		{TEXT("ALT FT"), FString::Printf(TEXT("%.0f"), D.altMsl / kFt2M)},
		{TEXT("AGL FT"), FString::Printf(TEXT("%.0f"), FMath::Max(0.0, D.wheelAgl / kFt2M))},
		{TEXT("HDG"), FString::Printf(TEXT("%03.0f"), D.headingDeg)},
		{TEXT("VVI FPM"), FString::Printf(TEXT("%+.0f"), D.vsMs / kFt2M * 60.0)},
		{TEXT("PITCH/ROLL"), FString::Printf(TEXT("%+.0f / %+.0f"), D.pitchDeg, D.rollDeg)},
		{TEXT("AOA"), FString::Printf(TEXT("%.1f"), D.alpha * kRad2Deg)},
		{TEXT("G"), FString::Printf(TEXT("%.1f"), D.nz)},
		{TEXT("RPM %"), FString::Printf(TEXT("%.0f"), D.rpmPct)},
		{TEXT("NOZ %"), FString::Printf(TEXT("%.0f"), D.nozzlePct)},
		{TEXT("FF KG/H"), FString::Printf(TEXT("%.0f"), D.fuelFlowKgS * 3600.0)},
		{TEXT("FUEL KG"), FString::Printf(TEXT("%.0f"), St.fuelKg)},
	};
	const int32 N = UE_ARRAY_COUNT(Cells);
	const float Cw = W / (N + 2);
	for (int32 i = 0; i < N; ++i)
	{
		const float X = Cw * (i + 1);
		Box(X + 4, Top + 10, Cw - 8, 52, Dim, 1.f);
		Txt(Cells[i].Cap, X + Cw / 2, Top + 13, Dim, 0.7f, true);
		Txt(Cells[i].Val, X + Cw / 2, Top + 32, Tc, 1.1f, true);
	}
	// Gear lights, flaps, speedbrake
	const float Ly = Top + 72;
	for (int32 g = 0; g < 3; ++g)
	{
		const FLinearColor Gc = St.gearPos > 0.99 ? FLinearColor(0.1f, 0.9f, 0.2f) : (St.gearPos > 0.01 ? FLinearColor(1.f, 0.2f, 0.1f) : FLinearColor(0.15f, 0.15f, 0.15f));
		DrawRect(Gc, Cw + g * 26.f, Ly, 18, 18);
	}
	Txt(TEXT("GEAR"), Cw + 84, Ly, Dim, 0.75f);
	Txt(FString::Printf(TEXT("FLAPS %s   SPD BRK %s   %s"), St.flapPos > 0.5 ? TEXT("DN") : TEXT("UP"), St.sbPos > 0.05 ? TEXT("OPEN") : TEXT("CLOSED"),
	                    P->Session().fcs.mode() == ControlMode::Beginner ? TEXT("MODE: BEGINNER") : TEXT("MODE: ADVANCED")),
	    Cw * 3, Ly, Tc, 0.8f);
	Txt(TEXT("GAME COCKPIT - generic instruments, NOT an F-16I panel replica (placeholder)"), W - 10 - 560, H - 22, FLinearColor(0.9f, 0.8f, 0.2f, 0.7f), 0.7f);
}

void AKanafHUD::DrawExternalBox(AKanafAircraftPawn* P)
{
	const FlightData& D = P->Session().fm.data();
	const FLinearColor C(0.9f, 0.95f, 0.9f);
	const float X = 20, Y = Canvas->ClipY - 150;
	DrawRect(FLinearColor(0, 0, 0, 0.45f), X - 8, Y - 8, 260, 130);
	Txt(FString::Printf(TEXT("KCAS %4.0f   M %.2f"), D.cas / kKt2Ms, D.mach), X, Y, C);
	Txt(FString::Printf(TEXT("ALT %5.0f ft  AGL %5.0f"), D.altMsl / kFt2M, FMath::Max(0.0, D.wheelAgl / kFt2M)), X, Y + 22, C);
	Txt(FString::Printf(TEXT("HDG %03.0f  VS %+5.0f fpm"), D.headingDeg, D.vsMs / kFt2M * 60.0), X, Y + 44, C);
	Txt(FString::Printf(TEXT("G %.1f  AOA %.1f  THR %.0f%%"), D.nz, D.alpha * kRad2Deg, P->Inputs().throttle * 100.0), X, Y + 66, C);
	Txt(FString::Printf(TEXT("FUEL %.0f kg  GEAR %s"), P->Session().fm.state().fuelKg, P->Session().fm.state().gearPos > 0.99 ? TEXT("DN") : TEXT("UP")), X, Y + 88, C);
}
