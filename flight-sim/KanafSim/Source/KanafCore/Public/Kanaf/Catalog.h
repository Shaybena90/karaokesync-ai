// Data catalog: aircraft models/variants, weapons, compatibility, bases, missions, flight profiles.
// All game content lives in JSON under Content/KanafData/Catalog; this module only parses and
// cross-validates it.
#pragma once
#include <map>
#include <string>
#include <vector>

#include "Kanaf/Json.h"
#include "Kanaf/MathTypes.h"

namespace kanaf {

struct AssetRef { std::string status, path, note; };

struct AircraftVariant {
    std::string id, modelId, nameHe, nameEn, designation, type;
    std::string serviceStatus, statusNote, implementationStatus, flightProfileId;
    std::vector<std::string> statusSources, homeBaseIds, missionEquipment;
    int crew = 1;
    bool hasHud = true, weaponsMenu = true;
    std::map<std::string, AssetRef> assets;  // exteriorModel, cockpit, livery, sound, flightProfile
    bool isFlyable() const { return implementationStatus == "flyable" && serviceStatus != "ordered"; }
};

struct WeaponDef {
    std::string id, nameEn, nameHe, category, categoryHe, descriptionHe, dataStatus, behaviour;
    double massKg = 0, lengthM = 0, diameterM = 0;
    int perRack = 1;
    double rackMassKg = 0;
    JsonValue game;  // behaviour parameters (game values)
    double storeMassKg() const { return massKg * perRack + rackMassKg; }
};

struct StationDef { std::string id, side, kind; Vec3 posM; double maxKg = 0; };

struct CompatEntry {
    std::string aircraftId, weaponId, evidence, note;
    std::vector<std::string> sources, gameStations;
};

struct LoadoutPreset {
    std::string id, aircraftId, nameHe;
    std::map<std::string, std::string> stations;  // station id -> weapon id
    bool testOnly = false;
};

struct RunwayEnd { std::string ident; double lat = 0, lon = 0, elevationM = 0, headingTrueDeg = 0; bool hasElevation = false; };
struct RunwayDef { std::string id, surface; double lengthM = 0, widthM = 0; RunwayEnd ends[2]; };
struct BaseDef {
    std::string id, icao, nameHe, shortHe, nameEn, layoutFidelity;
    double lat = 0, lon = 0, elevationM = 0;
    std::vector<RunwayDef> runways;
    bool inPhase1Region = false, phase1Default = false;
};

struct WaypointDef { std::string id, nameHe; double lat = 0, lon = 0, radiusNm = 1.5, altFt = 0; };
struct ObjectiveDef { std::string id, type, textHe; bool optional = false; double valueFt = 0, valueNm = 0, maxSinkMs = 3.0; };
struct MissionDef {
    std::string id, type, nameHe, briefingHe, callsignId, success;
    std::vector<std::string> aircraft;
    std::vector<WaypointDef> waypoints;
    std::vector<ObjectiveDef> objectives;
    double timeLimitS = 0;
    int phase = 1;
    bool allowAnyBase = true;
    bool allowsAircraft(const std::string& aircraftId) const;
};
struct CallsignDef { std::string id, he, pron; };

struct SourceDef { std::string id, title, publisher, url, accessed, accessMethod, reliability; };

class Catalog {
public:
    // Loads every catalog file from a directory (path ends without slash). Uses readTextFile.
    bool loadFromDirectory(const std::string& dir);
    // Loads from already-read file contents (keys: "aircraft.json", ... ,"flight_profiles/f16i.json").
    bool loadFromStrings(const std::map<std::string, std::string>& files);

    const std::vector<std::string>& errors() const { return errors_; }
    const std::vector<std::string>& warnings() const { return warnings_; }

    std::vector<AircraftVariant> variants;
    std::vector<WeaponDef> weapons;
    std::vector<CompatEntry> compat;
    std::vector<std::string> selectableEvidence;
    std::map<std::string, std::vector<StationDef>> stations;  // aircraft id -> stations
    std::vector<LoadoutPreset> presets;
    std::vector<BaseDef> bases;
    std::vector<MissionDef> missions;
    std::vector<CallsignDef> callsigns;
    std::vector<SourceDef> sources;
    std::map<std::string, JsonValue> flightProfiles;  // id -> raw JSON

    const AircraftVariant* variant(const std::string& id) const;
    const WeaponDef* weapon(const std::string& id) const;
    const BaseDef* base(const std::string& id) const;
    const MissionDef* mission(const std::string& id) const;
    const CallsignDef* callsign(const std::string& id) const;
    const CompatEntry* compatFor(const std::string& aircraftId, const std::string& weaponId) const;
    const StationDef* station(const std::string& aircraftId, const std::string& stationId) const;
    bool isSelectableEvidence(const std::string& evidence) const;

    // Files the catalog expects (relative to the catalog dir).
    static std::vector<std::string> requiredFiles();

private:
    void parseAircraft(const JsonValue& j);
    void parseWeapons(const JsonValue& j);
    void parseCompat(const JsonValue& j);
    void parseBases(const JsonValue& j);
    void parseMissions(const JsonValue& j);
    void parseSources(const JsonValue& j);
    void crossValidate();
    std::vector<std::string> errors_, warnings_;
};

// ---- Loadout validation -------------------------------------------------------------------

enum class StoreAvailability { Selectable, NotDocumented, InIntegration, NoStation, Unknown };

struct StoreOption {
    std::string weaponId;
    StoreAvailability availability = StoreAvailability::Unknown;
    std::string evidence;
    std::string reasonHe;
};

struct LoadoutResult {
    bool valid = false;
    double storesMassKg = 0;
    double dragIndexCD = 0;  // filled by caller from profile coefficient if needed
    std::vector<std::string> errorsHe;  // user-facing, Hebrew
    std::vector<std::string> errorCodes;  // machine-readable for tests
};

class LoadoutValidator {
public:
    explicit LoadoutValidator(const Catalog& c) : cat_(c) {}
    // All weapons in the catalog with availability for this aircraft and station.
    std::vector<StoreOption> optionsFor(const std::string& aircraftId, const std::string& stationId) const;
    LoadoutResult validate(const std::string& aircraftId, const std::map<std::string, std::string>& stations) const;

private:
    const Catalog& cat_;
};

}  // namespace kanaf
