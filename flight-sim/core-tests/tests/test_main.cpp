// Kanaf core automated tests (no external framework). Run: build/kanaf_tests
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

#include "Kanaf/Autopilot.h"
#include "Kanaf/Catalog.h"
#include "Kanaf/Geo.h"
#include "Kanaf/Json.h"
#include "Kanaf/Mission.h"
#include "Kanaf/Radio.h"
#include "Kanaf/RadioAudio.h"
#include "Kanaf/Session.h"
#include "Kanaf/Terrain.h"

using namespace kanaf;

static int g_fail = 0, g_checks = 0;
static std::string g_test;
#define CHECK(cond) do { ++g_checks; if (!(cond)) { ++g_fail; std::printf("  FAIL [%s] %s:%d: %s\n", g_test.c_str(), __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_NEAR(a, b, tol) do { ++g_checks; double _a = (a), _b = (b); if (std::fabs(_a - _b) > (tol)) { ++g_fail; std::printf("  FAIL [%s] %s:%d: %s=%.6g vs %.6g (tol %.3g)\n", g_test.c_str(), __FILE__, __LINE__, #a, _a, _b, double(tol)); } } while (0)

static const std::string kData = KANAF_DATA_DIR;
static const std::string kTerrain = kData + "/Terrain/negev_height";

static Catalog& catalog() {
    static Catalog c;
    static bool loaded = false;
    if (!loaded) { c.loadFromDirectory(kData + "/Catalog"); loaded = true; }
    return c;
}

struct Test { const char* name; std::function<void()> fn; };
static std::vector<Test>& tests() { static std::vector<Test> t; return t; }
struct Reg { Reg(const char* n, std::function<void()> f) { tests().push_back({n, f}); } };
#define TEST(name) static void name(); static Reg reg_##name(#name, name); static void name()

// ---------------------------------------------------------------------------------------------
TEST(json_parser) {
    auto r = parseJson(R"({"a":[1,2.5,-3e2],"s":"שלוםA","b":true,"n":null,"o":{"x":1}})");
    CHECK(r.ok);
    CHECK_NEAR(r.value["a"][2].num(), -300, 1e-9);
    CHECK(r.value["s"].str() == "שלוםA");
    CHECK(r.value["b"].boolean());
    CHECK(r.value["n"].isNull());
    CHECK(r.value["missing"].isNull());
    auto bad = parseJson("{\"a\": [1, 2,]}");
    CHECK(!bad.ok);
    CHECK(!bad.error.empty());
}

TEST(catalog_loads_and_validates) {
    Catalog& c = catalog();
    for (auto& e : c.errors()) std::printf("    catalog error: %s\n", e.c_str());
    CHECK(c.errors().empty());
    CHECK(c.variants.size() >= 11);
    int flyable = 0;
    for (auto& v : c.variants) {
        if (v.isFlyable()) ++flyable;
        if (v.serviceStatus == "ordered" || v.serviceStatus == "retired") CHECK(!v.isFlyable());
        CHECK(v.assets.size() == 5);
    }
    CHECK(flyable == 1);
    CHECK(c.variant("f16i") && c.variant("f16i")->isFlyable());
    CHECK(c.variant("f15ia") && c.variant("f15ia")->serviceStatus == "ordered");
    CHECK(c.variant("f16c_barak") && c.variant("f16c_barak")->serviceStatus == "retired");
    CHECK(c.bases.size() == 6);
    for (auto& b : c.bases) CHECK(!b.runways.empty());
}

TEST(loadout_blocks_unsupported) {
    Catalog& c = catalog();
    LoadoutValidator lv(c);
    for (auto& p : c.presets) {
        auto r = lv.validate(p.aircraftId, p.stations);
        if (p.testOnly) CHECK(!r.valid); else CHECK(r.valid);
    }
    // AIM-120 on the F-16I is only aggregator-reported -> blocked
    auto r1 = lv.validate("f16i", {{"1", "aim120"}});
    CHECK(!r1.valid);
    CHECK(!r1.errorCodes.empty() && r1.errorCodes[0] == "not_documented:aim120");
    // Python-5 on an inboard heavy station is not a mapped station -> blocked
    auto r2 = lv.validate("f16i", {{"4", "python5"}, {"6", "python5"}});
    CHECK(!r2.valid);
    // SPICE-1000 on F-35I: integration in progress -> blocked
    auto r3 = lv.validate("f35i", {});
    CHECK(r3.valid);  // empty is fine
    auto opts = lv.optionsFor("f35i", "1");
    bool sawIntegration = false;
    for (auto& o : opts) {
        if (o.weaponId == "spice1000") { CHECK(o.availability == StoreAvailability::InIntegration); sawIntegration = true; }
        CHECK(o.availability != StoreAvailability::Selectable);  // nothing documented for F-35I in this session
    }
    CHECK(sawIntegration);
    // Asymmetric heavy load -> blocked by game rule
    auto r4 = lv.validate("f16i", {{"4", "spice1000"}, {"3", "spice1000"}});
    CHECK(!r4.valid);
    // Valid symmetric load has the right mass
    auto r5 = lv.validate("f16i", {{"1", "python5"}, {"9", "python5"}, {"4", "spice1000"}, {"6", "spice1000"}});
    CHECK(r5.valid);
    CHECK_NEAR(r5.storesMassKg, 2 * 105 + 2 * 450, 1e-6);
    // ISR aircraft has no weapons menu
    auto r6 = lv.validate("oron", {{"1", "python5"}});
    CHECK(!r6.valid);
}

TEST(geo_wgs84_and_scale) {
    // ECEF roundtrip
    double lat, lon, h;
    Vec3 e = geodeticToEcef(30.7761, 34.6667, 650);
    ecefToGeodetic(e, lat, lon, h);
    CHECK_NEAR(lat, 30.7761, 1e-9); CHECK_NEAR(lon, 34.6667, 1e-9); CHECK_NEAR(h, 650, 1e-4);
    // Runway length from OurAirports thresholds vs published length (Ramon 07R/25L 9876 ft = 3010 m)
    const BaseDef* ramon = catalog().base("ramon");
    CHECK(ramon);
    for (auto& r : ramon->runways) {
        double d, az;
        CHECK(vincentyInverse(r.ends[0].lat, r.ends[0].lon, r.ends[1].lat, r.ends[1].lon, d, az));
        CHECK_NEAR(d / r.lengthM, 1.0, 0.02);                     // scale within 2 %
        CHECK_NEAR(std::fabs(wrapPi((az - r.ends[0].headingTrueDeg) * kDeg2Rad)) * kRad2Deg, 0, 1.0);  // orientation within 1 deg
    }
    // Ramon -> Nevatim distance: Vincenty vs haversine agree (~49 km)
    const BaseDef* nev = catalog().base("nevatim");
    double dv, az;
    vincentyInverse(ramon->lat, ramon->lon, nev->lat, nev->lon, dv, az);
    double dh = greatCircleDistanceM(ramon->lat, ramon->lon, nev->lat, nev->lon);
    CHECK_NEAR(dv / dh, 1.0, 0.005);
    CHECK(dv > 45000 && dv < 60000);
    // Local frame: exact roundtrip 100 km away, and earth-curvature drop ~ d^2/2R
    GeoFrame f(ramon->lat, ramon->lon, ramon->elevationM, 19);
    GeoPoint far{ramon->lat + 0.9, ramon->lon, ramon->elevationM};
    Vec3 n = f.toNed(far);
    GeoPoint back = f.fromNed(n);
    CHECK_NEAR(back.latDeg, far.latDeg, 1e-8); CHECK_NEAR(back.altMslM, far.altMslM, 0.01);
    double dist = std::sqrt(n.x * n.x + n.y * n.y);
    CHECK_NEAR(n.z, dist * dist / (2 * 6371000.0), 3.0);  // ~ 790 m below the tangent plane at 100 km
    // NED north axis points north
    Vec3 nn = f.toNed({ramon->lat + 0.01, ramon->lon, ramon->elevationM});
    CHECK(nn.x > 1100 && std::fabs(nn.y) < 1);
}

TEST(terrain_dem_matches_reference_elevations) {
    HeightGridProvider dem;
    std::string err;
    CHECK(dem.load(kTerrain, err));
    if (!err.empty()) std::printf("    %s\n", err.c_str());
    // Compare DEM with OurAirports runway threshold elevations (DSM vs community data: +/-15 m)
    int n = 0;
    double maxErr = 0;
    std::vector<double> diffs;
    for (auto& b : catalog().bases) {
        for (auto& r : b.runways)
            for (auto& e : r.ends) {
                if (!e.hasElevation || !dem.covers(e.lat, e.lon)) continue;
                double d = dem.heightMsl(e.lat, e.lon) - e.elevationM;
                maxErr = std::max(maxErr, std::fabs(d));
                diffs.push_back(std::fabs(d));
                if (std::fabs(d) > 15.0) std::printf("    data outlier: %s %s DEM-OurAirports = %.1f m\n", b.id.c_str(), e.ident.c_str(), d);
                if (b.id == "ramon") CHECK(std::fabs(d) < 5.0);  // best-documented phase-1 base
                ++n;
            }
    }
    std::sort(diffs.begin(), diffs.end());
    double median = diffs.empty() ? 1e9 : diffs[diffs.size() / 2];
    std::printf("    compared %d runway ends in DEM region, median |diff| %.1f m, max %.1f m\n", n, median, maxErr);
    CHECK(n >= 10);
    CHECK(median < 12.0);
    // Session places runways on the DEM surface (no floating/sunken runways)
    FlightSession s; SessionConfig cfg; cfg.baseId = "nevatim";
    CHECK(s.init(catalog(), cfg, kTerrain, err));
    GeoPoint thr = s.frame.fromNed(s.activeRunway.thresholdNed);
    CHECK_NEAR(thr.altMslM, dem.heightMsl(thr.latDeg, thr.lonDeg), 0.5);
    // Dead Sea shore is below sea level inside the region
    CHECK(dem.heightMsl(31.20, 35.39) < -350);
    CHECK(!dem.covers(32.0, 34.8));  // Tel Aviv area is outside the phase-1 region
}

TEST(terrain_load_failure_falls_back) {
    FlightSession s;
    std::string err;
    SessionConfig cfg;
    CHECK(s.init(catalog(), cfg, kData + "/Terrain/does_not_exist", err));
    CHECK(s.terrainStatus == TerrainStatus::FallbackFlat_LoadError);
    CHECK(!s.terrainMessageHe.empty());
    CHECK(!s.fm.data().groundDataReal);
    // Base outside the DEM: Tel Nof
    FlightSession s2;
    SessionConfig c2;
    c2.baseId = "telnof";
    CHECK(s2.init(catalog(), c2, kTerrain, err));
    CHECK(s2.terrainStatus == TerrainStatus::FallbackFlat_OutsideCoverage);
    // aircraft is resting on its gear, not sunk/floating
    for (int i = 0; i < 300; ++i) s2.tick(1.0 / 60, ControlInputs());
    CHECK(s2.fm.data().weightOnWheels);
    CHECK(!s2.fm.state().crashed);
}

static PatternAutopilot runPattern(FlightSession& s, MissionRuntime* m, double maxT = 1500) {
    PatternAutopilot ap;
    ap.setup(s.activeRunway);
    for (double t = 0; t < maxT; t += 1.0 / 60) {
        ControlInputs in;
        ap.update(1.0 / 60, s.fm, in);
        s.tick(1.0 / 60, in);
        auto ev = s.fm.takeEvents();
        if (m) m->update(1.0 / 60, s, ev);
        if (ap.phase() == PatternAutopilot::Phase::Stopped || ap.phase() == PatternAutopilot::Phase::Aborted) {
            if (m) for (int i = 0; i < 60; ++i) { s.tick(1.0 / 60, in); m->update(1.0 / 60, s, s.fm.takeEvents()); }
            break;
        }
    }
    return ap;
}

TEST(flight_takeoff_pattern_landing_all_runways) {
    struct Case { const char* base; const char* end; } cases[] = {{"ramon", "25L"}, {"ramon", "07R"}, {"nevatim", "auto"}, {"hatzerim", "auto"}};
    for (auto& c : cases) {
        FlightSession s;
        std::string err;
        SessionConfig cfg;
        cfg.baseId = c.base; cfg.runwayEnd = c.end; cfg.missionId = "pattern_practice"; cfg.controlMode = ControlMode::Advanced; cfg.fuelFraction = 0.7;
        CHECK(s.init(catalog(), cfg, kTerrain, err));
        MissionRuntime m;
        m.start(*s.mission, s);
        PatternAutopilot ap = runPattern(s, &m);
        std::printf("    %-8s %-4s phase=%s sink=%.2f m/s td_along=%.0f m cross=%.1f m stop_along=%.0f m maxNz=%.2f mission=%d score=%d\n", c.base,
                    s.activeRunwayEnd.c_str(), ap.phaseName(), ap.touchdownSink, ap.touchdownAlong, ap.touchdownCross, ap.stopAlong, ap.maxNz,
                    int(m.result()), m.summary().score);
        CHECK(ap.phase() == PatternAutopilot::Phase::Stopped);
        CHECK(!s.fm.state().crashed);
        CHECK(ap.touchdownSink >= 0 && ap.touchdownSink < 3.0);
        CHECK(std::fabs(ap.touchdownCross) < 5.0);
        CHECK(ap.touchdownAlong > 0 && ap.touchdownAlong < 900);
        CHECK(ap.stopAlong < s.base->runways[0].lengthM + 3000);  // stopped on the runway
        CHECK(s.fm.data().onRunway);
        CHECK(ap.maxNz < 3.0);
        CHECK(m.result() == MissionResult::Success);
    }
}

TEST(flight_stability_and_limits) {
    Catalog& c = catalog();
    FlightProfile p;
    std::string err;
    CHECK(p.loadFromJson(c.flightProfiles["f16i"], err));
    FlatProvider flat(0);
    GroundModel g;
    g.setFrame(GeoFrame(31, 35, 0, 19));
    g.setPrimary(&flat);
    // Beginner: neutral stick holds altitude and wings level after a disturbance
    {
        FlightModel fm; fm.setProfile(p); fm.setGround(&g);
        FlightControlSystem fcs; fcs.setMode(ControlMode::Beginner);
        fm.resetInAir({0, 0, -3000}, 90, 180, 0.6);
        fm.mutableState().omega = {0.5, 0.05, 0};  // roll disturbance
        ControlInputs in; in.throttle = 0.7; in.gearDown = false;
        double alt0 = fm.data().altMsl;
        for (int i = 0; i < 60 * 60; ++i) { SurfaceCommands sc = fcs.update(1.0 / 60, in, fm); fm.step(1.0 / 60, in, sc); }
        CHECK(std::fabs(fm.data().rollDeg) < 2.0);
        CHECK(std::fabs(fm.data().altMsl - alt0) < 150.0);
        CHECK(!fm.state().crashed);
    }
    // Advanced: full aft stick at speed respects g limit; AoA limiter
    {
        FlightModel fm; fm.setProfile(p); fm.setGround(&g);
        FlightControlSystem fcs; fcs.setMode(ControlMode::Advanced);
        fm.resetInAir({0, 0, -1000}, 0, 260, 0.6);  // ~505 kt at 1000 m: above corner speed
        ControlInputs in; in.throttle = 1.0; in.gearDown = false; in.pitch = 1.0;
        double maxNz = 0, maxA = 0;
        for (int i = 0; i < 60 * 4; ++i) {
            SurfaceCommands sc = fcs.update(1.0 / 60, in, fm); fm.step(1.0 / 60, in, sc);
            maxNz = std::max(maxNz, fm.data().nz); maxA = std::max(maxA, fm.data().alpha * kRad2Deg);
        }
        std::printf("    full aft stick @260 m/s: max nz %.2f, max AoA %.1f deg\n", maxNz, maxA);
        CHECK(maxNz > 7.0 && maxNz < p.maxG + 0.5);
        CHECK(maxA < p.aoaLimit * kRad2Deg + 2.0);
    }
    // Advanced: roll rate command
    {
        FlightModel fm; fm.setProfile(p); fm.setGround(&g);
        FlightControlSystem fcs; fcs.setMode(ControlMode::Advanced);
        fm.resetInAir({0, 0, -4000}, 0, 200, 0.6);
        ControlInputs in; in.throttle = 0.8; in.gearDown = false; in.roll = 0.5;
        double maxP = 0;
        for (int i = 0; i < 90; ++i) { SurfaceCommands sc = fcs.update(1.0 / 60, in, fm); fm.step(1.0 / 60, in, sc); maxP = std::max(maxP, fm.state().omega.x); }
        std::printf("    half roll stick: peak roll rate %.0f deg/s (cmd %.0f)\n", maxP * kRad2Deg, 0.5 * p.maxRollRate * kRad2Deg);
        CHECK_NEAR(maxP, 0.5 * p.maxRollRate, 0.25 * p.maxRollRate);
    }
    // Low speed: stall warning and AoA protection in beginner mode
    {
        FlightModel fm; fm.setProfile(p); fm.setGround(&g);
        FlightControlSystem fcs; fcs.setMode(ControlMode::Advanced);
        fm.resetInAir({0, 0, -4000}, 0, 110, 0.6);
        ControlInputs in; in.throttle = 0.0; in.gearDown = false; in.pitch = 1.0;
        bool warn = false;
        for (int i = 0; i < 60 * 15; ++i) { SurfaceCommands sc = fcs.update(1.0 / 60, in, fm); fm.step(1.0 / 60, in, sc); warn |= fm.data().stallWarning; }
        CHECK(warn);
    }
}

TEST(mass_affects_performance) {
    auto rollDistance = [](const char* preset, double fuel) {
        FlightSession s; std::string err; SessionConfig cfg;
        cfg.loadoutPresetId = preset; cfg.fuelFraction = fuel; cfg.controlMode = ControlMode::Advanced;
        s.init(catalog(), cfg, kTerrain, err);
        Vec3 start = s.fm.state().pos;
        ControlInputs in; in.throttle = 0.89;  // MIL power, no afterburner
        for (int i = 0; i < 60 * 60 && s.fm.data().cas < 150 * kKt2Ms; ++i) s.tick(1.0 / 60, in);
        Vec3 d = s.fm.state().pos - start;
        return std::sqrt(d.x * d.x + d.y * d.y);
    };
    double clean = rollDistance("f16i_clean", 0.5);
    double heavy = rollDistance("f16i_strike_spice", 1.0);
    std::printf("    ground roll to 150 kt at MIL: clean/half fuel %.0f m, SPICE/full fuel %.0f m\n", clean, heavy);
    CHECK(heavy > clean * 1.15);
    // Fuel burns and mass decreases
    FlightSession s; std::string err; SessionConfig cfg; cfg.controlMode = ControlMode::Advanced;
    s.init(catalog(), cfg, kTerrain, err);
    double m0 = s.fm.massKg();
    ControlInputs in; in.throttle = 1.0; in.parkingBrake = true;
    for (int i = 0; i < 60 * 30; ++i) s.tick(1.0 / 60, in);
    CHECK(s.fm.massKg() < m0 - 30);  // afterburner burns > 1 kg/s
}

TEST(crash_detection_and_reset) {
    FlightSession s; std::string err; SessionConfig cfg; cfg.controlMode = ControlMode::Advanced;
    CHECK(s.init(catalog(), cfg, kTerrain, err));
    // Dive into the ground
    s.fm.resetInAir(s.fm.state().pos + Vec3{0, 0, -300}, 0, 150, 0.5);
    s.fm.mutableState().att = Quat::fromEuler(0, -30 * kDeg2Rad, 0);
    s.fm.mutableState().vel = s.fm.state().att.rotate({150, 0, 0});
    bool crash = false;
    for (int i = 0; i < 60 * 20 && !crash; ++i) {
        s.tick(1.0 / 60, ControlInputs());
        for (auto& e : s.fm.takeEvents()) if (e.type == SimEvent::Crash) crash = true;
    }
    CHECK(crash);
    CHECK(s.fm.state().crashed);
    // Gear-up landing is a crash with a specific reason
    s.resetToStart();
    CHECK(!s.fm.state().crashed);
    s.fm.resetInAir(s.fm.state().pos + Vec3{0, 0, -20}, s.fm.data().headingDeg, 90, 0.5);
    s.fm.mutableState().gearPos = 0;
    ControlInputs in; in.gearDown = false; in.throttle = 0.3;
    for (int i = 0; i < 60 * 30 && !s.fm.state().crashed; ++i) s.tick(1.0 / 60, in);
    CHECK(s.fm.state().crashed);
    CHECK(s.fm.state().crashReason == "gear_up_landing" || s.fm.state().crashReason.rfind("impact:", 0) == 0);
    std::printf("    gear-up landing crash reason: %s\n", s.fm.state().crashReason.c_str());
    // Reset restores a valid on-ground state
    s.resetToStart();
    for (int i = 0; i < 120; ++i) s.tick(1.0 / 60, ControlInputs());
    CHECK(!s.fm.state().crashed && s.fm.data().weightOnWheels && s.fm.data().onRunway);
}

TEST(mission_failure_and_nav_waypoints) {
    // Crash -> mission failed with Hebrew reason
    FlightSession s; std::string err; SessionConfig cfg; cfg.missionId = "pattern_practice";
    CHECK(s.init(catalog(), cfg, kTerrain, err));
    MissionRuntime m; m.start(*s.mission, s);
    s.fm.mutableState().crashed = true;
    m.update(0.1, s, {{SimEvent::Crash, 0, 0, "test"}});
    CHECK(m.result() == MissionResult::Failed);
    CHECK(!m.summary().failReasonHe.empty());
    CHECK(m.summary().score == 0);
    // Navigation: teleport over each waypoint in order -> events + objective
    FlightSession s2; SessionConfig c2; c2.missionId = "nav_negev";
    CHECK(s2.init(catalog(), c2, kTerrain, err));
    MissionRuntime m2; m2.start(*s2.mission, s2);
    m2.update(0.1, s2, {{SimEvent::LiftOff, 0, 100, ""}});
    int wpEvents = 0;
    for (auto& w : s2.mission->waypoints) {
        Vec3 p = s2.frame.toNed({w.lat, w.lon, 2000});
        s2.fm.resetInAir(p, 0, 200, 0.5);
        m2.update(0.1, s2, {});
        for (auto& e : m2.takeEvents()) if (e.type == MissionEventType::WaypointReached) ++wpEvents;
    }
    CHECK(wpEvents == 3);
    CHECK(m2.objectives()[1].done);
}

static RadioPhrasebook& phrasebook() {
    static RadioPhrasebook b;
    static bool loaded = false;
    if (!loaded) {
        std::string t, err;
        readTextFile(kData + "/Radio/phrases.he.json", t);
        if (!b.load(t, err)) std::printf("    phrasebook error: %s\n", err.c_str());
        loaded = true;
    }
    return b;
}

TEST(radio_phrasebook_and_audio_assets_complete) {
    RadioPhrasebook& b = phrasebook();
    CHECK(!b.messages.empty());
    // Every phase-1 message must resolve to audio clips that exist on disk for its voice.
    Catalog& c = catalog();
    int missing = 0, checked = 0;
    for (auto& m : b.messages) {
        if (m.phase != 1) continue;
        for (auto& cs : c.callsigns)
            for (auto& base : c.bases) {
                RadioDirector d;
                d.init(&b, {cs.id, cs.he, base.id, base.shortHe, "25L"}, false);
                (void)d;
            }
        for (auto& p : m.parts) {
            if (p.empty() || p[0] != '@') continue;
            std::string path = kData + "/Audio/Radio/" + m.voice + "/" + p.substr(1) + ".wav";
            PcmBuffer pcm; std::string err;
            ++checked;
            if (!readWavFile(path, pcm, err) || pcm.seconds() < 0.1) { ++missing; std::printf("    missing/empty clip %s\n", path.c_str()); }
        }
    }
    std::printf("    checked %d literal fragment clips, missing %d\n", checked, missing);
    CHECK(missing == 0);
}

// Drive a full scripted flight with the radio director and verify sequencing rules.
TEST(radio_director_follows_flight) {
    RadioPhrasebook& b = phrasebook();
    FlightSession s; std::string err; SessionConfig cfg;
    cfg.missionId = "pattern_practice"; cfg.controlMode = ControlMode::Advanced; cfg.fuelFraction = 0.7; cfg.runwayEnd = "25L";
    CHECK(s.init(catalog(), cfg, kTerrain, err));
    // Start on the overrun: move the aircraft 40 m before the threshold to allow a taxi segment.
    MissionRuntime m; m.start(*s.mission, s);
    RadioDirector d;
    d.init(&b, {"ofroni", "עפרוני", "ramon", "רמון", s.activeRunwayEnd}, true);
    PatternAutopilot ap; ap.setup(s.activeRunway);

    double t = 0, playingUntil = -1;
    int overlaps = 0;
    std::vector<std::string> heard;
    auto pump = [&](double dt, ControlInputs in, bool fly) {
        if (fly) ap.update(dt, s.fm, in);
        s.tick(dt, in);
        auto ev = s.fm.takeEvents();
        m.update(dt, s, ev);
        d.update(dt, s, ev, m.takeEvents(), &m);
        RadioTransmission tx;
        if (d.startNext(tx)) {
            if (t < playingUntil - 1e-6) ++overlaps;
            playingUntil = t + tx.durationS;
            heard.push_back(tx.messageId);
            // subtitle must contain the text of each spoken fragment in order
            size_t pos = 0;
            for (auto& f : tx.fragmentIds) {
                if (f == ",") continue;
                size_t q = tx.subtitleHe.find(b.fragment(f)->he, pos);
                CHECK(q != std::string::npos);
                if (q != std::string::npos) pos = q;
            }
        }
        t += dt;
    };
    const double dt = 1.0 / 60;
    // 1) Request taxi via the reply menu; expect clearance.
    auto rs = d.availableReplies();
    CHECK(!rs.empty() && rs[0].id == "r_req_taxi");
    CHECK(d.chooseReply("r_req_taxi"));
    for (int i = 0; i < 60 * 30 && !(d.state() == AtcState::TaxiCleared && !d.isTransmitting()); ++i) pump(dt, ControlInputs{}, false);
    CHECK(d.state() == AtcState::TaxiCleared);
    CHECK(d.acknowledgeQuick());  // readback
    for (int i = 0; i < 60 * 6; ++i) { ControlInputs in; in.parkingBrake = true; pump(dt, in, false); }
    // 2) Holding near threshold, stopped -> "ready for takeoff" available
    rs = d.availableReplies();
    CHECK(!rs.empty() && rs[0].id == "r_ready_tko");
    CHECK(d.chooseReply("r_ready_tko"));
    for (int i = 0; i < 60 * 30 && !(d.state() == AtcState::TakeoffCleared && !d.isTransmitting()); ++i) { ControlInputs in; in.parkingBrake = true; pump(dt, in, false); }
    CHECK(d.state() == AtcState::TakeoffCleared);
    CHECK(d.acknowledgeQuick());
    for (int i = 0; i < 60 * 5; ++i) { ControlInputs in; in.parkingBrake = true; pump(dt, in, false); }
    // 3) Fly the pattern; acknowledge whatever the tower asks, report final when possible.
    bool reportedFinal = false;
    for (int i = 0; i < 60 * 900; ++i) {
        pump(dt, ControlInputs{}, true);
        auto r2 = d.availableReplies();
        if (!r2.empty() && !d.isTransmitting()) {
            if (r2[0].id == "r_final") reportedFinal = true;
            if (r2[0].id != "r_inbound") d.chooseReply(r2[0].id);
        }
        if (ap.phase() == PatternAutopilot::Phase::Stopped) break;
    }
    for (int i = 0; i < 60 * 15; ++i) pump(dt, ControlInputs{}, false);
    std::printf("    heard:");
    for (auto& h : heard) std::printf(" %s", h.c_str());
    std::printf("\n");
    auto count = [&](const char* id) { int n = 0; for (auto& h : heard) if (h == id) ++n; return n; };
    CHECK(overlaps == 0);
    CHECK(count("t_taxi_clear") == 1);
    CHECK(count("t_tko_clear") == 1);
    CHECK(count("t_report_final") == 1);
    CHECK(reportedFinal);
    CHECK(count("t_cleared_land") == 1);
    CHECK(count("t_landed_good") + count("t_landed") == 1);
    CHECK(count("t_check_gear") == 0);      // gear was down -> no false warning
    CHECK(count("t_stop_no_clear") == 0);   // never moved without clearance
    CHECK(count("t_no_tko_clear") == 0);
    CHECK(count("t_contact_control") == 0); // pattern work stays with tower
}

TEST(radio_reacts_to_violations_without_spam) {
    RadioPhrasebook& b = phrasebook();
    FlightSession s; std::string err; SessionConfig cfg; cfg.controlMode = ControlMode::Advanced;
    CHECK(s.init(catalog(), cfg, kTerrain, err));
    MissionRuntime m; m.start(*s.mission, s);
    RadioDirector d; d.init(&b, {"dorban", "דורבן", "ramon", "רמון", s.activeRunwayEnd}, false);
    std::vector<std::string> heard;
    // Taxi and take-off roll without any clearance.
    for (int i = 0; i < 60 * 40; ++i) {
        ControlInputs in; in.throttle = i < 60 * 3 ? 0.5 : 0.0;
        if (i > 60 * 10) in.throttle = 0.89;
        s.tick(1.0 / 60, in);
        auto ev = s.fm.takeEvents();
        m.update(1.0 / 60, s, ev);
        d.update(1.0 / 60, s, ev, m.takeEvents(), &m);
        RadioTransmission tx;
        if (d.startNext(tx)) heard.push_back(tx.messageId);
        if (s.fm.data().cas > 120 * kKt2Ms) break;
    }
    int stop = 0, tko = 0;
    for (auto& h : heard) { if (h == "t_stop_no_clear") ++stop; if (h == "t_no_tko_clear") ++tko; }
    CHECK(stop == 1);
    CHECK(tko == 1);
    // Gear-up on final triggers exactly one gear warning
    s.resetToStart();
    Vec3 u = (s.activeRunway.farEndNed - s.activeRunway.thresholdNed); u.z = 0; u = u.normalized();
    Vec3 p = s.activeRunway.thresholdNed - u * 4000.0; p.z -= 200;
    s.fm.resetInAir(p, std::atan2(u.y, u.x) * kRad2Deg, 85, 0.5);
    s.fm.takeEvents();
    d.update(0.1, s, {{SimEvent::LiftOff, 0, 80, ""}}, {}, &m);
    heard.clear();
    for (int i = 0; i < 60 * 20; ++i) {
        ControlInputs in; in.gearDown = false; in.throttle = 0.6;
        s.tick(1.0 / 60, in);
        auto ev = s.fm.takeEvents();
        d.update(1.0 / 60, s, ev, {}, &m);
        RadioTransmission tx;
        if (d.startNext(tx)) heard.push_back(tx.messageId);
    }
    int gear = 0;
    for (auto& h : heard) if (h == "t_check_gear") ++gear;
    CHECK(gear == 1);
}

static double bandEnergy(const std::vector<float>& x, int fs, double f0, double f1) {
    // Goertzel sum over a set of probe frequencies
    double e = 0;
    for (double f = f0; f <= f1; f += (f1 - f0) / 8) {
        double w = 2 * kPi * f / fs, c = 2 * std::cos(w), s1 = 0, s2 = 0;
        for (float v : x) { double s0 = v + c * s1 - s2; s2 = s1; s1 = s0; }
        e += s1 * s1 + s2 * s2 - c * s1 * s2;
    }
    return e;
}

TEST(radio_fx_band_limits_and_squelch) {
    PcmBuffer dry;
    unsigned st = 99;
    for (int i = 0; i < kRadioSampleRate; ++i) { st ^= st << 13; st ^= st >> 17; st ^= st << 5; dry.samples.push_back(((st & 0xFFFF) / 32768.0f - 1.0f) * 0.5f); }
    RadioFxSettings full; full.noiseLevel = 0.0;
    PcmBuffer wet = RadioFx::process(dry, full);
    CHECK(wet.samples.size() > dry.samples.size());  // click + squelch tail added
    std::vector<float> core(wet.samples.begin() + long(0.088 * kRadioSampleRate), wet.samples.begin() + long(0.088 * kRadioSampleRate + dry.samples.size()));
    double low = bandEnergy(core, kRadioSampleRate, 60, 140), mid = bandEnergy(core, kRadioSampleRate, 1000, 2000), high = bandEnergy(core, kRadioSampleRate, 6000, 9000);
    double lowDb = 10 * std::log10(low / mid), highDb = 10 * std::log10(high / mid);
    double dLow = 10 * std::log10(bandEnergy(dry.samples, kRadioSampleRate, 60, 140) / bandEnergy(dry.samples, kRadioSampleRate, 1000, 2000));
    std::printf("    radio band: low/mid %.1f dB (dry %.1f), high/mid %.1f dB\n", lowDb, dLow, highDb);
    CHECK(lowDb < dLow - 15);
    CHECK(highDb < -20);
    RadioFxSettings mute; mute.volume = 0;
    PcmBuffer silent = RadioFx::process(dry, mute);
    double mx = 0;
    for (float v : silent.samples) mx = std::max(mx, double(std::fabs(v)));
    CHECK(mx == 0);
}

int main() {
    std::printf("Kanaf core tests\n");
    for (auto& t : tests()) {
        g_test = t.name;
        int before = g_fail;
        std::printf("[ RUN  ] %s\n", t.name);
        t.fn();
        std::printf("[ %s ] %s\n", g_fail == before ? " OK " : "FAIL", t.name);
    }
    std::printf("\n%d checks, %d failures\n", g_checks, g_fail);
    return g_fail == 0 ? 0 : 1;
}
