// Scripted "test pilot": flies a complete left-hand traffic pattern (takeoff -> pattern ->
// 3-degree approach -> flare -> rollout) using ONLY pilot-level inputs (stick, throttle, pedals,
// brakes, gear) through the real FlightControlSystem in Advanced mode. Used by automated tests
// and available in-game as a demo/attract mode.
#pragma once
#include <string>
#include <vector>

#include "Kanaf/FlightModel.h"

namespace kanaf {

struct RunwayRef {
    Vec3 thresholdNed;   // start of takeoff roll / landing threshold (same end)
    Vec3 farEndNed;      // opposite threshold
    double elevationM = 0;
    double widthM = 45;
};

class PatternAutopilot {
public:
    enum class Phase { Hold, TakeoffRoll, InitialClimb, Pattern, Final, Flare, Rollout, Stopped, Aborted };

    void setup(const RunwayRef& rw, double patternAglM = 610, double downwindOffsetM = 4500, bool leftPattern = true);
    void update(double dt, const FlightModel& fm, ControlInputs& out);
    Phase phase() const { return phase_; }
    const char* phaseName() const;

    // runway-relative geometry for a NED point: along-track from threshold, cross-track (right +)
    void runwayCoords(const Vec3& ned, double& along, double& cross) const;

    // Telemetry
    double touchdownSink = -1, touchdownAlong = 0, touchdownCross = 0;
    double maxNz = 1, minNz = 1, maxAlphaDeg = 0, minPatternAglM = 1e9;
    double stopAlong = 0, stopCross = 0;
    int waypointIndex = 0;

private:
    double stickForNz(double nz, const FlightProfile& p) const;
    double stickForBank(double phiCmd, double phi, const FlightProfile& p) const;
    double autothrottle(double dt, double casTarget, double cas);

    RunwayRef rw_;
    Vec3 u_, left_;
    double len_ = 0, patternAlt_ = 0;
    std::vector<Vec3> wps_;
    Phase phase_ = Phase::Hold;
    double holdT_ = 0, thrI_ = 0, thr_ = 0.6;
    bool gearCmd_ = true;
};

}  // namespace kanaf
