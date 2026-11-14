// Headless flight: runs the pattern autopilot at a base and prints telemetry.
// Usage: kanaf_sim_cli [base] [runwayEnd] [csvOut] [--nodem]
#include <cstdio>
#include <cstring>
#include <string>

#include "Kanaf/Session.h"

using namespace kanaf;

int main(int argc, char** argv) {
    std::string baseId = argc > 1 ? argv[1] : "ramon";
    std::string rwEnd = argc > 2 ? argv[2] : "auto";
    std::string csv = argc > 3 ? argv[3] : "";
    bool noDem = false;
    for (int i = 1; i < argc; ++i) if (std::strcmp(argv[i], "--nodem") == 0) noDem = true;
    if (csv == "--nodem") csv.clear();
    Catalog cat;
    if (!cat.loadFromDirectory(std::string(KANAF_DATA_DIR) + "/Catalog")) {
        for (auto& e : cat.errors()) std::printf("catalog error: %s\n", e.c_str());
        return 1;
    }
    SessionConfig cfg;
    cfg.baseId = baseId;
    cfg.runwayEnd = rwEnd;
    cfg.missionId = "pattern_practice";
    cfg.controlMode = ControlMode::Advanced;
    cfg.fuelFraction = 0.7;
    FlightSession s;
    std::string err;
    if (!s.init(cat, cfg, noDem ? "" : std::string(KANAF_DATA_DIR) + "/Terrain/negev_height", err)) {
        std::printf("session error: %s\n", err.c_str());
        return 1;
    }
    std::printf("base %s runway %s end %s elev %.1f m | terrain: %s\n", s.base->nameEn.c_str(), s.activeRunwayId.c_str(),
                s.activeRunwayEnd.c_str(), s.activeRunway.elevationM, s.terrainMessage.c_str());
    PatternAutopilot ap;
    ap.setup(s.activeRunway);
    FILE* f = csv.empty() ? nullptr : std::fopen(csv.c_str(), "w");
    if (f) std::fprintf(f, "t,phase,north,east,altMsl,agl,cas_kt,alpha_deg,nz,pitch,roll,hdg,vs,fuel,thr\n");
    const double dt = 1.0 / 60.0;
    double lastPrint = -100;
    const char* lastPhase = "";
    for (double t = 0; t < 1500; t += dt) {
        ControlInputs in;
        ap.update(dt, s.fm, in);
        s.tick(dt, in);
        for (auto& e : s.fm.takeEvents()) {
            const char* names[] = {"None", "LiftOff", "Touchdown", "HardLanding", "TailStrike", "Crash", "GearUp", "GearDown", "Stall",
                                   "Overstress", "FuelLow", "FuelBingo", "FlameOut", "StoppedOnGround"};
            std::printf("  [%7.1fs] EVENT %s value=%.2f %s\n", e.time, names[int(e.type)], e.value, e.detail.c_str());
        }
        const FlightData& d = s.fm.data();
        if (f && int(t * 60) % 30 == 0)
            std::fprintf(f, "%.2f,%s,%.1f,%.1f,%.1f,%.1f,%.1f,%.2f,%.2f,%.2f,%.2f,%.1f,%.2f,%.0f,%.2f\n", t, ap.phaseName(), s.fm.state().pos.x,
                         s.fm.state().pos.y, d.altMsl, d.agl, d.cas / kKt2Ms, d.alpha * kRad2Deg, d.nz, d.pitchDeg, d.rollDeg, d.headingDeg, d.vsMs,
                         s.fm.state().fuelKg, in.throttle);
        if (t - lastPrint > 20 || std::strcmp(lastPhase, ap.phaseName()) != 0) {
            std::printf("t=%6.1f %-13s wp=%d alt=%6.0fm agl=%6.1f cas=%5.1fkt a=%5.1f nz=%4.2f pit=%5.1f rol=%6.1f hdg=%5.1f vs=%6.2f fuel=%4.0f\n", t,
                        ap.phaseName(), ap.waypointIndex, d.altMsl, d.agl, d.cas / kKt2Ms, d.alpha * kRad2Deg, d.nz, d.pitchDeg, d.rollDeg,
                        d.headingDeg, d.vsMs, s.fm.state().fuelKg);
            lastPrint = t;
            lastPhase = ap.phaseName();
        }
        if (ap.phase() == PatternAutopilot::Phase::Stopped || ap.phase() == PatternAutopilot::Phase::Aborted) break;
    }
    if (f) std::fclose(f);
    std::printf("RESULT phase=%s crashed=%d reason=%s touchdownSink=%.2f m/s along=%.0f m cross=%.1f m stopAlong=%.0f m stopCross=%.1f m "
                "maxNz=%.2f minNz=%.2f maxAlpha=%.1f minPatternAgl=%.0f m\n",
                ap.phaseName(), s.fm.state().crashed, s.fm.state().crashReason.c_str(), ap.touchdownSink, ap.touchdownAlong, ap.touchdownCross,
                ap.stopAlong, ap.stopCross, ap.maxNz, ap.minNz, ap.maxAlphaDeg, ap.minPatternAglM);
    return ap.phase() == PatternAutopilot::Phase::Stopped ? 0 : 2;
}
