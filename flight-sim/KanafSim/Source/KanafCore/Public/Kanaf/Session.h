// A flight session = catalog selections + terrain + runway setup + flight model + control laws.
// Shared by the Unreal game module and the headless tests so both run identical logic.
#pragma once
#include <map>
#include <memory>
#include <string>

#include "Kanaf/Autopilot.h"
#include "Kanaf/Catalog.h"
#include "Kanaf/FlightModel.h"
#include "Kanaf/Terrain.h"

namespace kanaf {

struct SessionConfig {
    std::string aircraftId = "f16i";
    std::string baseId = "ramon";
    std::string runwayEnd = "auto";       // runway end ident (e.g. "25L") or "auto"
    std::string missionId = "free_flight";
    std::string loadoutPresetId = "f16i_clean";
    std::map<std::string, std::string> customStations;  // used when loadoutPresetId is empty
    ControlMode controlMode = ControlMode::Beginner;
    double fuelFraction = 1.0;
    double geoidUndulationM = 19.0;       // EGM2008 over Israel ~ +17..+22 m (game constant)
};

enum class TerrainStatus { RealDem, FallbackFlat_NoData, FallbackFlat_LoadError, FallbackFlat_OutsideCoverage };

class FlightSession {
public:
    // terrainBasePath: path without extension to the height grid (.json/.r16). May be empty.
    bool init(const Catalog& cat, const SessionConfig& cfg, const std::string& terrainBasePath, std::string& error);
    // Variant for Unreal: caller supplies an already-loaded provider (or nullptr to force fallback).
    bool initWithProvider(const Catalog& cat, const SessionConfig& cfg, const HeightGridProvider* dem,
                          const std::string& demLoadError, std::string& error);

    void resetToStart();
    // One frame: FCS + flight model.
    void tick(double dt, const ControlInputs& pilot);

    FlightModel fm;
    FlightControlSystem fcs;
    GroundModel ground;
    GeoFrame frame;
    RunwayRef activeRunway;
    std::string activeRunwayEnd, activeRunwayId;
    const BaseDef* base = nullptr;
    const AircraftVariant* variant = nullptr;
    const MissionDef* mission = nullptr;
    LoadoutResult loadout;
    std::map<std::string, std::string> stations;
    TerrainStatus terrainStatus = TerrainStatus::FallbackFlat_NoData;
    std::string terrainMessage;            // human-readable (English, for logs)
    std::string terrainMessageHe;          // user-facing Hebrew
    SessionConfig config;

private:
    bool setup(const Catalog& cat, const SessionConfig& cfg, std::string& error);
    HeightGridProvider ownedDem_;
    const HeightGridProvider* dem_ = nullptr;
    FlatProvider flat_;
};

}  // namespace kanaf
