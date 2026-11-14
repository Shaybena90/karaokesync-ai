#include "Kanaf/RadioAudio.h"

#include <cmath>
#include <cstdio>
#include <cstring>

#include "Kanaf/MathTypes.h"

namespace kanaf {

namespace {
unsigned rd16(const unsigned char* p) { return unsigned(p[0]) | (unsigned(p[1]) << 8); }
unsigned rd32(const unsigned char* p) { return rd16(p) | (rd16(p + 2) << 16); }
void wr16(std::vector<unsigned char>& v, unsigned x) { v.push_back((unsigned char)(x & 0xFF)); v.push_back((unsigned char)((x >> 8) & 0xFF)); }
void wr32(std::vector<unsigned char>& v, unsigned x) { wr16(v, x & 0xFFFF); wr16(v, (x >> 16) & 0xFFFF); }

struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
    static Biquad lowpass(double fc, double fs, double q = 0.7071) {
        Biquad f; double w = 2 * kPi * fc / fs, c = std::cos(w), s = std::sin(w), al = s / (2 * q), a0 = 1 + al;
        f.b0 = (1 - c) / 2 / a0; f.b1 = (1 - c) / a0; f.b2 = (1 - c) / 2 / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al) / a0; return f;
    }
    static Biquad highpass(double fc, double fs, double q = 0.7071) {
        Biquad f; double w = 2 * kPi * fc / fs, c = std::cos(w), s = std::sin(w), al = s / (2 * q), a0 = 1 + al;
        f.b0 = (1 + c) / 2 / a0; f.b1 = -(1 + c) / a0; f.b2 = (1 + c) / 2 / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al) / a0; return f;
    }
    static Biquad peak(double fc, double fs, double q, double gainDb) {
        Biquad f; double A = std::pow(10, gainDb / 40), w = 2 * kPi * fc / fs, c = std::cos(w), s = std::sin(w), al = s / (2 * q);
        double a0 = 1 + al / A; f.b0 = (1 + al * A) / a0; f.b1 = -2 * c / a0; f.b2 = (1 - al * A) / a0; f.a1 = -2 * c / a0; f.a2 = (1 - al / A) / a0; return f;
    }
    double run(double x) { double y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; }
};

struct Rng {
    unsigned s;
    explicit Rng(unsigned seed) : s(seed ? seed : 1) {}
    double next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s & 0xFFFFFF) / double(0xFFFFFF) * 2.0 - 1.0; }
};
}  // namespace

bool decodeWav(const std::vector<unsigned char>& b, PcmBuffer& out, std::string& err) {
    if (b.size() < 44 || std::memcmp(b.data(), "RIFF", 4) != 0 || std::memcmp(b.data() + 8, "WAVE", 4) != 0) { err = "not a WAV file"; return false; }
    size_t p = 12;
    unsigned fmt = 0, ch = 0, rate = 0, bits = 0;
    const unsigned char* data = nullptr;
    size_t dataLen = 0;
    while (p + 8 <= b.size()) {
        unsigned len = rd32(&b[p + 4]);
        if (std::memcmp(&b[p], "fmt ", 4) == 0 && p + 8 + 16 <= b.size()) {
            fmt = rd16(&b[p + 8]); ch = rd16(&b[p + 10]); rate = rd32(&b[p + 12]); bits = rd16(&b[p + 22]);
            if (fmt == 0xFFFE && len >= 40) fmt = rd16(&b[p + 8 + 24]);  // WAVE_FORMAT_EXTENSIBLE subformat
        } else if (std::memcmp(&b[p], "data", 4) == 0) {
            data = &b[p + 8];
            dataLen = std::min<size_t>(len, b.size() - (p + 8));
        }
        p += 8 + len + (len & 1);
    }
    if (!data || ch == 0 || rate == 0) { err = "WAV missing fmt/data"; return false; }
    std::vector<float> mono;
    if (fmt == 1 && bits == 16) {
        size_t n = dataLen / (2 * ch);
        mono.resize(n);
        for (size_t i = 0; i < n; ++i) {
            double acc = 0;
            for (unsigned c = 0; c < ch; ++c) acc += double(short(rd16(data + 2 * (i * ch + c)))) / 32768.0;
            mono[i] = float(acc / ch);
        }
    } else if (fmt == 3 && bits == 32) {
        size_t n = dataLen / (4 * ch);
        mono.resize(n);
        for (size_t i = 0; i < n; ++i) {
            double acc = 0;
            for (unsigned c = 0; c < ch; ++c) { float f; std::memcpy(&f, data + 4 * (i * ch + c), 4); acc += f; }
            mono[i] = float(acc / ch);
        }
    } else {
        err = "unsupported WAV format (need PCM16 or float32)";
        return false;
    }
    out.sampleRate = kRadioSampleRate;
    if (int(rate) == kRadioSampleRate) { out.samples = std::move(mono); return true; }
    double ratio = double(rate) / kRadioSampleRate;
    size_t n = size_t(mono.size() / ratio);
    out.samples.resize(n);
    for (size_t i = 0; i < n; ++i) {
        double src = i * ratio;
        size_t k = size_t(src);
        double fr = src - k;
        float a = mono[std::min(k, mono.size() - 1)], c = mono[std::min(k + 1, mono.size() - 1)];
        out.samples[i] = float(a + (c - a) * fr);
    }
    return true;
}

std::vector<unsigned char> encodeWav16(const PcmBuffer& pcm) {
    std::vector<unsigned char> v;
    unsigned n = unsigned(pcm.samples.size());
    v.insert(v.end(), {'R', 'I', 'F', 'F'}); wr32(v, 36 + n * 2); v.insert(v.end(), {'W', 'A', 'V', 'E'});
    v.insert(v.end(), {'f', 'm', 't', ' '}); wr32(v, 16); wr16(v, 1); wr16(v, 1); wr32(v, unsigned(pcm.sampleRate));
    wr32(v, unsigned(pcm.sampleRate) * 2); wr16(v, 2); wr16(v, 16);
    v.insert(v.end(), {'d', 'a', 't', 'a'}); wr32(v, n * 2);
    for (float f : pcm.samples) {
        int s = int(std::lround(clampd(f, -1, 1) * 32767));
        wr16(v, unsigned(s) & 0xFFFF);
    }
    return v;
}

bool readWavFile(const std::string& path, PcmBuffer& out, std::string& err) {
    std::string s;
    if (!readTextFile(path, s)) { err = "cannot read " + path; return false; }
    return decodeWav(std::vector<unsigned char>(s.begin(), s.end()), out, err);
}

bool writeWavFile(const std::string& path, const PcmBuffer& pcm) {
    auto bytes = encodeWav16(pcm);
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    std::fwrite(bytes.data(), 1, bytes.size(), f);
    std::fclose(f);
    return true;
}

PcmBuffer RadioFx::process(const PcmBuffer& dry, const RadioFxSettings& s, unsigned seed) {
    const double fs = dry.sampleRate;
    Rng rng(seed);
    PcmBuffer out;
    out.sampleRate = dry.sampleRate;
    const double st = clampd(s.effectStrength, 0, 1);
    const size_t clickN = size_t(0.018 * fs), headN = size_t(0.07 * fs), tailN = s.squelch ? size_t(0.16 * fs) : 0;
    out.samples.assign(clickN + headN + dry.samples.size() + tailN, 0.f);

    // Voice chain: HP 350 Hz x2, LP 2900 Hz x2 (telephone-like band), presence peak, compressor, soft clip.
    Biquad hp1 = Biquad::highpass(350, fs), hp2 = Biquad::highpass(350, fs);
    Biquad lp1 = Biquad::lowpass(2900, fs), lp2 = Biquad::lowpass(2900, fs);
    Biquad pres = Biquad::peak(1800, fs, 1.0, 5.0);
    double env = 0, peak = 1e-6;
    for (float x : dry.samples) peak = std::max(peak, double(std::fabs(x)));
    const double norm = 0.7 / peak;
    const double att = std::exp(-1.0 / (0.003 * fs)), rel = std::exp(-1.0 / (0.08 * fs));
    const double thresh = 0.12, ratio = 4.0, drive = 1.0 + 3.0 * st;
    Biquad nlp = Biquad::lowpass(3200, fs), nhp = Biquad::highpass(500, fs);
    const double hiss = 0.035 * clampd(s.noiseLevel, 0, 1) * st;

    size_t o = clickN + headN;
    for (size_t i = 0; i < dry.samples.size(); ++i) {
        double x = dry.samples[i] * norm;
        double y = lp2.run(lp1.run(hp2.run(hp1.run(x))));
        y = pres.run(y);
        double a = std::fabs(y);
        env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
        double gain = env > thresh ? std::pow(env / thresh, 1.0 / ratio - 1.0) : 1.0;
        y *= gain * 2.2;
        y = std::tanh(y * drive) / std::tanh(drive);  // mild saturation
        double n = nhp.run(nlp.run(rng.next())) * hiss;
        double wet = y * 0.8 + n;
        out.samples[o + i] = float(lerpd(x * 0.8, wet, st));
    }
    // Key-up click + opening hiss
    for (size_t i = 0; i < clickN; ++i) {
        double e = std::exp(-double(i) / (0.003 * fs));
        out.samples[i] = float((rng.next() * 0.5 + std::sin(2 * kPi * 1200 * i / fs) * 0.3) * e * (0.3 + 0.7 * st));
    }
    for (size_t i = 0; i < headN; ++i) out.samples[clickN + i] = float(nhp.run(nlp.run(rng.next())) * hiss * 1.5);
    // Squelch tail: burst of band-limited noise that decays fast (the characteristic "kssht").
    size_t t0 = clickN + headN + dry.samples.size();
    for (size_t i = 0; i < tailN; ++i) {
        double e = std::exp(-double(i) / (0.045 * fs));
        double n = nhp.run(nlp.run(rng.next()));
        out.samples[t0 + i] = float(n * e * (0.06 + 0.25 * st * std::max(0.3, s.noiseLevel)));
    }
    for (auto& v : out.samples) v = float(clampd(v * s.volume, -1, 1));
    return out;
}

void RadioVoiceBank::add(const std::string& voice, const std::string& frag, PcmBuffer pcm) { bank_[voice + "/" + frag] = std::move(pcm); }
bool RadioVoiceBank::has(const std::string& voice, const std::string& frag) const { return bank_.count(voice + "/" + frag) > 0; }

PcmBuffer RadioVoiceBank::assemble(const RadioTransmission& t, const RadioPhrasebook& book, std::vector<std::string>* missing) const {
    PcmBuffer out;
    const size_t gap = size_t(0.04 * kRadioSampleRate), comma = size_t(0.16 * kRadioSampleRate);
    for (auto& f : t.fragmentIds) {
        if (f == ",") { out.samples.insert(out.samples.end(), comma, 0.f); continue; }
        auto it = bank_.find(t.voice + "/" + f);
        if (it == bank_.end()) {
            if (missing) missing->push_back(t.voice + "/" + f);
            const RadioFragment* fr = book.fragment(f);
            size_t n = size_t((fr ? 0.075 * fr->pron.size() : 0.3) * kRadioSampleRate);
            out.samples.insert(out.samples.end(), n, 0.f);
        } else {
            // trim leading/trailing near-silence from TTS output to keep a brisk radio cadence
            const auto& s = it->second.samples;
            size_t a = 0, b = s.size();
            while (a < b && std::fabs(s[a]) < 0.01f) ++a;
            while (b > a && std::fabs(s[b - 1]) < 0.01f) --b;
            out.samples.insert(out.samples.end(), s.begin() + long(a), s.begin() + long(b));
        }
        out.samples.insert(out.samples.end(), gap, 0.f);
    }
    return out;
}

}  // namespace kanaf
