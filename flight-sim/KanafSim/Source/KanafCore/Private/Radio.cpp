#include "Kanaf/Radio.h"

#include <algorithm>

#include "Kanaf/Geo.h"

namespace kanaf {

// ---- Phrasebook ---------------------------------------------------------------------------

bool RadioPhrasebook::load(const std::string& text, std::string& error) {
    auto r = parseJson(text);
    if (!r.ok) { error = "phrases: " + r.error; return false; }
    const auto& j = r.value;
    for (auto& f : j["fragments"].members()) fragments[f.first] = {f.second["he"].str(), f.second["pron"].str()};
    for (auto& v : j["voices"].items()) voices.push_back({v["id"].str(), v["nameHe"].str()});
    for (auto& c : j["channels"].items()) channels.emplace_back(c["id"].str(), c["nameHe"].str());
    for (auto& m : j["messages"].items()) {
        RadioMessageDef d;
        d.id = m["id"].str(); d.channel = m["channel"].str(); d.voice = m["voice"].str(); d.topic = m["topic"].str();
        d.parts = m["parts"].strings(); d.priority = int(m["priority"].num(2)); d.cooldownS = m["cooldownS"].num(20);
        d.needsAck = m["needsAck"].boolean(false); d.phase = int(m["phase"].num(1));
        messages.push_back(d);
    }
    for (auto& rp : j["replies"].items()) replies.push_back({rp["id"].str(), rp["labelHe"].str(), rp["pilotMessage"].str()});
    // validate references
    for (auto& m : messages) {
        for (auto& p : m.parts) {
            if (!p.empty() && p[0] == '@' && !fragments.count(p.substr(1))) { error = "message " + m.id + ": unknown fragment " + p; return false; }
        }
        if (!voice(m.voice)) { error = "message " + m.id + ": unknown voice " + m.voice; return false; }
    }
    for (auto& rp : replies) if (!message(rp.pilotMessage)) { error = "reply " + rp.id + ": unknown message"; return false; }
    return true;
}

const RadioMessageDef* RadioPhrasebook::message(const std::string& id) const { for (auto& m : messages) if (m.id == id) return &m; return nullptr; }
const RadioReplyDef* RadioPhrasebook::reply(const std::string& id) const { for (auto& m : replies) if (m.id == id) return &m; return nullptr; }
const RadioFragment* RadioPhrasebook::fragment(const std::string& id) const { auto it = fragments.find(id); return it == fragments.end() ? nullptr : &it->second; }
const RadioVoice* RadioPhrasebook::voice(const std::string& id) const { for (auto& v : voices) if (v.id == id) return &v; return nullptr; }
std::string RadioPhrasebook::channelNameHe(const std::string& id) const { for (auto& c : channels) if (c.first == id) return c.second; return id; }

// ---- Director -----------------------------------------------------------------------------

void RadioDirector::init(const RadioPhrasebook* book, const RadioContext& ctx, bool patternMission) {
    book_ = book;
    ctx_ = ctx;
    pattern_ = patternMission;
    state_ = AtcState::Startup;
    queue_.clear();
    playing_ = false; hasLast_ = false; remaining_ = 0; t_ = 0;
    lastPlayed_.clear(); history.clear();
    playerChannel_ = "tower";
    pendingAck_.clear();
    airborneSeen_ = warnedTaxi_ = warnedTko_ = gearWarnedThisApproach_ = onFinal_ = landedReported_ = fuelLow_ = false;
    liftoffTime_ = -1; nearThresholdStopped_ = inboundZone_ = readyForInbound_ = false;
}

void RadioDirector::appendNumber(std::vector<std::string>& frags, std::string& sub, const std::string& tok) const {
    auto addFrag = [&](const std::string& id) {
        if (const RadioFragment* f = book_->fragment(id)) {
            frags.push_back(id);
            if (!sub.empty() && sub.back() != ' ') sub += ' ';
            sub += f->he;
        }
    };
    if (tok == "$cs") {
        addFrag("cs_" + ctx_.callsignId);
        addFrag("d1");
    } else if (tok == "$base") {
        addFrag("base_" + ctx_.baseId);
    } else if (tok == "$rw") {
        for (char c : ctx_.runwayIdent) {
            if (c >= '0' && c <= '9') addFrag(std::string("d") + c);
            else if (c == 'L') addFrag("rw_L");
            else if (c == 'R') addFrag("rw_R");
            else if (c == 'C') addFrag("rw_C");
        }
    } else if (tok == "$altK") {
        int k = int(std::lround(altFt_ / 1000.0));
        k = std::max(1, std::min(15, k));
        addFrag("alt" + std::to_string(k));
    } else if (tok == "$wp") {
        addFrag("wp_" + wpId_);
    }
}

RadioTransmission RadioDirector::resolve(const RadioMessageDef& def) const {
    RadioTransmission t;
    t.messageId = def.id;
    t.channel = def.channel == "*" ? playerChannel_ : def.channel;
    t.voice = def.voice;
    t.priority = def.priority;
    t.topic = def.topic;
    t.needsAck = def.needsAck;
    t.fromPlayer = def.voice == "pilot";
    for (auto& p : def.parts) {
        if (p == ",") { t.fragmentIds.push_back(","); t.subtitleHe += ","; continue; }
        if (!p.empty() && p[0] == '@') {
            const RadioFragment* f = book_->fragment(p.substr(1));
            if (!f) continue;
            t.fragmentIds.push_back(p.substr(1));
            if (!t.subtitleHe.empty() && t.subtitleHe.back() != ' ') t.subtitleHe += ' ';
            t.subtitleHe += f->he;
        } else if (!p.empty() && p[0] == '$') {
            appendNumber(t.fragmentIds, t.subtitleHe, p);
        }
    }
    // speaker label
    if (def.voice == "tower") t.speakerHe = "מגדל " + ctx_.baseHe;
    else if (def.voice == "control") t.speakerHe = "בקרה";
    else if (def.voice == "pilot") t.speakerHe = ctx_.callsignHe + " אחת (אתה)";
    else if (def.voice == "wingman") t.speakerHe = ctx_.callsignHe + " שתיים";
    else if (def.voice == "range") t.speakerHe = "מנהל התרגיל";
    t.durationS = 0;
    return t;
}

double RadioDirector::estimateDuration(const RadioTransmission& t) const {
    double d = 0.35;  // key-up + squelch
    for (auto& f : t.fragmentIds) {
        if (f == ",") { d += 0.18; continue; }
        if (const RadioFragment* fr = book_->fragment(f)) d += 0.075 * double(fr->pron.size()) + 0.05;
    }
    return d;
}

bool RadioDirector::enqueue(const std::string& id, bool fromPlayer) {
    const RadioMessageDef* def = book_ ? book_->message(id) : nullptr;
    if (!def) return false;
    auto lp = lastPlayed_.find(id);
    if (!fromPlayer && lp != lastPlayed_.end() && t_ - lp->second < def->cooldownS) return false;  // anti-spam
    RadioTransmission t = resolve(*def);
    t.enqueueTime = t_;
    t.fromPlayer = fromPlayer || t.fromPlayer;
    // Replace a queued message of the same topic from the same speaker (avoids contradictions).
    for (auto it = queue_.begin(); it != queue_.end();) {
        if (it->topic == t.topic && it->voice == t.voice && !it->fromPlayer) it = queue_.erase(it);
        else ++it;
    }
    // Insert by priority (stable).
    auto pos = queue_.end();
    for (auto it = queue_.begin(); it != queue_.end(); ++it)
        if (it->priority < t.priority) { pos = it; break; }
    queue_.insert(pos, t);
    lastPlayed_[id] = t_;
    return true;
}

bool RadioDirector::validNow(const RadioTransmission& t) const {
    const std::string& id = t.messageId;
    // Drop messages whose situation has passed (prevents reports of things that are no longer true).
    if (id == "t_tko_clear" || id == "t_taxi_clear" || id == "t_stop_no_clear" || id == "t_no_tko_clear") return !airborneSeen_;
    if (id == "t_check_gear") return onFinal_ && !landedReported_;
    if (id == "t_cleared_land") return !landedReported_;
    if (id == "t_contact_control") return airborneSeen_ && !landedReported_;
    return true;
}

bool RadioDirector::startNext(RadioTransmission& out) {
    if (playing_ || queue_.empty()) return false;
    while (!queue_.empty()) {
        RadioTransmission t = queue_.front();
        if (!validNow(t)) { queue_.pop_front(); continue; }
        if (t.channel != playerChannel_ && !t.fromPlayer) {
            if (autoTune_) {
                playerChannel_ = t.channel;
            } else {
                if (t_ - t.enqueueTime > 25.0) { queue_.pop_front(); continue; }  // missed call
                return false;  // wait for player to tune in
            }
        }
        queue_.pop_front();
        if (t.durationS <= 0) t.durationS = estimateDuration(t);
        current_ = t;
        playing_ = true;
        remaining_ = t.durationS;
        out = t;
        history.push_back(t);
        return true;
    }
    return false;
}

void RadioDirector::finished() {
    if (!playing_) return;
    playing_ = false;
    if (current_.messageId.rfind("repeat:", 0) == 0) return;  // repeats never re-trigger state logic
    last_ = current_;
    hasLast_ = true;
    const std::string& id = current_.messageId;
    // State transitions happen when a transmission has been HEARD, not when queued.
    if (id == "p_req_taxi") { state_ = AtcState::TaxiRequested; enqueue("t_taxi_clear"); }
    else if (id == "t_taxi_clear") { state_ = AtcState::TaxiCleared; pendingAck_ = "r_ack_taxi"; }
    else if (id == "p_ack_taxi") { pendingAck_.clear(); }
    else if (id == "p_ready_tko") { state_ = AtcState::ReadyRequested; enqueue("t_tko_clear"); }
    else if (id == "t_tko_clear") { state_ = AtcState::TakeoffCleared; pendingAck_ = "r_ack_tko"; }
    else if (id == "p_ack_tko") { pendingAck_.clear(); }
    else if (id == "t_contact_control") { state_ = AtcState::HandedOff; pendingAck_ = "r_ack_control"; }
    else if (id == "p_ack_control") { pendingAck_.clear(); playerChannel_ = "control"; }
    else if (id == "p_checkin_control") { enqueue("c_radar_contact"); }
    else if (id == "c_radar_contact") { state_ = AtcState::WithControl; }
    else if (id == "p_wp_report" || id == "p_status") { enqueue("c_roger"); }
    else if (id == "p_rtb" || id == "p_rtb_plain") { state_ = AtcState::Returning; enqueue("c_contact_tower"); }
    else if (id == "c_contact_tower") { pendingAck_ = "r_ack_tower"; }
    else if (id == "p_ack_tower") { pendingAck_.clear(); playerChannel_ = "tower"; readyForInbound_ = true; }
    else if (id == "p_inbound") { state_ = AtcState::Inbound; enqueue("t_report_final"); }
    else if (id == "t_report_final") { pendingAck_ = "r_ack_report_final"; }
    else if (id == "p_ack_report_final") { pendingAck_.clear(); state_ = AtcState::Inbound; }
    else if (id == "p_final") { state_ = AtcState::FinalReported; enqueue("t_cleared_land"); }
    else if (id == "t_cleared_land") { state_ = AtcState::LandingCleared; pendingAck_ = "r_ack_land"; }
    else if (id == "p_ack_land" || id == "p_roger") { pendingAck_.clear(); }
}

bool RadioDirector::repeatLast() {
    if (!hasLast_ || playing_) return false;
    RadioTransmission t = last_;
    t.enqueueTime = t_;
    t.priority = 6;
    t.topic = "repeat";
    t.messageId = "repeat:" + last_.messageId;  // prefix: finishing a repeat must not re-trigger transitions
    queue_.push_front(t);
    return true;
}

std::vector<RadioReplyDef> RadioDirector::availableReplies() const {
    std::vector<RadioReplyDef> out;
    if (!book_) return out;
    auto add = [&](const char* id) { if (const RadioReplyDef* r = book_->reply(id)) out.push_back(*r); };
    if (!pendingAck_.empty()) { add(pendingAck_.c_str()); return out; }
    switch (state_) {
        case AtcState::Startup: add("r_req_taxi"); break;
        case AtcState::TaxiCleared: if (nearThresholdStopped_) add("r_ready_tko"); break;
        case AtcState::HandedOff: add("r_checkin"); break;
        case AtcState::WithControl:
            add("r_status");
            add(fuelLow_ ? "r_rtb_fuel" : "r_rtb");
            break;
        case AtcState::Airborne:
        case AtcState::Returning:
            if (readyForInbound_ || pattern_ || state_ == AtcState::Airborne) { if (inboundZone_) add("r_inbound"); }
            break;
        case AtcState::Inbound: if (onFinal_) add("r_final"); break;
        default: break;
    }
    if (state_ == AtcState::Returning && readyForInbound_ && inboundZone_ && out.empty()) add("r_inbound");
    return out;
}

bool RadioDirector::chooseReply(const std::string& replyId) {
    bool ok = false;
    for (auto& r : availableReplies()) if (r.id == replyId) ok = true;
    if (!ok) return false;
    const RadioReplyDef* r = book_->reply(replyId);
    if (r->id == pendingAck_) pendingAck_.clear();
    return enqueue(r->pilotMessage, true);
}

bool RadioDirector::acknowledgeQuick() {
    auto rs = availableReplies();
    if (rs.empty()) return false;
    return chooseReply(rs.front().id);
}

std::string RadioDirector::pendingCallChannel() const {
    for (auto& q : queue_) if (q.channel != playerChannel_ && !q.fromPlayer) return q.channel;
    return "";
}

void RadioDirector::update(double dt, const FlightSession& s, const std::vector<SimEventRecord>& simEvents,
                           const std::vector<MissionEvent>& missionEvents, const MissionRuntime* mission) {
    if (!book_) return;
    t_ += dt;
    const FlightData& fd = s.fm.data();
    altFt_ = fd.altMsl / kFt2M;
    if (playing_ && !externalTiming) {
        remaining_ -= dt;
        if (remaining_ <= 0) finished();
    }
    // runway geometry
    Vec3 u = s.activeRunway.farEndNed - s.activeRunway.thresholdNed;
    u.z = 0;
    u = u.normalized();
    Vec3 rel = s.fm.state().pos - s.activeRunway.thresholdNed;
    rel.z = 0;
    double along = rel.dot(u), cross = rel.dot(Vec3{-u.y, u.x, 0});
    double rwHdg = std::atan2(u.y, u.x) * kRad2Deg;
    double hdgErr = std::fabs(wrapPi((fd.trackDeg - rwHdg) * kDeg2Rad)) * kRad2Deg;

    for (auto& e : simEvents) {
        if (e.type == SimEvent::LiftOff) { airborneSeen_ = true; liftoffTime_ = t_; if (state_ < AtcState::Airborne) state_ = AtcState::Airborne; }
        if (e.type == SimEvent::FuelLow) { fuelLow_ = true; if (airborneSeen_) enqueue("c_check_fuel"); }
        if (e.type == SimEvent::Touchdown && airborneSeen_) lastTouchSink_ = e.value;
        if (e.type == SimEvent::StoppedOnGround && airborneSeen_ && !landedReported_ && fd.onRunway) {
            landedReported_ = true;
            state_ = AtcState::Landed;
            enqueue(lastTouchSink_ < 2.0 ? "t_landed_good" : "t_landed");
        }
        if (e.type == SimEvent::Crash) { queue_.clear(); }
    }
    for (auto& me : missionEvents) {
        if (me.type == MissionEventType::WaypointReached && airborneSeen_) { wpId_ = me.id; enqueue("p_wp_report", true); }
    }

    // Ground phase warnings driven by actual motion.
    if (!airborneSeen_) {
        bool cleared = state_ >= AtcState::TaxiCleared;
        if (!cleared && fd.groundSpeed > 2.5 && !warnedTaxi_) { warnedTaxi_ = enqueue("t_stop_no_clear"); }
        if (state_ < AtcState::TakeoffCleared && fd.onRunway && fd.cas > 40 * kKt2Ms && fd.weightOnWheels && !warnedTko_) warnedTko_ = enqueue("t_no_tko_clear");
        nearThresholdStopped_ = along > -25 && along < 400 && std::fabs(cross) < 20 && fd.groundSpeed < 3;
    }
    // After departure: hand-off to control (non-pattern missions) or report-final (pattern).
    if (airborneSeen_ && !landedReported_) {
        if (state_ == AtcState::Airborne && fd.agl > 300 && t_ - liftoffTime_ > 10) {
            if (pattern_) { state_ = AtcState::Returning; readyForInbound_ = true; enqueue("t_report_final"); }
            else enqueue("t_contact_control");
        }
        double distBase = greatCircleDistanceM(s.base->lat, s.base->lon, fd.latDeg, fd.lonDeg);
        inboundZone_ = distBase < 30000 && (pattern_ || state_ == AtcState::Returning);
        onFinal_ = along > -12000 && along < 200 && std::fabs(cross) < 800 && hdgErr < 30 && !fd.weightOnWheels;
        if (pattern_ && state_ == AtcState::Returning && onFinal_) state_ = AtcState::Inbound;
        if (onFinal_ && s.fm.state().gearPos < 0.5 && fd.wheelAgl < 350 && along > -7000 && !gearWarnedThisApproach_)
            gearWarnedThisApproach_ = enqueue("t_check_gear");
        if (!onFinal_ && fd.wheelAgl > 500) gearWarnedThisApproach_ = false;
        // Mission done except landing: controller sends player home automatically.
        if (mission && state_ == AtcState::WithControl) {
            bool onlyLandingLeft = true;
            for (auto& o : mission->objectives())
                if (!o.done && !o.def.optional && o.def.type != "landed_on_runway" && o.def.type != "stopped_on_runway") onlyLandingLeft = false;
            bool hasLanding = false;
            for (auto& o : mission->objectives()) if (o.def.type == "landed_on_runway") hasLanding = true;
            if (onlyLandingLeft && hasLanding) { state_ = AtcState::Returning; enqueue("c_contact_tower"); }
        }
    }
}

}  // namespace kanaf
