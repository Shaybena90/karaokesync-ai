#include "KanafAudio.h"

UKanafEngineSound::UKanafEngineSound(const FObjectInitializer& OI) : Super(OI)
{
	SetSampleRate(22050);
	NumChannels = 1;
	Duration = INDEFINITELY_LOOPING_DURATION;
	bLooping = false;
	bProcedural = true;
}

int32 UKanafEngineSound::OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples)
{
	const double Fs = 22050.0;
	const float R = Rpm.load(), Ab = Afterburner.load(), V = AirspeedMs.load();
	const float Eg = EngineGain.load(), Wg = WindGain.load();
	const bool bCockpit = bInCockpit.load();
	OutAudio.SetNumUninitialized(NumSamples * 2);
	int16* Out = reinterpret_cast<int16*>(OutAudio.GetData());
	const double Whine = 600.0 + 2600.0 * R, Fan = 90.0 + 160.0 * R;
	const double RoarCut = 0.02 + 0.10 * R + 0.05 * Ab;                 // one-pole coefficient
	const double WindAmp = FMath::Clamp(V / 250.0, 0.0, 1.2) * Wg;
	const double Muffle = bCockpit ? 0.55 : 1.0;                         // canopy attenuation (game value)
	for (int32 i = 0; i < NumSamples; ++i)
	{
		Seed ^= Seed << 13; Seed ^= Seed >> 17; Seed ^= Seed << 5;
		const double N = (Seed & 0xFFFF) / 32768.0 - 1.0;
		Lp1 += RoarCut * (N - Lp1);                     // jet roar
		Lp2 += 0.004 * (N - Lp2);                       // afterburner rumble
		Lp3 += (0.03 + 0.1 * FMath::Min(1.0, WindAmp)) * (N - Lp3);
		const double WindHp = Lp3 - Hp; Hp += 0.01 * (Lp3 - Hp);   // band-passed wind noise
		Phase1 += 2 * PI * Whine / Fs; if (Phase1 > 2 * PI) Phase1 -= 2 * PI;
		Phase2 += 2 * PI * Fan / Fs; if (Phase2 > 2 * PI) Phase2 -= 2 * PI;
		double S = 0;
		S += Lp1 * (0.6 + 1.2 * R) * Muffle;
		S += Lp2 * 6.0 * Ab;
		S += (FMath::Sin(Phase1) * 0.05 + FMath::Sin(2 * Phase1) * 0.02) * (0.3 + R) * (bCockpit ? 0.7 : 1.0);
		S += FMath::Sin(Phase2) * 0.04 * R;
		S *= Eg;
		S += WindHp * 2.5 * WindAmp;
		Out[i] = int16(FMath::Clamp(S, -1.0, 1.0) * 30000.0);
	}
	return NumSamples;
}

USoundWaveProcedural* KanafAudio::MakeRadioWave(UObject* Outer, const kanaf::PcmBuffer& Pcm)
{
	USoundWaveProcedural* W = NewObject<USoundWaveProcedural>(Outer);
	W->SetSampleRate(Pcm.sampleRate);
	W->NumChannels = 1;
	W->Duration = float(Pcm.seconds());
	W->bLooping = false;
	TArray<int16> S;
	S.SetNumUninitialized(Pcm.samples.size());
	for (int32 i = 0; i < S.Num(); ++i) S[i] = int16(FMath::Clamp(Pcm.samples[i], -1.f, 1.f) * 32767.f);
	W->QueueAudio(reinterpret_cast<const uint8*>(S.GetData()), S.Num() * sizeof(int16));
	return W;
}
