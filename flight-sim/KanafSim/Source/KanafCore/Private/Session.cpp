#include "Kanaf/Session.h"

#include <algorithm>

namespace kanaf {

bool FlightSession::init(const Catalog& cat, const SessionConfig& cfg, const std::string& terrainBase, std::string& error) {
    std::string demErr;
    const HeightGridProvider* dem = nullptr;
    if (!terrainBase.empty()) {
        if (ownedDem_.load(terrainBase, demErr)) dem = &ownedDem_;
    } else {
        demErr = "no terrain path";
    }
    return initWithProvider(cat, cfg, dem, demErr, error);
}

bool FlightSession::initWithProvider(const Catalog& cat, const SessionConfig& cfg, const HeightGridProvider* dem,
                                     const std::string& demErr, std::string& error) {
    dem_ = dem;
    if (!dem_) {
        terrainStatus = demErr == "no terrain path" ? TerrainStatus::FallbackFlat_NoData : TerrainStatus::FallbackFlat_LoadError;
        terrainMessage = "Terrain data unavailable (" + demErr + "); using flat fallback at base elevation.";
        terrainMessageHe = "נתוני הגובה לא נטענו — מוצג שטח שטוח זמני בגובה הבסיס (לא מייצג את המציאות).";
    }
    return setup(cat, cfg, error);
}

bool FlightSession::setup(const Catalog& cat, const SessionConfig& cfg, std::string& error) {
    config = cfg;
    variant = cat.variant(cfg.aircraftId);
    if (!variant) { error = "unknown aircraft " + cfg.aircraftId; return false; }
    if (!variant->isFlyable()) { error = "aircraft " + cfg.aircraftId + " is not flyable (" + variant->implementationStatus + ")"; return false; }
    base = cat.base(cfg.baseId);
    if (!base) { error = "unknown base " + cfg.baseId; return false; }
    mission = cat.mission(cfg.missionId);
    if (!mission) { error = "unknown mission " + cfg.missionId; return false; }
    if (!mission->allowsAircraft(variant->id)) { error = "mission not available for this aircraft"; return false; }
    if (base->runways.empty()) { error = "base has no runways"; return false; }

    auto fpIt = cat.flightProfiles.find(variant->flightProfileId);
    if (fpIt == cat.flightProfiles.end()) { error = "missing flight profile"; return false; }
    FlightProfile prof;
    if (!prof.loadFromJson(fpIt->second, error)) return false;

    // Loadout
    LoadoutValidator lv(cat);
    stations.clear();
    if (!cfg.loadoutPresetId.empty()) {
        bool found = false;
        for (auto& p : cat.presets)
            if (p.id == cfg.loadoutPresetId && p.aircraftId == variant->id) { stations = p.stations; found = true; }
        if (!found) { error = "unknown loadout preset " + cfg.loadoutPresetId; return false; }
    } else {
        stations = cfg.customStations;
    }
    loadout = lv.validate(variant->id, stations);
    if (!loadout.valid) {
        error = "loadout rejected:";
        for (auto& c : loadout.errorCodes) error += " " + c;
        return false;
    }

    // Terrain / frame
    frame.reset(base->lat, base->lon, base->elevationM, cfg.geoidUndulationM);
    ground = GroundModel();
    ground.setFrame(frame);
    // Flat fallback sits at the lowest runway threshold so no runway end is ever below "terrain".
    double lowest = base->elevationM;
    for (auto& r : base->runways)
        for (int i = 0; i < 2; ++i)
            if (r.ends[i].hasElevation) lowest = std::min(lowest, r.ends[i].elevationM);
    flat_.setHeight(lowest - 0.5);
    if (dem_) {
        if (dem_->covers(base->lat, base->lon)) {
            terrainStatus = TerrainStatus::RealDem;
            terrainMessage = "Copernicus DEM GLO-30 loaded.";
            terrainMessageHe = "";
            ground.setPrimary(dem_);
        } else {
            terrainStatus = TerrainStatus::FallbackFlat_OutsideCoverage;
            terrainMessage = "Base is outside the loaded terrain region; using flat fallback.";
            terrainMessageHe = "הבסיס מחוץ לאזור נתוני הגובה שנטענו — מוצג שטח שטוח זמני.";
        }
    }
    ground.setFallback(&flat_);
    for (auto& r : base->runways) {
        RunwaySurface rs;
        rs.id = r.id;
        rs.widthM = r.widthM > 0 ? r.widthM : 45;
        for (int i = 0; i < 2; ++i) {
            // Policy: the DEM wins where available so the runway sits exactly on the rendered terrain
            // (OurAirports elevations differ by up to ~36 m at some ends); OurAirports is the fallback.
            double e = r.ends[i].elevationM;
            if (dem_ && dem_->covers(r.ends[i].lat, r.ends[i].lon)) e = dem_->heightMsl(r.ends[i].lat, r.ends[i].lon);
            GeoPoint gp{r.ends[i].lat, r.ends[i].lon, e};
            (i == 0 ? rs.endA : rs.endB) = gp;
        }
        ground.addRunway(rs);
    }

    // Choose the runway end
    const RunwayDef* best = nullptr;
    int bestEnd = 0;
    for (auto& r : base->runways) {
        for (int i = 0; i < 2; ++i) {
            if (cfg.runwayEnd != "auto" && r.ends[i].ident == cfg.runwayEnd) { best = &r; bestEnd = i; }
        }
    }
    if (!best) {
        for (auto& r : base->runways) if (!best || r.lengthM > best->lengthM) { best = &r; bestEnd = 0; }
    }
    const RunwayEnd& a = best->ends[bestEnd];
    const RunwayEnd& b = best->ends[1 - bestEnd];
    auto elev = [&](const RunwayEnd& e) {
        if (dem_ && dem_->covers(e.lat, e.lon)) return dem_->heightMsl(e.lat, e.lon);
        if (e.hasElevation) return e.elevationM;
        return base->elevationM;
    };
    activeRunway.thresholdNed = frame.toNed({a.lat, a.lon, elev(a)});
    activeRunway.farEndNed = frame.toNed({b.lat, b.lon, elev(b)});
    activeRunway.elevationM = elev(a);
    activeRunway.widthM = best->widthM;
    activeRunwayEnd = a.ident;
    activeRunwayId = best->id;

    fm.setProfile(prof);
    fm.setGround(&ground);
    fcs.setMode(cfg.controlMode);
    resetToStart();
    return true;
}

void FlightSession::resetToStart() {
    Vec3 d = activeRunway.farEndNed - activeRunway.thresholdNed;
    d.z = 0;
    Vec3 u = d.normalized();
    Vec3 start = activeRunway.thresholdNed + u * 60.0;  // 60 m past the threshold, on centreline
    double hdg = wrap360(std::atan2(u.y, u.x) * kRad2Deg);
    double storesCD = 0;
    // stores drag from profile coefficient
    storesCD = fm.profile().storeCDPerKg * loadout.storesMassKg;
    fm.resetOnGround(start.x, start.y, hdg, config.fuelFraction, loadout.storesMassKg, storesCD);
    fcs.reset();
}

void FlightSession::tick(double dt, const ControlInputs& pilot) {
    SurfaceCommands cmd = fcs.update(dt, pilot, fm);
    fm.step(dt, pilot, cmd);
}

}  // namespace kanaf
