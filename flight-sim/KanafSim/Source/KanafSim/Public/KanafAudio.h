// Procedural audio: engine/wind synthesiser (PLACEHOLDER until licensed recordings exist) and a
// helper that turns a rendered radio transmission into a playable procedural sound wave.
#pragma once
#include <atomic>

#include "CoreMinimal.h"
#include "Sound/SoundWaveProcedural.h"
#include "Kanaf/RadioAudio.h"
#include "KanafAudio.generated.h"

UCLASS()
class KANAFSIM_API UKanafEngineSound : public USoundWaveProcedural
{
	GENERATED_BODY()
public:
	UKanafEngineSound(const FObjectInitializer& ObjectInitializer);
	virtual int32 OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples) override;

	// Written by the game thread, read by the audio render thread.
	std::atomic<float> Rpm{0.f};        // 0..1 (idle..max)
	std::atomic<float> Afterburner{0.f};
	std::atomic<float> AirspeedMs{0.f};
	std::atomic<float> EngineGain{0.8f};
	std::atomic<float> WindGain{0.6f};
	std::atomic<bool> bInCockpit{true};

private:
	double Phase1 = 0, Phase2 = 0, Lp1 = 0, Lp2 = 0, Lp3 = 0, Hp = 0, HpPrev = 0;
	uint32 Seed = 22222;
};

namespace KanafAudio
{
	USoundWaveProcedural* MakeRadioWave(UObject* Outer, const kanaf::PcmBuffer& Pcm);
}
