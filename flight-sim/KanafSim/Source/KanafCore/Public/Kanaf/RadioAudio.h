// Radio audio: WAV I/O, per-voice fragment bank, message assembly and the radio effect chain
// (band-pass, compression, mild distortion, background hiss, key-up click, squelch tail).
#pragma once
#include <map>
#include <string>
#include <vector>

#include "Kanaf/Radio.h"

namespace kanaf {

constexpr int kRadioSampleRate = 22050;

struct PcmBuffer {
    int sampleRate = kRadioSampleRate;
    std::vector<float> samples;  // mono, -1..1
    double seconds() const { return sampleRate > 0 ? double(samples.size()) / sampleRate : 0; }
};

bool decodeWav(const std::vector<unsigned char>& bytes, PcmBuffer& out, std::string& error);  // PCM16/float32, any rate -> mono 22050
std::vector<unsigned char> encodeWav16(const PcmBuffer& pcm);
bool readWavFile(const std::string& path, PcmBuffer& out, std::string& error);
bool writeWavFile(const std::string& path, const PcmBuffer& pcm);

struct RadioFxSettings {
    double effectStrength = 1.0;  // 0 = clean voice, 1 = full radio processing
    double noiseLevel = 0.5;      // 0..1 background hiss amount
    double volume = 1.0;          // radio channel volume
    bool squelch = true;
};

class RadioFx {
public:
    // Processes a dry voice signal into a radio transmission (adds click + squelch tail).
    static PcmBuffer process(const PcmBuffer& dry, const RadioFxSettings& s, unsigned seed = 1234);
};

class RadioVoiceBank {
public:
    // Fragment loader callback style: the caller provides bytes for "<voice>/<fragment>.wav".
    void add(const std::string& voice, const std::string& fragment, PcmBuffer pcm);
    bool has(const std::string& voice, const std::string& fragment) const;
    // Assemble a transmission's dry signal. Missing fragments are reported in `missing` and
    // replaced by silence proportional to text length (so timing/subtitles stay correct).
    PcmBuffer assemble(const RadioTransmission& t, const RadioPhrasebook& book, std::vector<std::string>* missing) const;
    size_t size() const { return bank_.size(); }

private:
    std::map<std::string, PcmBuffer> bank_;  // key voice/fragment
};

}  // namespace kanaf
