#include "Kanaf/Mission.h"

#include <algorithm>

#include "Kanaf/Geo.h"

namespace kanaf {

void MissionRuntime::start(const MissionDef& m, const FlightSession& s) {
    def_ = m;
    obj_.clear();
    for (auto& o : m.objectives) obj_.push_back({o});
    events_.clear();
    result_ = MissionResult::Running;
    failReasonHe_.clear();
    t_ = 0; maxAlt_ = 0; maxG_ = minG_ = 1; maxKt_ = 0; distM_ = 0;
    fuel0_ = fuelNow_ = s.fm.state().fuelKg;
    tdSink_ = -1; tdCross_ = 0; airborneSeen_ = false; landed_ = false; wpIndex_ = 0;
    lastPos_ = s.fm.state().pos;
    baseLat_ = s.base ? s.base->lat : 0;
    baseLon_ = s.base ? s.base->lon : 0;
}

std::vector<MissionEvent> MissionRuntime::takeEvents() { std::vector<MissionEvent> o; o.swap(events_); return o; }

void MissionRuntime::complete(ObjectiveState& o) {
    if (o.done || o.failed) return;
    o.done = true;
    o.doneTime = t_;
    events_.push_back({MissionEventType::ObjectiveDone, o.def.id, o.def.textHe});
}

void MissionRuntime::fail(const std::string& reasonHe) {
    if (result_ != MissionResult::Running) return;
    result_ = MissionResult::Failed;
    failReasonHe_ = reasonHe;
    events_.push_back({MissionEventType::MissionFailed, def_.id, reasonHe});
}

void MissionRuntime::endByPlayer() {
    if (result_ == MissionResult::Running) result_ = MissionResult::Ended;
}

void MissionRuntime::update(double dt, const FlightSession& s, const std::vector<SimEventRecord>& events) {
    if (result_ != MissionResult::Running) return;
    t_ += dt;
    const FlightData& fd = s.fm.data();
    const AircraftState& st = s.fm.state();
    maxAlt_ = std::max(maxAlt_, fd.altMsl);
    if (!fd.weightOnWheels) { maxG_ = std::max(maxG_, fd.nz); minG_ = std::min(minG_, fd.nz); }
    maxKt_ = std::max(maxKt_, fd.cas / kKt2Ms);
    Vec3 d = st.pos - lastPos_;
    distM_ += std::sqrt(d.x * d.x + d.y * d.y);
    lastPos_ = st.pos;
    fuelNow_ = st.fuelKg;
    // runway-relative coordinates
    Vec3 u = s.activeRunway.farEndNed - s.activeRunway.thresholdNed;
    u.z = 0;
    u = u.normalized();
    Vec3 rel = st.pos - s.activeRunway.thresholdNed;
    rel.z = 0;
    along_ = rel.dot(u);
    cross_ = rel.dot(Vec3{-u.y, u.x, 0});

    bool liftOff = false, touchdown = false, stopped = false;
    double sink = 0;
    std::string surf;
    for (auto& e : events) {
        if (e.type == SimEvent::LiftOff) liftOff = true;
        if (e.type == SimEvent::Touchdown) { touchdown = true; sink = e.value; surf = e.detail; }
        if (e.type == SimEvent::StoppedOnGround) stopped = true;
        if (e.type == SimEvent::Crash) { fail("המטוס התרסק"); return; }
    }
    if (liftOff) airborneSeen_ = true;
    if (touchdown && airborneSeen_ && !landed_) {
        landed_ = true;
        tdSink_ = sink;
        tdCross_ = cross_;
    }
    if (st.crashed) { fail("המטוס התרסק"); return; }
    if (def_.timeLimitS > 0 && t_ > def_.timeLimitS) { fail("חריגה ממגבלת הזמן"); return; }

    // Sequential evaluation of required objectives; optional ones are evaluated independently.
    bool blocked = false;
    for (auto& o : obj_) {
        if (o.done) continue;
        if (blocked && !o.def.optional) continue;
        const std::string& ty = o.def.type;
        if (ty == "airborne") {
            if (airborneSeen_) complete(o);
        } else if (ty == "reach_agl") {
            if (airborneSeen_ && fd.agl >= o.def.valueFt * kFt2M) complete(o);
        } else if (ty == "distance_from_base") {
            if (airborneSeen_ && greatCircleDistanceM(baseLat_, baseLon_, fd.latDeg, fd.lonDeg) >= o.def.valueNm * kNm2M) complete(o);
        } else if (ty == "waypoints_in_order") {
            if (wpIndex_ < int(def_.waypoints.size())) {
                const auto& w = def_.waypoints[size_t(wpIndex_)];
                if (airborneSeen_ && greatCircleDistanceM(w.lat, w.lon, fd.latDeg, fd.lonDeg) <= w.radiusNm * kNm2M) {
                    events_.push_back({MissionEventType::WaypointReached, w.id, w.nameHe, wpIndex_});
                    ++wpIndex_;
                }
            }
            if (wpIndex_ >= int(def_.waypoints.size())) complete(o);
        } else if (ty == "landed_on_runway") {
            if (landed_) {
                if (surf != "runway" && touchdown) {
                    o.failed = true;
                    events_.push_back({MissionEventType::ObjectiveFailed, o.def.id, o.def.textHe});
                    fail("הנחיתה בוצעה מחוץ למסלול");
                    return;
                }
                if (tdSink_ > o.def.maxSinkMs) {
                    o.failed = true;
                    events_.push_back({MissionEventType::ObjectiveFailed, o.def.id, o.def.textHe});
                    fail("נחיתה קשה מדי");
                    return;
                }
                complete(o);
            }
        } else if (ty == "stopped_on_runway") {
            if (landed_ && (stopped || fd.groundSpeed < 0.5) && fd.weightOnWheels) {
                if (fd.onRunway) complete(o);
                else { fail("המטוס נעצר מחוץ למסלול"); return; }
            }
        } else if (ty == "landed_stopped") {
            if (landed_ && fd.weightOnWheels && fd.groundSpeed < 0.5) complete(o);
        }
        if (!o.done && !o.def.optional) blocked = true;
    }
    if (def_.success == "all_required") {
        bool all = true;
        for (auto& o : obj_) if (!o.def.optional && !o.done) all = false;
        if (all) {
            result_ = MissionResult::Success;
            events_.push_back({MissionEventType::MissionSuccess, def_.id, def_.nameHe});
        }
    }
}

MissionSummary MissionRuntime::summary() const {
    MissionSummary s;
    s.missionId = def_.id;
    s.missionNameHe = def_.nameHe;
    s.result = result_;
    switch (result_) {
        case MissionResult::Success: s.resultHe = "המשימה הושלמה בהצלחה"; break;
        case MissionResult::Failed: s.resultHe = "המשימה נכשלה"; break;
        case MissionResult::Ended: s.resultHe = "המשימה הסתיימה"; break;
        default: s.resultHe = "בביצוע"; break;
    }
    s.flightTimeS = t_; s.maxAltMslM = maxAlt_; s.maxG = maxG_; s.minG = minG_; s.maxSpeedKt = maxKt_;
    s.distanceKm = distM_ / 1000.0; s.fuelUsedKg = fuel0_ - fuelNow_;
    s.touchdownSinkMs = tdSink_; s.touchdownCrossM = tdCross_;
    s.failReasonHe = failReasonHe_;
    for (auto& o : obj_) s.objectives.push_back({o.def.textHe, o.done});
    if (result_ == MissionResult::Success) {
        double sc = 0;
        if (tdSink_ >= 0) {
            sc += 40 * clampd((3.0 - tdSink_) / 2.4, 0, 1);
            sc += 30 * clampd(1 - std::fabs(tdCross_) / 20.0, 0, 1);
        } else {
            sc += 70;
        }
        sc += 10 * (def_.timeLimitS > 0 ? clampd((1 - t_ / def_.timeLimitS) * 2, 0, 1) : 1);
        sc += 20 * clampd((5.0 - maxG_) / 3.0, 0, 1);
        s.score = int(clampd(sc, 0, 100) + 0.5);
    } else if (result_ == MissionResult::Ended) {
        int done = 0;
        for (auto& o : obj_) if (o.done) ++done;
        s.score = obj_.empty() ? 0 : int(100.0 * done / obj_.size() * 0.5);
    }
    return s;
}

}  // namespace kanaf
