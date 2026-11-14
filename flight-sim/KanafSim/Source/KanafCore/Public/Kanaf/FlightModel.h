// Six-degree-of-freedom rigid-body flight model (game-grade, documented in docs/FLIGHT_MODEL.md).
// Frames: world = local NED of the GeoFrame (metres); body = x forward, y right, z down.
// Forces: thrust, aerodynamic lift/drag/side force, gravity, landing-gear strut + tyre friction.
// Moments: aerodynamic stability/control derivatives, gear contact torques, full inertia tensor
// (Ixx, Iyy, Izz, Ixz), scaled with current mass (fuel + stores).
#pragma once
#include <string>
#include <vector>

#include "Kanaf/Atmosphere.h"
#include "Kanaf/Json.h"
#include "Kanaf/MathTypes.h"
#include "Kanaf/Terrain.h"

namespace kanaf {

struct GearContactDef {
    std::string id;
    Vec3 posM;  // body frame, strut fully extended
    double spring = 0, damper = 0, maxStroke = 0.35;
    bool steerable = false, brakes = false;
};

struct CrashPointDef {
    std::string id;
    Vec3 posM;
    double tolerantSinkMs = 0;  // >0 => a scrape below this sink rate is only a warning (tail strike)
};

struct FlightProfile {
    std::string id;
    // geometry
    double S = 27.87, b = 9.96, c = 3.45;
    // mass
    double emptyKg = 10000, crewKg = 200, internalFuelKg = 3160, cftFuelKg = 0;
    double inertiaRefMass = 9295, Ixx = 12875, Iyy = 75674, Izz = 85552, Ixz = 1331;
    // engine
    double milThrust = 79200, abThrust = 129400, idleFrac = 0.06, spoolUp = 4, spoolDown = 3;
    double tsfcMil = 2.15e-5, tsfcAb = 5.5e-5, lapseExp = 0.75, machGain = 0.25;
    // aero
    double CL0 = 0.05, CLa = 3.6, alphaStall = 26 * kDeg2Rad, CLpostDrop = 0.45;
    double CD0 = 0.024, k = 0.13, machCrit = 0.88, wavePeak = 0.028;
    double flapCL = 0.25, flapCD = 0.02, gearCD = 0.022, sbCD = 0.06, storeCDPerKg = 4.5e-6;
    double CYb = -0.9, CYdr = 0.15;
    double Cm0 = 0, CmA = -0.25, CmQ = -6, CmDe = -0.9;
    double ClB = -0.08, ClP = -0.35, ClDa = -0.12, ClDr = 0.01;
    double CnB = 0.12, CnR = -0.35, CnDr = -0.06;
    double maxDe = 25 * kDeg2Rad, maxDa = 21.5 * kDeg2Rad, maxDr = 30 * kDeg2Rad, surfRate = 60 * kDeg2Rad;
    // limits / handling
    double maxG = 9, minG = -3, aoaLimit = 25 * kDeg2Rad, maxRollRate = 240 * kDeg2Rad;
    double gearMaxSpeedKt = 300, maxTouchdownSink = 4.5, hardLandingSink = 3.0;
    double rotateKt = 150, approachAoa = 13 * kDeg2Rad, approachKt = 150, gearTime = 6;
    // gear
    std::vector<GearContactDef> gear;
    double rollFric = 0.025, brakeFric = 0.55, latFric = 0.75;
    double maxSteer = 32 * kDeg2Rad, highSpeedSteer = 8 * kDeg2Rad, steerBlendKt = 40;
    std::vector<CrashPointDef> crashPoints;
    Vec3 eyePoint{4.4, 0, -0.75};

    bool loadFromJson(const JsonValue& j, std::string& error);
};

struct ControlInputs {
    double pitch = 0, roll = 0, yaw = 0;  // pilot stick/pedals, -1..1 (pitch +1 = stick aft)
    double throttle = 0;                  // 0..1; above kAbDetent = afterburner
    double brakeLeft = 0, brakeRight = 0; // 0..1
    bool parkingBrake = false;
    bool gearDown = true;
    double speedbrake = 0;                // 0..1 command
    bool flapsAuto = true;
    double flapsManual = 0;
    static constexpr double kAbDetent = 0.9;
};

// Normalised control surface commands produced by the flight control system, -1..1.
struct SurfaceCommands { double elevator = 0, aileron = 0, rudder = 0, nosewheel = 0; };

enum class SimEvent {
    None, LiftOff, Touchdown, HardLanding, TailStrike, Crash, GearUp, GearDown, Stall, Overstress,
    FuelLow, FuelBingo, FlameOut, StoppedOnGround
};

struct SimEventRecord { SimEvent type; double time; double value; std::string detail; };

struct AircraftState {
    Vec3 pos;                 // NED, CG
    Vec3 vel;                 // NED, m/s
    Quat att;                 // body -> NED
    Vec3 omega;               // body rates p,q,r (rad/s)
    double fuelKg = 0;
    double storesKg = 0;
    double storesCD = 0;      // extra drag coefficient from external stores
    double spool = 0.0;       // 0..1 (core speed fraction above idle)
    double abLevel = 0.0;     // 0..1 afterburner
    double gearPos = 1.0;     // 0 up .. 1 down
    double flapPos = 0, sbPos = 0;
    double de = 0, da = 0, dr = 0;  // actual surface positions (rad)
    bool crashed = false;
    std::string crashReason;
    double time = 0;
};

// Values derived each step (for HUD, instruments, missions, radio, tests).
struct FlightData {
    double tas = 0, cas = 0, mach = 0, groundSpeed = 0;
    double alpha = 0, beta = 0;
    double nz = 1;                 // load factor (g), positive = pulling
    double altMsl = 0, agl = 0, wheelAgl = 0;
    double latDeg = 0, lonDeg = 0;
    double headingDeg = 0, pitchDeg = 0, rollDeg = 0, trackDeg = 0;
    double vsMs = 0;
    double thrustN = 0, fuelFlowKgS = 0, rpmPct = 0, nozzlePct = 0;
    double massKg = 0;
    double qbar = 0;
    bool weightOnWheels = false, noseOnGround = false, mainsOnGround = false;
    bool onRunway = false;
    bool stallWarning = false;
    bool groundDataReal = true;
    double lastTouchdownSink = 0;
    int gearOnGround = 0;
};

class FlightModel {
public:
    void setProfile(const FlightProfile& p) { prof_ = p; }
    const FlightProfile& profile() const { return prof_; }
    void setGround(const GroundModel* g) { ground_ = g; }
    void setWindNed(const Vec3& w) { wind_ = w; }
    void setIsaDeviation(double dK) { isaDev_ = dK; }

    // Place the aircraft at rest on the ground at a NED horizontal position and true heading.
    void resetOnGround(double northM, double eastM, double headingDeg, double fuelFraction, double storesKg, double storesCD);
    // Place in the air.
    void resetInAir(const Vec3& posNed, double headingDeg, double tasMs, double fuelFraction);

    // Advance by dt seconds (internally sub-stepped at <= 1/120 s).
    void step(double dt, const ControlInputs& in, const SurfaceCommands& cmd);

    const AircraftState& state() const { return st_; }
    AircraftState& mutableState() { return st_; }
    const FlightData& data() const { return fd_; }
    double massKg() const;

    // Events since last call (cleared on read).
    std::vector<SimEventRecord> takeEvents();

    // Expected max fuel.
    double maxFuelKg() const { return prof_.internalFuelKg + prof_.cftFuelKg; }

private:
    void substep(double dt, const ControlInputs& in, const SurfaceCommands& cmd);
    void computeData();
    void emit(SimEvent e, double v = 0, const std::string& d = "");

    FlightProfile prof_;
    const GroundModel* ground_ = nullptr;
    Vec3 wind_;
    double isaDev_ = 0;
    AircraftState st_;
    FlightData fd_;
    std::vector<SimEventRecord> events_;
    bool wasOnGround_ = true, stallLatched_ = false, overstressLatched_ = false;
    bool fuelLowLatched_ = false, bingoLatched_ = false, stoppedLatched_ = true, tailStrikeLatched_ = false;
    double groundZ_ = 0;
    Vec3 groundN_{0, 0, -1};
    bool onRunway_ = false;
    double maxSinkSinceAir_ = 0;
};

// ---- Flight control system (fly-by-wire style control laws) -------------------------------

enum class ControlMode { Beginner, Advanced };

class FlightControlSystem {
public:
    void setMode(ControlMode m) { mode_ = m; }
    ControlMode mode() const { return mode_; }
    void reset() { iq_ = 0; ip_ = 0; }
    SurfaceCommands update(double dt, const ControlInputs& pilot, const FlightModel& fm);
    // Last commanded load factor / roll rate (for HUD/tests)
    double lastNzCmd() const { return nzCmd_; }

private:
    ControlMode mode_ = ControlMode::Beginner;
    double iq_ = 0, ip_ = 0, nzCmd_ = 1;
};

}  // namespace kanaf
