// Hebrew radio system: phrase database, ATC/controller state machine driven by REAL sim events,
// prioritised single-voice queue, reply menu, subtitles. Audio rendering is in RadioAudio.h.
#pragma once
#include <deque>
#include <map>
#include <string>
#include <vector>

#include "Kanaf/Json.h"
#include "Kanaf/Mission.h"
#include "Kanaf/Session.h"

namespace kanaf {

struct RadioFragment { std::string he, pron; };
struct RadioVoice { std::string id, nameHe; };
struct RadioMessageDef {
    std::string id, channel, voice, topic;
    std::vector<std::string> parts;
    int priority = 2;
    double cooldownS = 20;
    bool needsAck = false;
    int phase = 1;
};
struct RadioReplyDef { std::string id, labelHe, pilotMessage; };

class RadioPhrasebook {
public:
    bool load(const std::string& jsonText, std::string& error);
    const RadioMessageDef* message(const std::string& id) const;
    const RadioReplyDef* reply(const std::string& id) const;
    const RadioFragment* fragment(const std::string& id) const;
    const RadioVoice* voice(const std::string& id) const;
    std::string channelNameHe(const std::string& id) const;
    std::map<std::string, RadioFragment> fragments;
    std::vector<RadioMessageDef> messages;
    std::vector<RadioReplyDef> replies;
    std::vector<RadioVoice> voices;
    std::vector<std::pair<std::string, std::string>> channels;  // id, nameHe
};

// A resolved, ready-to-play transmission.
struct RadioTransmission {
    std::string messageId, channel, voice, speakerHe, subtitleHe;
    std::vector<std::string> fragmentIds;  // in order; "," = short pause
    int priority = 2;
    std::string topic;
    double enqueueTime = 0;
    double durationS = 0;  // set by the audio layer (or estimated)
    bool needsAck = false;
    bool fromPlayer = false;
};

struct RadioContext {
    std::string callsignId, callsignHe;
    std::string baseId, baseHe;
    std::string runwayIdent;      // e.g. "25L"
};

enum class AtcState {
    Startup, TaxiRequested, TaxiCleared, ReadyRequested, TakeoffCleared, Airborne, HandedOff,
    WithControl, Returning, Inbound, FinalReported, LandingCleared, Landed
};

class RadioDirector {
public:
    void init(const RadioPhrasebook* book, const RadioContext& ctx, bool patternMission);
    // Feed the simulation each frame.
    void update(double dt, const FlightSession& s, const std::vector<SimEventRecord>& simEvents,
                const std::vector<MissionEvent>& missionEvents, const MissionRuntime* mission);

    // Playback interface: the audio layer polls next(), plays it, and calls finished().
    bool hasPending() const { return !queue_.empty(); }
    bool isTransmitting() const { return playing_; }
    const RadioTransmission* current() const { return playing_ ? &current_ : nullptr; }
    // Pops the next transmission if the channel is free. The caller sets durationS (or keeps estimate).
    bool startNext(RadioTransmission& out);
    void setCurrentDuration(double s) { current_.durationS = s; remaining_ = s; }
    void finished();  // called by the audio layer (or automatically via update() timing)

    // Player interaction
    std::vector<RadioReplyDef> availableReplies() const;
    bool chooseReply(const std::string& replyId);
    bool acknowledgeQuick();  // "ack" key: picks the best acknowledgement reply if one is pending
    const RadioTransmission* lastTransmission() const { return hasLast_ ? &last_ : nullptr; }
    bool repeatLast();

    // Channel selection
    void setPlayerChannel(const std::string& ch) { playerChannel_ = ch; }
    const std::string& playerChannel() const { return playerChannel_; }
    void setAutoTune(bool b) { autoTune_ = b; }
    AtcState state() const { return state_; }
    std::string pendingCallChannel() const;  // channel with a held call (for HUD hint)

    // Estimated speech duration when no audio is available (chars * k + pauses)
    double estimateDuration(const RadioTransmission& t) const;

    // History (for tests / log screen)
    std::vector<RadioTransmission> history;
    bool externalTiming = false;  // true when an audio layer drives finished()

private:
    bool enqueue(const std::string& messageId, bool fromPlayer = false);
    RadioTransmission resolve(const RadioMessageDef& def) const;
    bool validNow(const RadioTransmission& t) const;
    void appendNumber(std::vector<std::string>& frags, std::string& sub, const std::string& token) const;

    const RadioPhrasebook* book_ = nullptr;
    RadioContext ctx_;
    bool pattern_ = false;
    AtcState state_ = AtcState::Startup;
    std::deque<RadioTransmission> queue_;
    RadioTransmission current_, last_;
    bool playing_ = false, hasLast_ = false;
    double remaining_ = 0, t_ = 0;
    std::map<std::string, double> lastPlayed_;
    std::string playerChannel_ = "tower";
    bool autoTune_ = true;
    // live values for parameter tokens
    double altFt_ = 0;
    std::string wpId_;
    std::string pendingAck_;      // reply id expected after a needsAck message
    bool airborneSeen_ = false, liftoffT_ = false, warnedTaxi_ = false, warnedTko_ = false;
    bool gearWarnedThisApproach_ = false, onFinal_ = false, landedReported_ = false, fuelLow_ = false;
    double liftoffTime_ = -1, lastTouchSink_ = 0;
    bool nearThresholdStopped_ = false, inboundZone_ = false, readyForInbound_ = false;
};

}  // namespace kanaf
