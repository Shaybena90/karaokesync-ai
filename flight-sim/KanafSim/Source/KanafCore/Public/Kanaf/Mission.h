// Mission runtime: evaluates data-driven objectives against the real simulation state/events,
// produces success/failure and an after-action summary. Scenarios are fictional.
#pragma once
#include <string>
#include <vector>

#include "Kanaf/Catalog.h"
#include "Kanaf/Session.h"

namespace kanaf {

enum class MissionResult { Running, Success, Failed, Ended };

struct ObjectiveState {
    ObjectiveDef def;
    bool done = false, failed = false;
    double doneTime = 0;
};

// Mission-level events that other systems (radio, HUD) react to.
enum class MissionEventType { ObjectiveDone, ObjectiveFailed, WaypointReached, MissionSuccess, MissionFailed };
struct MissionEvent { MissionEventType type; std::string id; std::string textHe; int index = -1; };

struct MissionSummary {
    std::string missionId, missionNameHe, resultHe;
    MissionResult result = MissionResult::Running;
    double flightTimeS = 0, maxAltMslM = 0, maxG = 1, minG = 1, maxSpeedKt = 0, distanceKm = 0, fuelUsedKg = 0;
    double touchdownSinkMs = -1, touchdownCrossM = 0;
    int score = 0;                   // 0..100 (0 if failed)
    std::vector<std::pair<std::string, bool>> objectives;  // text, done
    std::string failReasonHe;
};

class MissionRuntime {
public:
    void start(const MissionDef& m, const FlightSession& s);
    void update(double dt, const FlightSession& s, const std::vector<SimEventRecord>& events);
    void endByPlayer();
    MissionResult result() const { return result_; }
    const std::vector<ObjectiveState>& objectives() const { return obj_; }
    int nextWaypoint() const { return wpIndex_; }
    const MissionDef& def() const { return def_; }
    std::vector<MissionEvent> takeEvents();
    MissionSummary summary() const;
    // Distance to the active runway threshold along the runway axis etc. (for HUD/radio)
    double runwayAlong() const { return along_; }
    double runwayCross() const { return cross_; }
    double elapsed() const { return t_; }

private:
    void complete(ObjectiveState& o);
    void fail(const std::string& reasonHe);
    MissionDef def_;
    std::vector<ObjectiveState> obj_;
    std::vector<MissionEvent> events_;
    MissionResult result_ = MissionResult::Running;
    std::string failReasonHe_;
    double t_ = 0, maxAlt_ = 0, maxG_ = 1, minG_ = 1, maxKt_ = 0, distM_ = 0, fuel0_ = 0, fuelNow_ = 0;
    double tdSink_ = -1, tdCross_ = 0, along_ = 0, cross_ = 0;
    bool airborneSeen_ = false, landed_ = false;
    int wpIndex_ = 0;
    Vec3 lastPos_;
    double baseLat_ = 0, baseLon_ = 0;
};

}  // namespace kanaf
