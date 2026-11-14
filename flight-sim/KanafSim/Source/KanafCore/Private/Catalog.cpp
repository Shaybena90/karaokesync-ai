#include "Kanaf/Catalog.h"

#include <algorithm>
#include <set>

namespace kanaf {

static Vec3 vec3Of(const JsonValue& a) { return {a[0].num(), a[1].num(), a[2].num()}; }

bool MissionDef::allowsAircraft(const std::string& aircraftId) const {
    for (auto& a : aircraft) if (a == "*" || a == aircraftId) return true;
    return false;
}

std::vector<std::string> Catalog::requiredFiles() {
    return {"sources.json", "aircraft.json", "weapons.json", "compatibility.json", "bases.json", "missions.json"};
}

bool Catalog::loadFromDirectory(const std::string& dir) {
    std::map<std::string, std::string> files;
    for (auto& f : requiredFiles()) {
        std::string s;
        if (!readTextFile(dir + "/" + f, s)) { errors_.push_back("missing file: " + f); continue; }
        files[f] = s;
    }
    // Flight profiles referenced by aircraft.json are loaded lazily below.
    if (!errors_.empty()) return false;
    auto air = parseJson(files["aircraft.json"]);
    if (air.ok) {
        for (auto& m : air.value["models"].items())
            for (auto& v : m["variants"].items()) {
                std::string fp = v["flightProfileId"].str();
                if (fp.empty()) continue;
                std::string s;
                std::string rel = "flight_profiles/" + fp + ".json";
                if (readTextFile(dir + "/" + rel, s)) files[rel] = s;
            }
    }
    return loadFromStrings(files);
}

bool Catalog::loadFromStrings(const std::map<std::string, std::string>& files) {
    auto get = [&](const std::string& name, JsonValue& out) {
        auto it = files.find(name);
        if (it == files.end()) { errors_.push_back("missing file: " + name); return false; }
        auto r = parseJson(it->second);
        if (!r.ok) { errors_.push_back(name + ": " + r.error); return false; }
        out = r.value;
        return true;
    };
    JsonValue j;
    if (get("sources.json", j)) parseSources(j);
    if (get("aircraft.json", j)) parseAircraft(j);
    if (get("weapons.json", j)) parseWeapons(j);
    if (get("compatibility.json", j)) parseCompat(j);
    if (get("bases.json", j)) parseBases(j);
    if (get("missions.json", j)) parseMissions(j);
    for (auto& kv : files) {
        const std::string pre = "flight_profiles/";
        if (kv.first.compare(0, pre.size(), pre) == 0) {
            auto r = parseJson(kv.second);
            if (!r.ok) { errors_.push_back(kv.first + ": " + r.error); continue; }
            flightProfiles[r.value["id"].str()] = r.value;
        }
    }
    crossValidate();
    return errors_.empty();
}

void Catalog::parseSources(const JsonValue& j) {
    for (auto& s : j["sources"].items()) {
        SourceDef d;
        d.id = s["id"].str(); d.title = s["title"].str(); d.publisher = s["publisher"].str();
        d.url = s["url"].str(); d.accessed = s["accessed"].str(); d.accessMethod = s["accessMethod"].str();
        d.reliability = s["reliability"].str();
        sources.push_back(d);
    }
}

void Catalog::parseAircraft(const JsonValue& j) {
    for (auto& m : j["models"].items()) {
        for (auto& v : m["variants"].items()) {
            AircraftVariant a;
            a.id = v["id"].str(); a.modelId = m["id"].str();
            a.nameHe = v["nameHe"].str(); a.nameEn = v["nameEn"].str(); a.designation = v["designation"].str();
            a.type = v["type"].str(); a.serviceStatus = v["serviceStatus"].str(); a.statusNote = v["statusNote"].str();
            a.implementationStatus = v["implementationStatus"].str(); a.flightProfileId = v["flightProfileId"].str();
            a.statusSources = v["statusSources"].strings();
            for (auto& hb : v["homeBases"].items()) a.homeBaseIds.push_back(hb["baseId"].str());
            a.missionEquipment = v["missionEquipment"].strings();
            a.crew = int(v["crew"].num(1));
            a.hasHud = v["hasHud"].boolean(true);
            a.weaponsMenu = v["weaponsMenu"].boolean(true);
            for (auto& as : v["assets"].members())
                a.assets[as.first] = {as.second["status"].str(), as.second["path"].str(), as.second["note"].str()};
            variants.push_back(a);
        }
    }
}

void Catalog::parseWeapons(const JsonValue& j) {
    for (auto& w : j["weapons"].items()) {
        WeaponDef d;
        d.id = w["id"].str(); d.nameEn = w["nameEn"].str(); d.nameHe = w["nameHe"].str();
        d.category = w["category"].str(); d.categoryHe = w["categoryHe"].str();
        d.descriptionHe = w["descriptionHe"].str(); d.dataStatus = w["dataStatus"].str();
        d.massKg = w["massKg"].num(); d.lengthM = w["lengthM"].num(); d.diameterM = w["diameterM"].num();
        d.game = w["game"];
        d.behaviour = d.game["behaviour"].str();
        d.perRack = int(d.game["perRack"].num(1));
        d.rackMassKg = d.game["rackMassKg"].num(0);
        weapons.push_back(d);
    }
}

void Catalog::parseCompat(const JsonValue& j) {
    selectableEvidence = j["selectableEvidence"].strings();
    for (auto& ac : j["stations"].members()) {
        for (auto& s : ac.second.items()) {
            StationDef d;
            d.id = s["id"].str(); d.side = s["side"].str(); d.kind = s["kind"].str();
            d.posM = vec3Of(s["posM"]); d.maxKg = s["maxKg"].num();
            stations[ac.first].push_back(d);
        }
    }
    for (auto& e : j["entries"].items()) {
        CompatEntry c;
        c.aircraftId = e["aircraft"].str(); c.weaponId = e["weapon"].str(); c.evidence = e["evidence"].str();
        c.note = e["note"].str(); c.sources = e["sources"].strings(); c.gameStations = e["gameStations"].strings();
        compat.push_back(c);
    }
    for (auto& p : j["presets"].items()) {
        LoadoutPreset lp;
        lp.id = p["id"].str(); lp.aircraftId = p["aircraft"].str(); lp.nameHe = p["nameHe"].str();
        lp.testOnly = p["testOnly"].boolean(false);
        for (auto& s : p["stations"].members()) lp.stations[s.first] = s.second.str();
        presets.push_back(lp);
    }
}

void Catalog::parseBases(const JsonValue& j) {
    for (auto& b : j["bases"].items()) {
        BaseDef d;
        d.id = b["id"].str(); d.icao = b["icao"].str(); d.nameHe = b["nameHe"].str(); d.shortHe = b["shortHe"].str();
        d.nameEn = b["nameEn"].str(); d.layoutFidelity = b["layoutFidelity"].str();
        d.lat = b["lat"].num(); d.lon = b["lon"].num(); d.elevationM = b["elevationM"].num();
        d.inPhase1Region = b["inPhase1Region"].boolean(false);
        d.phase1Default = b["phase1Default"].boolean(false);
        for (auto& r : b["runways"].items()) {
            RunwayDef rd;
            rd.id = r["id"].str(); rd.surface = r["surface"].str();
            rd.lengthM = r["lengthM"].num(); rd.widthM = r["widthM"].num();
            for (int i = 0; i < 2; ++i) {
                const auto& e = r["ends"][size_t(i)];
                rd.ends[i].ident = e["ident"].str(); rd.ends[i].lat = e["lat"].num(); rd.ends[i].lon = e["lon"].num();
                rd.ends[i].hasElevation = e["elevationM"].isNumber();
                rd.ends[i].elevationM = e["elevationM"].num(d.elevationM);
                rd.ends[i].headingTrueDeg = e["headingTrueDeg"].num();
            }
            d.runways.push_back(rd);
        }
        bases.push_back(d);
    }
}

void Catalog::parseMissions(const JsonValue& j) {
    for (auto& c : j["callsignPool"].items()) callsigns.push_back({c["id"].str(), c["he"].str(), c["pron"].str()});
    for (auto& m : j["missions"].items()) {
        MissionDef d;
        d.id = m["id"].str(); d.type = m["type"].str(); d.nameHe = m["nameHe"].str(); d.briefingHe = m["briefingHe"].str();
        d.callsignId = m["callsign"].str(); d.success = m["success"].str("none");
        d.aircraft = m["aircraft"].strings();
        d.timeLimitS = m["timeLimitS"].num(0);
        d.phase = int(m["phase"].num(1));
        d.allowAnyBase = m["allowAnyBase"].boolean(true);
        for (auto& w : m["waypoints"].items())
            d.waypoints.push_back({w["id"].str(), w["nameHe"].str(), w["lat"].num(), w["lon"].num(), w["radiusNm"].num(1.5), w["altFt"].num()});
        for (auto& o : m["objectives"].items()) {
            ObjectiveDef od;
            od.id = o["id"].str(); od.type = o["type"].str(); od.textHe = o["textHe"].str();
            od.optional = o["optional"].boolean(false); od.valueFt = o["valueFt"].num(); od.valueNm = o["valueNm"].num();
            od.maxSinkMs = o["maxSinkMs"].num(3.0);
            d.objectives.push_back(od);
        }
        missions.push_back(d);
    }
}

void Catalog::crossValidate() {
    std::set<std::string> srcIds, ids;
    for (auto& s : sources) srcIds.insert(s.id);
    auto checkSrc = [&](const std::vector<std::string>& v, const std::string& ctx) {
        for (auto& s : v) if (!srcIds.count(s)) errors_.push_back(ctx + ": unknown source id '" + s + "'");
    };
    for (auto& v : variants) {
        if (!ids.insert(v.id).second) errors_.push_back("duplicate variant id " + v.id);
        if (v.statusSources.empty()) warnings_.push_back("variant " + v.id + " has no status sources");
        checkSrc(v.statusSources, "variant " + v.id);
        if (v.serviceStatus == "ordered" && v.implementationStatus == "flyable")
            errors_.push_back("variant " + v.id + ": ordered (not in service) aircraft must not be flyable");
        if (v.implementationStatus == "flyable" && !flightProfiles.count(v.flightProfileId))
            errors_.push_back("variant " + v.id + " is flyable but flight profile '" + v.flightProfileId + "' is missing");
        for (auto& hb : v.homeBaseIds) if (!base(hb)) errors_.push_back("variant " + v.id + ": unknown base " + hb);
        for (const char* k : {"exteriorModel", "cockpit", "livery", "sound", "flightProfile"})
            if (!v.assets.count(k)) errors_.push_back("variant " + v.id + ": missing asset slot " + k);
    }
    for (auto& c : compat) {
        if (!variant(c.aircraftId)) errors_.push_back("compat: unknown aircraft " + c.aircraftId);
        if (!weapon(c.weaponId)) errors_.push_back("compat: unknown weapon " + c.weaponId);
        checkSrc(c.sources, "compat " + c.aircraftId + "/" + c.weaponId);
        if (isSelectableEvidence(c.evidence) && c.sources.empty())
            errors_.push_back("compat " + c.aircraftId + "/" + c.weaponId + ": selectable without sources");
        // 'documented' requires at least one non-aggregator source
        if (isSelectableEvidence(c.evidence)) {
            bool strong = false;
            for (auto& sid : c.sources)
                for (auto& s : sources)
                    if (s.id == sid && s.reliability != "aggregator" && s.reliability != "forum") strong = true;
            if (!strong) errors_.push_back("compat " + c.aircraftId + "/" + c.weaponId + ": 'documented' needs a non-aggregator source");
        }
        for (auto& st : c.gameStations)
            if (!station(c.aircraftId, st)) errors_.push_back("compat " + c.aircraftId + "/" + c.weaponId + ": unknown station " + st);
    }
    for (auto& m : missions) {
        if (!m.callsignId.empty() && !callsign(m.callsignId)) errors_.push_back("mission " + m.id + ": unknown callsign");
    }
    for (auto& b : bases) if (b.runways.empty()) warnings_.push_back("base " + b.id + " has no runways");
}

const AircraftVariant* Catalog::variant(const std::string& id) const { for (auto& v : variants) if (v.id == id) return &v; return nullptr; }
const WeaponDef* Catalog::weapon(const std::string& id) const { for (auto& v : weapons) if (v.id == id) return &v; return nullptr; }
const BaseDef* Catalog::base(const std::string& id) const { for (auto& v : bases) if (v.id == id) return &v; return nullptr; }
const MissionDef* Catalog::mission(const std::string& id) const { for (auto& v : missions) if (v.id == id) return &v; return nullptr; }
const CallsignDef* Catalog::callsign(const std::string& id) const { for (auto& v : callsigns) if (v.id == id) return &v; return nullptr; }
const CompatEntry* Catalog::compatFor(const std::string& a, const std::string& w) const {
    for (auto& c : compat) if (c.aircraftId == a && c.weaponId == w) return &c;
    return nullptr;
}
const StationDef* Catalog::station(const std::string& a, const std::string& s) const {
    auto it = stations.find(a);
    if (it == stations.end()) return nullptr;
    for (auto& st : it->second) if (st.id == s) return &st;
    return nullptr;
}
bool Catalog::isSelectableEvidence(const std::string& e) const {
    return std::find(selectableEvidence.begin(), selectableEvidence.end(), e) != selectableEvidence.end();
}

// ---- LoadoutValidator ---------------------------------------------------------------------

std::vector<StoreOption> LoadoutValidator::optionsFor(const std::string& aircraftId, const std::string& stationId) const {
    std::vector<StoreOption> out;
    for (auto& w : cat_.weapons) {
        StoreOption o;
        o.weaponId = w.id;
        const CompatEntry* c = cat_.compatFor(aircraftId, w.id);
        if (!c) {
            o.availability = StoreAvailability::Unknown;
            o.reasonHe = "לא נמצא תיעוד פומבי להתאמה למטוס זה";
        } else {
            o.evidence = c->evidence;
            bool onStation = std::find(c->gameStations.begin(), c->gameStations.end(), stationId) != c->gameStations.end();
            if (c->evidence == "in_integration") {
                o.availability = StoreAvailability::InIntegration;
                o.reasonHe = "בתהליך שילוב לפי דיווחים — לא זמין";
            } else if (!cat_.isSelectableEvidence(c->evidence)) {
                o.availability = StoreAvailability::NotDocumented;
                o.reasonHe = c->evidence == "reported" ? "דווח במקורות משניים בלבד — לא אומת" : "מועמד למחקר — לא אומת";
            } else if (!onStation) {
                o.availability = StoreAvailability::NoStation;
                o.reasonHe = "לא מוגדר לתחנה זו";
            } else {
                o.availability = StoreAvailability::Selectable;
            }
        }
        out.push_back(o);
    }
    return out;
}

LoadoutResult LoadoutValidator::validate(const std::string& aircraftId, const std::map<std::string, std::string>& st) const {
    LoadoutResult r;
    const AircraftVariant* v = cat_.variant(aircraftId);
    if (!v) { r.errorCodes.push_back("unknown_aircraft"); r.errorsHe.push_back("מטוס לא מוכר"); return r; }
    if (!v->weaponsMenu && !st.empty()) {
        r.errorCodes.push_back("no_weapons_on_type");
        r.errorsHe.push_back("למטוס זה אין תפריט חימוש — ציוד משימה בלבד");
    }
    double leftKg = 0, rightKg = 0;
    for (auto& kv : st) {
        const StationDef* s = cat_.station(aircraftId, kv.first);
        const WeaponDef* w = cat_.weapon(kv.second);
        if (!s) { r.errorCodes.push_back("unknown_station:" + kv.first); r.errorsHe.push_back("תחנה לא קיימת: " + kv.first); continue; }
        if (!w) { r.errorCodes.push_back("unknown_weapon:" + kv.second); r.errorsHe.push_back("חימוש לא מוכר: " + kv.second); continue; }
        const CompatEntry* c = cat_.compatFor(aircraftId, w->id);
        if (!c || !cat_.isSelectableEvidence(c->evidence)) {
            r.errorCodes.push_back("not_documented:" + w->id);
            r.errorsHe.push_back(w->nameEn + ": אין התאמה מתועדת לגרסה " + v->nameEn);
            continue;
        }
        if (std::find(c->gameStations.begin(), c->gameStations.end(), kv.first) == c->gameStations.end()) {
            r.errorCodes.push_back("bad_station:" + w->id + "@" + kv.first);
            r.errorsHe.push_back(w->nameEn + " אינו מוגדר לתחנה " + kv.first);
            continue;
        }
        double m = w->storeMassKg();
        if (m > s->maxKg) {
            r.errorCodes.push_back("overweight:" + kv.first);
            r.errorsHe.push_back("חריגה ממשקל מרבי בתחנה " + kv.first);
        }
        r.storesMassKg += m;
        if (s->side == "L") leftKg += m;
        if (s->side == "R") rightKg += m;
    }
    // Game rule: lateral asymmetry above 500 kg is rejected (simplification of real limits).
    if (std::fabs(leftKg - rightKg) > 500.0) {
        r.errorCodes.push_back("asymmetric");
        r.errorsHe.push_back("עומס לא סימטרי מעבר למותר (כלל משחק)");
    }
    r.valid = r.errorCodes.empty();
    return r;
}

}  // namespace kanaf
