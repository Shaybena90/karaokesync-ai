// Exports a complete scripted session (radio + taxi + pattern flight) for the browser preview:
// frames.json (flight telemetry), terrain grid, runways, radio transmissions (+ WAV files).
// Usage: kanaf_preview_export <outDir>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "Kanaf/Autopilot.h"
#include "Kanaf/Mission.h"
#include "Kanaf/Radio.h"
#include "Kanaf/RadioAudio.h"
#include "Kanaf/Session.h"

using namespace kanaf;

static std::string esc(const std::string& s) {
    std::string o;
    for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
    return o;
}

int main(int argc, char** argv) {
    std::string out = argc > 1 ? argv[1] : ".";
    const std::string data = KANAF_DATA_DIR;
    Catalog cat;
    if (!cat.loadFromDirectory(data + "/Catalog")) return 1;
    std::string text, err;
    readTextFile(data + "/Radio/phrases.he.json", text);
    RadioPhrasebook book;
    if (!book.load(text, err)) return 1;
    RadioVoiceBank bank;
    for (auto& m : book.messages)
        for (auto& fr : book.fragments) {
            if (bank.has(m.voice, fr.first)) continue;
            PcmBuffer pcm;
            if (readWavFile(data + "/Audio/Radio/" + m.voice + "/" + fr.first + ".wav", pcm, err)) bank.add(m.voice, fr.first, pcm);
        }
    SessionConfig cfg;
    cfg.missionId = "pattern_practice"; cfg.controlMode = ControlMode::Advanced; cfg.fuelFraction = 0.7; cfg.runwayEnd = "25L";
    cfg.loadoutPresetId = "f16i_aa_training";
    FlightSession s;
    if (!s.init(cat, cfg, data + "/Terrain/negev_height", err)) { std::printf("%s\n", err.c_str()); return 1; }
    MissionRuntime m; m.start(*s.mission, s);
    RadioDirector d; d.init(&book, {"ofroni", "עפרוני", "ramon", "רמון", s.activeRunwayEnd}, true);
    d.externalTiming = false;
    PatternAutopilot ap; ap.setup(s.activeRunway);
    RadioFxSettings fx;

    FILE* ff = std::fopen((out + "/frames.json").c_str(), "w");
    std::fprintf(ff, "[");
    std::string radioJson = "[";
    double t = 0, nextFrame = 0;
    int nTx = 0;
    bool first = true;
    const double dt = 1.0 / 60;
    auto pump = [&](ControlInputs in, bool fly) {
        if (fly) ap.update(dt, s.fm, in);
        s.tick(dt, in);
        auto ev = s.fm.takeEvents();
        m.update(dt, s, ev);
        d.update(dt, s, ev, m.takeEvents(), &m);
        RadioTransmission tx;
        if (d.startNext(tx)) {
            std::vector<std::string> missing;
            PcmBuffer wet = RadioFx::process(bank.assemble(tx, book, &missing), fx, 77 + nTx);
            d.setCurrentDuration(wet.seconds());
            char name[32]; std::snprintf(name, sizeof name, "tx%02d.wav", nTx);
            writeWavFile(out + "/" + name, wet);
            char buf[1024];
            std::snprintf(buf, sizeof buf, "%s{\"t\":%.2f,\"dur\":%.2f,\"id\":\"%s\",\"speaker\":\"%s\",\"channel\":\"%s\",\"text\":\"%s\",\"file\":\"%s\"}",
                          nTx ? "," : "", t, wet.seconds(), tx.messageId.c_str(), esc(tx.speakerHe).c_str(), esc(book.channelNameHe(tx.channel)).c_str(),
                          esc(tx.subtitleHe).c_str(), name);
            radioJson += buf;
            ++nTx;
        }
        if (t >= nextFrame) {
            const AircraftState& st = s.fm.state(); const FlightData& fd = s.fm.data();
            std::fprintf(ff, "%s[%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.0f,%.1f,%.2f,\"%s\"]",
                         first ? "" : ",", t, st.pos.x, st.pos.y, st.pos.z, fd.rollDeg, fd.pitchDeg, fd.headingDeg, fd.cas / kKt2Ms, fd.altMsl / kFt2M,
                         fd.wheelAgl / kFt2M, fd.alpha * kRad2Deg, fd.nz, st.gearPos, st.flapPos, st.sbPos, in.throttle, st.abLevel, st.fuelKg, fd.vsMs / kFt2M * 60,
                         fd.mach, fly ? ap.phaseName() : "ground");
            first = false;
            nextFrame += 0.2;
        }
        t += dt;
    };
    // Scripted player: request taxi, read back, taxi to the threshold, ready, read back, fly.
    d.chooseReply("r_req_taxi");
    for (int i = 0; i < 60 * 30 && !(d.state() == AtcState::TaxiCleared && !d.isTransmitting()); ++i) { ControlInputs in; in.parkingBrake = true; pump(in, false); }
    d.acknowledgeQuick();
    for (int i = 0; i < 60 * 8; ++i) { ControlInputs in; in.parkingBrake = true; pump(in, false); }
    for (int i = 0; i < 60 * 60 && m.runwayAlong() < 5; ++i) { ControlInputs in; in.throttle = 0.25; pump(in, false); }
    for (int i = 0; i < 60 * 6; ++i) { ControlInputs in; in.brakeLeft = in.brakeRight = 1; pump(in, false); }
    d.chooseReply("r_ready_tko");
    for (int i = 0; i < 60 * 30 && !(d.state() == AtcState::TakeoffCleared && !d.isTransmitting()); ++i) { ControlInputs in; in.parkingBrake = true; pump(in, false); }
    d.acknowledgeQuick();
    for (int i = 0; i < 60 * 6; ++i) { ControlInputs in; in.parkingBrake = true; pump(in, false); }
    for (int i = 0; i < 60 * 900; ++i) {
        pump(ControlInputs{}, true);
        auto r = d.availableReplies();
        if (!r.empty() && !d.isTransmitting() && r[0].id != "r_inbound") d.chooseReply(r[0].id);
        if (ap.phase() == PatternAutopilot::Phase::Stopped) break;
    }
    for (int i = 0; i < 60 * 12; ++i) pump(ControlInputs{}, false);
    std::fprintf(ff, "]");
    std::fclose(ff);
    radioJson += "]";
    FILE* fr = std::fopen((out + "/radio.json").c_str(), "w"); std::fputs(radioJson.c_str(), fr); std::fclose(fr);

    // Terrain grid in NED around the origin (includes runway flattening and earth curvature).
    const int N = 321; const double half = 22000;
    FILE* ft = std::fopen((out + "/terrain.bin").c_str(), "wb");
    for (int i = 0; i < N; ++i)
        for (int j = 0; j < N; ++j) {
            double nn = half - i * (2 * half / (N - 1)), ee = -half + j * (2 * half / (N - 1));
            GeoPoint gp = s.frame.fromNed({nn, ee, 0});
            GroundSample g = s.ground.sampleGeo(gp.latDeg, gp.lonDeg);
            Vec3 p = s.frame.toNed({gp.latDeg, gp.lonDeg, g.heightMslM});
            short v[2] = {short(std::lround(-p.z * 4)), short(std::lround(g.heightMslM))};  // up (0.25 m), MSL (m)
            std::fwrite(v, sizeof v, 1, ft);
        }
    std::fclose(ft);
    std::string rw = "[";
    bool f2 = true;
    for (auto& b : cat.bases) {
        if (greatCircleDistanceM(b.lat, b.lon, s.base->lat, s.base->lon) > 30000) continue;
        for (auto& r : b.runways) {
            GroundSample ga = s.ground.sampleGeo(r.ends[0].lat, r.ends[0].lon), gb = s.ground.sampleGeo(r.ends[1].lat, r.ends[1].lon);
            Vec3 a = s.frame.toNed({r.ends[0].lat, r.ends[0].lon, ga.heightMslM}), c = s.frame.toNed({r.ends[1].lat, r.ends[1].lon, gb.heightMslM});
            char buf[256];
            std::snprintf(buf, sizeof buf, "%s{\"id\":\"%s\",\"a\":[%.1f,%.1f,%.2f],\"b\":[%.1f,%.1f,%.2f],\"w\":%.1f,\"ia\":\"%s\",\"ib\":\"%s\"}", f2 ? "" : ",",
                          r.id.c_str(), a.x, a.y, -a.z, c.x, c.y, -c.z, r.widthM, r.ends[0].ident.c_str(), r.ends[1].ident.c_str());
            rw += buf; f2 = false;
        }
    }
    rw += "]";
    MissionSummary sm = m.summary();
    FILE* fm = std::fopen((out + "/meta.json").c_str(), "w");
    std::fprintf(fm, "{\"runways\":%s,\"gridN\":%d,\"half\":%.0f,\"summary\":{\"result\":\"%s\",\"score\":%d,\"time\":%.0f,\"km\":%.1f,\"maxAltFt\":%.0f,\"maxG\":%.2f,\"fuel\":%.0f,\"sink\":%.2f,\"cross\":%.1f}}",
                 rw.c_str(), N, half, esc(sm.resultHe).c_str(), sm.score, sm.flightTimeS, sm.distanceKm, sm.maxAltMslM / kFt2M, sm.maxG, sm.fuelUsedKg,
                 sm.touchdownSinkMs, sm.touchdownCrossM);
    std::fclose(fm);
    std::printf("frames to t=%.0f s, %d radio transmissions, mission %s score %d\n", t, nTx, sm.resultHe.c_str(), sm.score);
    return 0;
}
