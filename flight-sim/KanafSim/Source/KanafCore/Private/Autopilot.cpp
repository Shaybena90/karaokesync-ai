#include "Kanaf/Autopilot.h"

#include <algorithm>

namespace kanaf {

const char* PatternAutopilot::phaseName() const {
    switch (phase_) {
        case Phase::Hold: return "hold";
        case Phase::TakeoffRoll: return "takeoff_roll";
        case Phase::InitialClimb: return "initial_climb";
        case Phase::Pattern: return "pattern";
        case Phase::Final: return "final";
        case Phase::Flare: return "flare";
        case Phase::Rollout: return "rollout";
        case Phase::Stopped: return "stopped";
        case Phase::Aborted: return "aborted";
    }
    return "?";
}

void PatternAutopilot::setup(const RunwayRef& rw, double patternAgl, double offset, bool leftPattern) {
    rw_ = rw;
    Vec3 d = rw.farEndNed - rw.thresholdNed;
    d.z = 0;
    len_ = d.length();
    u_ = d.normalized();
    left_ = leftPattern ? Vec3{u_.y, -u_.x, 0} : Vec3{-u_.y, u_.x, 0};
    patternAlt_ = rw.elevationM + patternAgl;
    Vec3 thr = rw.thresholdNed, farEnd = rw.farEndNed;
    thr.z = farEnd.z = 0;
    wps_ = {farEnd + u_ * 3000.0, farEnd + u_ * 3000.0 + left_ * offset, thr + left_ * offset - u_ * 4000.0,
            thr - u_ * 12000.0 + left_ * (offset * 0.35), thr - u_ * 10000.0};
    phase_ = Phase::Hold;
    holdT_ = 0; thrI_ = 0; waypointIndex = 0; gearCmd_ = true;
    touchdownSink = -1; maxNz = minNz = 1; maxAlphaDeg = 0; minPatternAglM = 1e9;
}

void PatternAutopilot::runwayCoords(const Vec3& p, double& along, double& cross) const {
    Vec3 rel = p - rw_.thresholdNed;
    rel.z = 0;
    along = rel.dot(u_);
    Vec3 right{-u_.y, u_.x, 0};
    right = Vec3{-u_.y, u_.x, 0};
    // right of the runway direction in NED: rotate u by +90 deg -> (-u.y, u.x)
    cross = rel.dot(right);
}

double PatternAutopilot::stickForNz(double nz, const FlightProfile& p) const {
    if (nz >= 1) return clampd((nz - 1) / (p.maxG - 1), 0, 1);
    return -clampd((1 - nz) / (1 - p.minG), 0, 1);
}

double PatternAutopilot::stickForBank(double phiCmd, double phi, const FlightProfile& p) const {
    double pCmd = clampd(1.5 * (phiCmd - phi), -60 * kDeg2Rad, 60 * kDeg2Rad);
    return clampd(pCmd / p.maxRollRate, -1, 1);
}

double PatternAutopilot::autothrottle(double dt, double target, double cas) {
    double e = target - cas;
    thrI_ = clampd(thrI_ + e * dt * 0.004, -0.4, 0.4);
    thr_ = clampd(0.55 + 0.04 * e + thrI_, 0.0, 0.899);
    return thr_;
}

void PatternAutopilot::update(double dt, const FlightModel& fm, ControlInputs& out) {
    const FlightData& fd = fm.data();
    const AircraftState& st = fm.state();
    const FlightProfile& P = fm.profile();
    out = ControlInputs();
    out.gearDown = gearCmd_;
    if (st.crashed) { phase_ = Phase::Aborted; return; }

    double along, cross;
    runwayCoords(st.pos, along, cross);
    double rwHdg = std::atan2(u_.y, u_.x);
    double track = fd.groundSpeed > 5 ? fd.trackDeg * kDeg2Rad : fd.headingDeg * kDeg2Rad;
    double hdg = fd.headingDeg * kDeg2Rad;
    double phi = fd.rollDeg * kDeg2Rad, theta = fd.pitchDeg * kDeg2Rad;
    double V = std::max(fd.tas, 30.0);
    double gamma = std::asin(clampd(fd.vsMs / V, -1, 1));
    if (!fd.weightOnWheels) {
        maxNz = std::max(maxNz, fd.nz); minNz = std::min(minNz, fd.nz);
        maxAlphaDeg = std::max(maxAlphaDeg, fd.alpha * kRad2Deg);
    }
    auto pitchToGamma = [&](double gammaCmd, double phiNow) {
        double nz = std::cos(gamma) / std::max(std::cos(phiNow), 0.5) + (V / kG0) * 1.2 * (gammaCmd - gamma);
        return stickForNz(clampd(nz, -1.0, 4.0), P);
    };
    auto centerline = [&](double maxBankDeg) {
        // Outer cross-track loop (~0.12/s) kept well below the heading loop (~0.3/s).
        double courseCmd = rwHdg + clampd(-cross / 650.0, -0.35, 0.35);
        double phiCmd = clampd(2.0 * wrapPi(courseCmd - track), -maxBankDeg * kDeg2Rad, maxBankDeg * kDeg2Rad);
        return stickForBank(phiCmd, phi, P);
    };
    // CAS that gives the on-speed approach AoA at 1 g for the current weight (flaps down).
    auto onSpeedCas = [&]() {
        AtmosphereSample a = isaAt(fd.altMsl);
        double cl = P.CL0 + P.CLa * P.approachAoa + P.flapCL;
        double tas = std::sqrt(2 * fm.massKg() * kG0 / (a.densityKgM3 * P.S * cl));
        return tas * std::sqrt(a.densityKgM3 / kRho0) + 2 * kKt2Ms;
    };
    auto groundSteer = [&]() {
        return clampd(-0.04 * cross - 2.0 * wrapPi(hdg - rwHdg), -1, 1);
    };

    switch (phase_) {
        case Phase::Hold:
            out.parkingBrake = true;
            out.throttle = 0;
            holdT_ += dt;
            if (holdT_ > 2.0) phase_ = Phase::TakeoffRoll;
            break;

        case Phase::TakeoffRoll: {
            out.throttle = 1.0;
            out.yaw = groundSteer();
            if (fd.cas >= P.rotateKt * kKt2Ms) {
                double thetaCmd = 10 * kDeg2Rad;
                out.pitch = clampd(0.35 + 4.0 * (thetaCmd - theta) - 2.0 * st.omega.y, -1, 1);
            }
            if (!fd.weightOnWheels && fd.wheelAgl > 2.0) phase_ = Phase::InitialClimb;
            if (along > len_ - 200 && fd.weightOnWheels) phase_ = Phase::Aborted;
            break;
        }

        case Phase::InitialClimb: {
            out.throttle = gearCmd_ ? 1.0 : autothrottle(dt, 300 * kKt2Ms, fd.cas);
            if (fd.wheelAgl > 15 && fd.vsMs > 2) gearCmd_ = false;
            out.gearDown = gearCmd_;
            double gammaCmd = clampd(0.002 * (patternAlt_ - fd.altMsl), -0.05, 0.16);
            out.pitch = pitchToGamma(gammaCmd, phi);
            out.roll = centerline(10);
            if (fd.altMsl > rw_.elevationM + 250) phase_ = Phase::Pattern;
            break;
        }

        case Phase::Pattern: {
            minPatternAglM = std::min(minPatternAglM, fd.agl);
            Vec3 p{st.pos.x, st.pos.y, 0};
            Vec3 wp = wps_[size_t(waypointIndex)];
            Vec3 to = wp - p;
            {
                // Advance when close, or when the waypoint has been passed (it is behind us).
                Vec3 vh{st.vel.x, st.vel.y, 0};
                bool behind = to.dot(vh) < 0 && to.length() < 4000;
                if ((to.length() < 1500 || behind) && waypointIndex + 1 < int(wps_.size())) {
                    ++waypointIndex; wp = wps_[size_t(waypointIndex)]; to = wp - p;
                }
            }
            double course = std::atan2(to.y, to.x);
            double phiCmd = clampd(1.8 * wrapPi(course - track), -40 * kDeg2Rad, 40 * kDeg2Rad);
            out.roll = stickForBank(phiCmd, phi, P);
            bool last = waypointIndex >= int(wps_.size()) - 1;
            double altTarget = last ? rw_.elevationM + 520 : patternAlt_;
            double gammaCmd = clampd(0.003 * (altTarget - fd.altMsl), -0.08, 0.12);
            out.pitch = pitchToGamma(gammaCmd, phi);
            double casT = waypointIndex >= 2 ? 200 * kKt2Ms : 250 * kKt2Ms;
            if (waypointIndex >= 3) casT = onSpeedCas() + 10 * kKt2Ms;
            out.throttle = autothrottle(dt, casT, fd.cas);
            if (fd.cas > casT + 15 * kKt2Ms) out.speedbrake = 1;
            if (waypointIndex >= 3 && fd.cas < P.gearMaxSpeedKt * kKt2Ms) gearCmd_ = true;
            out.gearDown = gearCmd_;
            // Final capture: on the approach side, heading roughly along runway.
            if (last && along < -6000 && std::fabs(wrapPi(track - rwHdg)) < 35 * kDeg2Rad && std::fabs(cross) < 1500)
                phase_ = Phase::Final;
            break;
        }

        case Phase::Final: {
            gearCmd_ = true;
            out.gearDown = true;
            double aim = 300.0;  // aim point beyond threshold (m)
            double dist = aim - along;
            double hTarget = std::tan(3.0 * kDeg2Rad) * std::max(dist, 0.0);
            double hNow = fd.wheelAgl + (fd.altMsl - fd.agl - rw_.elevationM);  // wheel height above runway elevation
            double gammaCmd = -3.0 * kDeg2Rad + clampd(0.0035 * (hTarget - hNow), -2.5 * kDeg2Rad, 2.5 * kDeg2Rad);
            out.pitch = pitchToGamma(gammaCmd, phi);
            out.roll = centerline(20);
            out.yaw = 0;
            double vApp = onSpeedCas();
            out.throttle = autothrottle(dt, vApp, fd.cas);
            if (fd.cas > vApp + 12 * kKt2Ms) out.speedbrake = 1;
            if (fd.wheelAgl < 18.0) phase_ = Phase::Flare;
            break;
        }

        case Phase::Flare: {
            // Modest fighter flare: reduce sink to ~0.9 m/s, never exceed 12.5 deg pitch (tail clearance).
            double vsCmd = -std::max(0.7, fd.wheelAgl * 0.22);
            double gammaCmd = std::asin(clampd(vsCmd / V, -0.2, 0.0));
            out.pitch = pitchToGamma(gammaCmd, phi);
            if (theta > 12.5 * kDeg2Rad) out.pitch = std::min(out.pitch, stickForNz(0.85, P));
            out.roll = centerline(5);
            out.throttle = fd.wheelAgl < 3.0 ? 0.0 : autothrottle(dt, onSpeedCas() - 4 * kKt2Ms, fd.cas);
            out.gearDown = true;
            if (fd.weightOnWheels) {
                touchdownSink = fd.lastTouchdownSink;
                touchdownAlong = along;
                touchdownCross = cross;
                phase_ = Phase::Rollout;
            }
            break;
        }

        case Phase::Rollout: {
            out.throttle = 0;
            out.gearDown = true;
            out.speedbrake = 1;
            // hold attitude briefly (aerobraking) then lower the nose
            out.pitch = fd.noseOnGround ? 0.0 : clampd(4.0 * (8 * kDeg2Rad - theta) * 0.3, -0.3, 0.3);
            out.yaw = groundSteer();
            if (fd.noseOnGround && fd.groundSpeed < 75) { out.brakeLeft = out.brakeRight = 0.7; }
            if (fd.groundSpeed < 0.3) {
                stopAlong = along; stopCross = cross;
                phase_ = Phase::Stopped;
            }
            break;
        }

        case Phase::Stopped:
            out.parkingBrake = true;
            out.throttle = 0;
            break;
        case Phase::Aborted:
            out.throttle = 0;
            out.brakeLeft = out.brakeRight = 1;
            break;
    }
}

}  // namespace kanaf
