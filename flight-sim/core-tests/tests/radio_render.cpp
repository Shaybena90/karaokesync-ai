// Renders radio transmissions (fragments -> radio FX chain) to WAV files for listening checks.
// Usage: kanaf_radio_render <outDir> [noise 0..1] [strength 0..1]
#include <cstdio>
#include <cstdlib>
#include <string>

#include "Kanaf/RadioAudio.h"

using namespace kanaf;

int main(int argc, char** argv) {
    std::string out = argc > 1 ? argv[1] : ".";
    RadioFxSettings fx;
    if (argc > 2) fx.noiseLevel = std::atof(argv[2]);
    if (argc > 3) fx.effectStrength = std::atof(argv[3]);
    const std::string data = KANAF_DATA_DIR;
    std::string text, err;
    readTextFile(data + "/Radio/phrases.he.json", text);
    RadioPhrasebook book;
    if (!book.load(text, err)) { std::printf("phrasebook: %s\n", err.c_str()); return 1; }
    RadioVoiceBank bank;
    int loaded = 0;
    for (auto& m : book.messages)
        for (auto& fr : book.fragments) {
            if (bank.has(m.voice, fr.first)) continue;
            PcmBuffer pcm;
            if (readWavFile(data + "/Audio/Radio/" + m.voice + "/" + fr.first + ".wav", pcm, err)) { bank.add(m.voice, fr.first, pcm); ++loaded; }
        }
    RadioDirector d;
    d.init(&book, {"ofroni", "עפרוני", "ramon", "רמון", "25L"}, false);
    d.setAltitudeForPreview(6000);
    d.setWaypointForPreview("mitzpe_ramon");
    const char* ids[] = {"p_req_taxi", "t_taxi_clear", "t_tko_clear", "t_contact_control", "p_checkin_control", "p_wp_report",
                         "t_report_final", "t_cleared_land", "t_check_gear", "t_landed_good"};
    std::printf("loaded %d clips\n", loaded);
    int missingTotal = 0;
    for (auto id : ids) {
        RadioTransmission t;
        d.preview(id, t);
        std::vector<std::string> missing;
        PcmBuffer dry = bank.assemble(t, book, &missing);
        PcmBuffer wet = RadioFx::process(dry, fx);
        std::string path = out + "/" + id + ".wav";
        writeWavFile(path, wet);
        missingTotal += int(missing.size());
        std::printf("%-18s %-12s %5.2fs  [%s] %s\n", id, t.voice.c_str(), wet.seconds(), t.speakerHe.c_str(), t.subtitleHe.c_str());
        for (auto& m : missing) std::printf("    MISSING %s\n", m.c_str());
    }
    std::printf("missing fragments: %d\n", missingTotal);
    return missingTotal == 0 ? 0 : 2;
}
