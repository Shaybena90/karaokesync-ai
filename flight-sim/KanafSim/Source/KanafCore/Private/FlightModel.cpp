#include "Kanaf/FlightModel.h"

#include <algorithm>

namespace kanaf {

namespace {
double V(const JsonValue& o, const char* k, double def) {
    const JsonValue& f = o[k];
    if (f.isObject()) return f["v"].num(def);
    return f.num(def);
}
Vec3 vec(const JsonValue& a) { return {a[0].num(), a[1].num(), a[2].num()}; }
}  // namespace

bool FlightProfile::loadFromJson(const JsonValue& j, std::string& error) {
    if (!j.isObject()) { error = "profile is not an object"; return false; }
    id = j["id"].str();
    const auto& g = j["geometry"]; const auto& m = j["mass"]; const auto& e = j["engine"];
    const auto& a = j["aero"]; const auto& l = j["limits"]; const auto& h = j["handling"]; const auto& gr = j["gear"];
    S = V(g, "wingAreaM2", S); b = V(g, "spanM", b); c = V(g, "meanChordM", c);
    emptyKg = V(m, "emptyKg", emptyKg); crewKg = V(m, "crewKg", crewKg);
    internalFuelKg = V(m, "internalFuelKg", internalFuelKg); cftFuelKg = V(m, "cftFuelKg", 0);
    inertiaRefMass = V(m, "inertiaRefMassKg", inertiaRefMass);
    Ixx = V(m, "IxxKgM2", Ixx); Iyy = V(m, "IyyKgM2", Iyy); Izz = V(m, "IzzKgM2", Izz); Ixz = V(m, "IxzKgM2", Ixz);
    milThrust = V(e, "milThrustN", milThrust); abThrust = V(e, "abThrustN", abThrust);
    idleFrac = V(e, "idleThrustFraction", idleFrac); spoolUp = V(e, "spoolUpTimeS", spoolUp); spoolDown = V(e, "spoolDownTimeS", spoolDown);
    tsfcMil = V(e, "tsfcMilKgPerNs", tsfcMil); tsfcAb = V(e, "tsfcAbKgPerNs", tsfcAb);
    lapseExp = V(e, "densityLapseExponent", lapseExp); machGain = V(e, "machThrustGain", machGain);
    CL0 = V(a, "CL0", CL0); CLa = V(a, "CLalphaPerRad", CLa); alphaStall = V(a, "alphaStallDeg", 26) * kDeg2Rad;
    CLpostDrop = V(a, "CLpostStallDrop", CLpostDrop); CD0 = V(a, "CD0", CD0); k = V(a, "inducedK", k);
    machCrit = V(a, "machCrit", machCrit); wavePeak = V(a, "waveDragPeak", wavePeak);
    flapCL = V(a, "flapCL", flapCL); flapCD = V(a, "flapCD", flapCD); gearCD = V(a, "gearCD", gearCD);
    sbCD = V(a, "speedbrakeCD", sbCD); storeCDPerKg = V(a, "storeCDPerKg", storeCDPerKg);
    CYb = V(a, "CYbeta", CYb); CYdr = V(a, "CYdr", CYdr);
    Cm0 = V(a, "Cm0", Cm0); CmA = V(a, "CmAlpha", CmA); CmQ = V(a, "CmQ", CmQ); CmDe = V(a, "CmDe", CmDe);
    ClB = V(a, "ClBeta", ClB); ClP = V(a, "ClP", ClP); ClDa = V(a, "ClDa", ClDa); ClDr = V(a, "ClDr", ClDr);
    CnB = V(a, "CnBeta", CnB); CnR = V(a, "CnR", CnR); CnDr = V(a, "CnDr", CnDr);
    maxDe = V(a, "maxElevatorDeg", 25) * kDeg2Rad; maxDa = V(a, "maxAileronDeg", 21.5) * kDeg2Rad;
    maxDr = V(a, "maxRudderDeg", 30) * kDeg2Rad; surfRate = V(a, "surfaceRateDegS", 60) * kDeg2Rad;
    maxG = V(l, "maxG", maxG); minG = V(l, "minG", minG); aoaLimit = V(l, "aoaLimitDeg", 25) * kDeg2Rad;
    maxRollRate = V(l, "maxRollRateDegS", 240) * kDeg2Rad; gearMaxSpeedKt = V(l, "gearMaxSpeedKt", gearMaxSpeedKt);
    maxTouchdownSink = V(l, "maxTouchdownSinkMs", maxTouchdownSink); hardLandingSink = V(l, "hardLandingSinkMs", hardLandingSink);
    rotateKt = V(h, "rotateSpeedKt", rotateKt); approachAoa = V(h, "approachAoaDeg", 13) * kDeg2Rad;
    approachKt = V(h, "approachSpeedKt", approachKt); gearTime = V(h, "gearRetractTimeS", gearTime);
    gear.clear();
    for (auto& gc : gr["contacts"].items()) {
        GearContactDef d;
        d.id = gc["id"].str(); d.posM = vec(gc["posM"]); d.spring = gc["springNPerM"].num(); d.damper = gc["damperNsPerM"].num();
        d.maxStroke = gc["maxStrokeM"].num(0.35); d.steerable = gc["steerable"].boolean(); d.brakes = gc["brakes"].boolean();
        gear.push_back(d);
    }
    rollFric = gr["rollingFriction"].num(rollFric); brakeFric = gr["brakeFriction"].num(brakeFric);
    latFric = gr["lateralFriction"].num(latFric); maxSteer = gr["maxSteerDeg"].num(32) * kDeg2Rad;
    highSpeedSteer = gr["highSpeedSteerDeg"].num(8) * kDeg2Rad; steerBlendKt = gr["steerBlendKt"].num(40);
    crashPoints.clear();
    for (auto& cp : j["structure"]["crashPoints"].items())
        crashPoints.push_back({cp["id"].str(), vec(cp["posM"]), cp["tailStrikeTolerantSinkMs"].num(0)});
    if (j["cockpit"]["eyePointM"].isArray()) eyePoint = vec(j["cockpit"]["eyePointM"]);
    if (gear.size() < 3) { error = "profile needs >= 3 gear contacts"; return false; }
    if (S <= 0 || emptyKg <= 0 || milThrust <= 0) { error = "profile has invalid geometry/mass/thrust"; return false; }
    return true;
}

double FlightModel::massKg() const { return prof_.emptyKg + prof_.crewKg + st_.fuelKg + st_.storesKg; }

void FlightModel::emit(SimEvent e, double v, const std::string& d) { events_.push_back({e, st_.time, v, d}); }

std::vector<SimEventRecord> FlightModel::takeEvents() {
    std::vector<SimEventRecord> out;
    out.swap(events_);
    return out;
}

void FlightModel::resetOnGround(double north, double east, double headingDeg, double fuelFraction, double storesKg, double storesCD) {
    st_ = AircraftState();
    st_.fuelKg = maxFuelKg() * clampd(fuelFraction, 0, 1);
    st_.storesKg = storesKg;
    st_.storesCD = storesCD;
    st_.gearPos = 1;
    st_.att = Quat::fromEuler(0, 0, headingDeg * kDeg2Rad);
    double gz = 0;
    if (ground_) ground_->sampleNed({north, east, 0}, gz);
    // CG height: strut length minus estimated static compression.
    double strut = prof_.gear.empty() ? 1.9 : prof_.gear[0].posM.z;
    double mainStatic = 0.0;
    double mainK = 0;
    for (auto& g : prof_.gear) if (g.brakes) mainK += g.spring;
    if (mainK > 0) mainStatic = massKg() * kG0 * 0.88 / mainK;
    st_.pos = {north, east, gz - (strut - mainStatic)};
    events_.clear();
    wasOnGround_ = true; stoppedLatched_ = true; stallLatched_ = overstressLatched_ = false;
    flying_ = false; airborneTime_ = 0;
    fuelLowLatched_ = bingoLatched_ = false; maxSinkSinceAir_ = 0;
    computeData();
}

void FlightModel::resetInAir(const Vec3& pos, double headingDeg, double tas, double fuelFraction) {
    st_ = AircraftState();
    st_.fuelKg = maxFuelKg() * clampd(fuelFraction, 0, 1);
    st_.pos = pos;
    st_.att = Quat::fromEuler(0, 0, headingDeg * kDeg2Rad);
    st_.vel = st_.att.rotate({tas, 0, 0});
    st_.gearPos = 0;
    st_.spool = 0.8;
    events_.clear();
    wasOnGround_ = false; stoppedLatched_ = false;
    flying_ = true; airborneTime_ = 1.0;
    computeData();
}

void FlightModel::step(double dt, const ControlInputs& in, const SurfaceCommands& cmd) {
    if (st_.crashed || dt <= 0) return;
    const double maxH = 1.0 / 200.0;
    int n = int(std::ceil(dt / maxH));
    double h = dt / n;
    for (int i = 0; i < n && !st_.crashed; ++i) substep(h, in, cmd);
    computeData();
}

static double clCurve(const FlightProfile& p, double alpha, double flap) {
    double sgn = alpha < 0 ? -1.0 : 1.0;
    double aa = std::fabs(alpha);
    double clLin = p.CL0 + p.CLa * alpha + p.flapCL * flap;
    if (aa <= p.alphaStall) return clLin;
    double clStall = p.CL0 * sgn + p.CLa * p.alphaStall * sgn + p.flapCL * flap;
    double t = clampd((aa - p.alphaStall) / (15 * kDeg2Rad), 0, 1);
    double post = clStall * (1 - p.CLpostDrop * t);
    double plate = 1.1 * std::sin(2 * alpha);  // flat-plate behaviour at very high alpha
    double t2 = clampd((aa - p.alphaStall - 15 * kDeg2Rad) / (20 * kDeg2Rad), 0, 1);
    return lerpd(post, plate, t2);
}

void FlightModel::substep(double h, const ControlInputs& in, const SurfaceCommands& cmd) {
    const FlightProfile& P = prof_;
    st_.time += h;
    double m = massKg();
    double ms = m / P.inertiaRefMass;
    double Ixx = P.Ixx * ms, Iyy = P.Iyy * ms, Izz = P.Izz * ms, Ixz = P.Ixz * ms;

    // --- actuators -------------------------------------------------------------------------
    double sr = P.surfRate * h;
    st_.de = approach(st_.de, clampd(cmd.elevator, -1, 1) * P.maxDe, sr);
    st_.da = approach(st_.da, clampd(cmd.aileron, -1, 1) * P.maxDa, sr * 1.5);
    st_.dr = approach(st_.dr, clampd(cmd.rudder, -1, 1) * P.maxDr, sr);

    bool wow = fd_.weightOnWheels;
    double gearTarget = in.gearDown ? 1.0 : 0.0;
    if (wow && gearTarget < 1) gearTarget = 1;  // weight-on-wheels interlock
    double oldGear = st_.gearPos;
    st_.gearPos = approach(st_.gearPos, gearTarget, h / P.gearTime);
    if (oldGear > 0 && st_.gearPos == 0) emit(SimEvent::GearUp);
    if (oldGear < 1 && st_.gearPos == 1) emit(SimEvent::GearDown);
    double flapTarget = in.flapsAuto ? ((in.gearDown && fd_.cas < 240 * kKt2Ms) ? 1.0 : 0.0) : clampd(in.flapsManual, 0, 1);
    st_.flapPos = approach(st_.flapPos, flapTarget, h / 3.0);
    st_.sbPos = approach(st_.sbPos, clampd(in.speedbrake, 0, 1), h / 2.0);

    // --- engine ----------------------------------------------------------------------------
    double thr = clampd(in.throttle, 0, 1);
    double coreTarget = clampd(thr / ControlInputs::kAbDetent, 0, 1);
    double abTarget = thr > ControlInputs::kAbDetent ? (thr - ControlInputs::kAbDetent) / (1 - ControlInputs::kAbDetent) : 0;
    if (st_.fuelKg <= 0) { coreTarget = 0; abTarget = 0; }
    st_.spool = approach(st_.spool, coreTarget, h / (coreTarget > st_.spool ? P.spoolUp : P.spoolDown));
    if (st_.spool < 0.97) abTarget = 0;
    st_.abLevel = approach(st_.abLevel, abTarget, h / 1.2);

    AtmosphereSample atm = isaAt(fd_.altMsl, isaDev_);
    Vec3 vAir = st_.vel - wind_;
    Vec3 vb = st_.att.inverseRotate(vAir);
    double Vt = vb.length();
    double mach = Vt / atm.speedOfSoundMs;
    double lapse = std::pow(atm.densityKgM3 / kRho0, P.lapseExp) * (1 + P.machGain * mach);
    double milPart = P.milThrust * (P.idleFrac + (1 - P.idleFrac) * st_.spool) * lapse;
    double abPart = (P.abThrust - P.milThrust) * st_.abLevel * lapse;
    double thrust = st_.fuelKg > 0 ? milPart + abPart : 0;
    double fuelFlow = st_.fuelKg > 0 ? P.tsfcMil * milPart + P.tsfcAb * abPart : 0;
    st_.fuelKg = std::max(0.0, st_.fuelKg - fuelFlow * h);

    Vec3 Fb{thrust, 0, 0};
    Vec3 Mb;

    // --- aerodynamics ----------------------------------------------------------------------
    double alpha = 0, beta = 0, qbar = 0;
    if (Vt > 1.0) {
        alpha = std::atan2(vb.z, vb.x);
        beta = std::asin(clampd(vb.y / Vt, -1, 1));
        qbar = 0.5 * atm.densityKgM3 * Vt * Vt;
        double CL = clCurve(P, alpha, st_.flapPos);
        double wave = 0;
        if (mach > P.machCrit) {
            double x = (mach - P.machCrit) / (1.1 - P.machCrit);
            wave = mach < 1.1 ? P.wavePeak * x * x : P.wavePeak * (1.0 - 0.25 * clampd((mach - 1.1) / 0.9, 0, 1));
        }
        double CD = P.CD0 + wave + P.k * CL * CL + P.gearCD * st_.gearPos + P.flapCD * st_.flapPos + P.sbCD * st_.sbPos + st_.storesCD;
        double aa = std::fabs(alpha);
        if (aa > P.alphaStall) CD += 1.5 * (std::sin(aa) * std::sin(aa) - std::sin(P.alphaStall) * std::sin(P.alphaStall));
        double CY = P.CYb * beta + P.CYdr * st_.dr;
        double L = qbar * P.S * CL, D = qbar * P.S * CD, Y = qbar * P.S * CY;
        Fb += vb * (-D / Vt);
        Fb += Vec3{std::sin(alpha), 0, -std::cos(alpha)} * L;
        Fb.y += Y;

        double Vn = std::max(Vt, 20.0);
        double ph = st_.omega.x * P.b / (2 * Vn), qh = st_.omega.y * P.c / (2 * Vn), rh = st_.omega.z * P.b / (2 * Vn);
        double aEff = clampd(alpha, -30 * kDeg2Rad, 50 * kDeg2Rad);
        double Cl = P.ClB * beta + P.ClP * ph + P.ClDa * st_.da + P.ClDr * st_.dr;
        double Cm = P.Cm0 + P.CmA * aEff + P.CmQ * qh + P.CmDe * st_.de;
        double Cn = P.CnB * beta + P.CnR * rh + P.CnDr * st_.dr;
        Mb += Vec3{qbar * P.S * P.b * Cl, qbar * P.S * P.c * Cm, qbar * P.S * P.b * Cn};
    }

    // --- ground contact --------------------------------------------------------------------
    int contacts = 0;
    bool noseC = false, mainC = false;
    double touchdownSink = 0;
    if (ground_) {
        GroundSample gs = ground_->sampleNed(st_.pos, groundZ_);
        groundN_ = gs.normalNed;
        onRunway_ = gs.surface == SurfaceType::Runway;
    } else {
        groundZ_ = 0; groundN_ = {0, 0, -1}; onRunway_ = true;
    }
    const Vec3 nUp = groundN_;  // points up (negative z)
    const Vec3 p0{st_.pos.x, st_.pos.y, groundZ_};
    double gsMs = std::sqrt(st_.vel.x * st_.vel.x + st_.vel.y * st_.vel.y);

    if (st_.gearPos > 0.98) {
        double steerMax = lerpd(P.maxSteer, P.highSpeedSteer, clampd(gsMs / (P.steerBlendKt * kKt2Ms), 0, 1));
        for (auto& g : P.gear) {
            Vec3 pw = st_.pos + st_.att.rotate(g.posM);
            double hgt = nUp.dot(pw - p0);
            if (hgt >= 0) continue;
            double x = -hgt;
            Vec3 vPoint = st_.vel + st_.att.rotate(st_.omega.cross(g.posM));
            double xdot = -nUp.dot(vPoint);
            if (!wasOnGround_) touchdownSink = std::max(touchdownSink, xdot);
            double Fn = g.spring * x + g.damper * xdot;
            if (x > g.maxStroke) Fn += 20 * g.spring * (x - g.maxStroke);
            if (Fn < 0) Fn = 0;
            ++contacts;
            if (g.steerable) noseC = true; else mainC = true;
            double s = g.steerable ? clampd(cmd.nosewheel, -1, 1) * steerMax : 0;
            Vec3 fw = st_.att.rotate({std::cos(s), std::sin(s), 0});
            fw = (fw - nUp * nUp.dot(fw)).normalized();
            Vec3 lw = nUp.cross(fw).normalized();
            Vec3 vt = vPoint - nUp * nUp.dot(vPoint);
            double vLong = vt.dot(fw), vLat = vt.dot(lw);
            double brake = 0;
            if (g.brakes) {
                brake = in.parkingBrake ? 1.0 : (g.posM.y < 0 ? in.brakeLeft : in.brakeRight);
            }
            double mu = P.rollFric + P.brakeFric * clampd(brake, 0, 1);
            double Flong = -mu * Fn * std::tanh(vLong / 0.1);
            double Flat = -P.latFric * Fn * clampd(vLat / 0.4, -1, 1);
            Vec3 Fw = nUp * Fn + fw * Flong + lw * Flat;
            Vec3 Fbody = st_.att.inverseRotate(Fw);
            Fb += Fbody;
            Mb += g.posM.cross(Fbody);
        }
    }
    // Structure contact (crash / tail strike / belly)
    bool scraping = false;
    for (auto& cp : P.crashPoints) {
        Vec3 pw = st_.pos + st_.att.rotate(cp.posM);
        double hgt = nUp.dot(pw - p0);
        if (hgt >= 0) continue;
        Vec3 vPoint = st_.vel + st_.att.rotate(st_.omega.cross(cp.posM));
        double sink = -nUp.dot(vPoint);
        if (cp.tolerantSinkMs > 0 && sink < cp.tolerantSinkMs && st_.gearPos > 0.98) {
            if (!tailStrikeLatched_) emit(SimEvent::TailStrike, sink, cp.id);
            scraping = true;
            double Fn = std::max(0.0, 300000 * (-hgt) + 40000 * sink);
            Vec3 vt = vPoint - nUp * nUp.dot(vPoint);
            Vec3 Fw = nUp * Fn - vt.normalized() * (0.4 * Fn);
            Vec3 Fbody = st_.att.inverseRotate(Fw);
            Fb += Fbody;
            Mb += cp.posM.cross(Fbody);
            continue;
        }
        st_.crashed = true;
        st_.crashReason = (st_.gearPos < 0.98 && cp.id == "belly") ? "gear_up_landing" : ("impact:" + cp.id);
        emit(SimEvent::Crash, sink, st_.crashReason);
        st_.vel = {}; st_.omega = {};
        return;
    }
    tailStrikeLatched_ = scraping;
    if (contacts > 0 && !wasOnGround_) {
        if (!flying_) {
            // Brief hop (e.g. during the take-off roll): structural limit still applies, but it is
            // not reported as a landing.
            if (touchdownSink > P.maxTouchdownSink) {
                st_.crashed = true;
                st_.crashReason = "gear_collapse_sink";
                emit(SimEvent::Crash, touchdownSink, st_.crashReason);
                st_.vel = {}; st_.omega = {};
                return;
            }
        } else if (touchdownSink > P.maxTouchdownSink) {
            st_.crashed = true;
            st_.crashReason = "gear_collapse_sink";
            emit(SimEvent::Crash, touchdownSink, st_.crashReason);
            st_.vel = {}; st_.omega = {};
            return;
        }
        if (flying_) {
            fd_.lastTouchdownSink = touchdownSink;
            emit(SimEvent::Touchdown, touchdownSink, onRunway_ ? "runway" : "terrain");
            if (touchdownSink > P.hardLandingSink) emit(SimEvent::HardLanding, touchdownSink);
            flying_ = false;
        }
    }

    // --- specific force -> load factor -----------------------------------------------------
    double nz = -Fb.z / (m * kG0);

    // --- integrate translation -------------------------------------------------------------
    Vec3 acc = st_.att.rotate(Fb) / m + Vec3{0, 0, kG0};
    st_.vel += acc * h;
    st_.pos += st_.vel * h;

    // --- integrate rotation ----------------------------------------------------------------
    const Vec3& w = st_.omega;
    Vec3 Iw{Ixx * w.x - Ixz * w.z, Iyy * w.y, -Ixz * w.x + Izz * w.z};
    Vec3 rhs = Mb - w.cross(Iw);
    double det = Ixx * Izz - Ixz * Ixz;
    Vec3 wdot{(Izz * rhs.x + Ixz * rhs.z) / det, rhs.y / Iyy, (Ixz * rhs.x + Ixx * rhs.z) / det};
    st_.omega += wdot * h;
    Quat dq = st_.att * Quat(0, st_.omega.x, st_.omega.y, st_.omega.z);
    st_.att.w += 0.5 * dq.w * h; st_.att.x += 0.5 * dq.x * h; st_.att.y += 0.5 * dq.y * h; st_.att.z += 0.5 * dq.z * h;
    st_.att.normalize();

    // --- state flags & events --------------------------------------------------------------
    bool onGround = contacts > 0;
    airborneTime_ = onGround ? 0.0 : airborneTime_ + h;
    // A lift-off is reported only after 1 s continuously airborne (filters take-off-roll hops).
    if (!flying_ && !onGround && airborneTime_ >= 1.0 && gsMs > 30) {
        flying_ = true;
        emit(SimEvent::LiftOff, gsMs);
        maxSinkSinceAir_ = 0;
        stoppedLatched_ = false;
    }
    if (onGround && gsMs < 0.5 && !stoppedLatched_) { emit(SimEvent::StoppedOnGround); stoppedLatched_ = true; }
    wasOnGround_ = onGround;
    fd_.weightOnWheels = onGround;
    fd_.noseOnGround = noseC;
    fd_.mainsOnGround = mainC;
    fd_.gearOnGround = contacts;
    fd_.nz = nz;
    fd_.alpha = alpha;
    fd_.beta = beta;
    fd_.qbar = qbar;
    fd_.thrustN = thrust;
    fd_.fuelFlowKgS = fuelFlow;
    fd_.onRunway = onRunway_;

    bool stall = !onGround && Vt > 20 && std::fabs(alpha) > P.alphaStall - 2 * kDeg2Rad;
    if (stall && !stallLatched_) { emit(SimEvent::Stall, alpha * kRad2Deg); stallLatched_ = true; }
    if (!stall && std::fabs(alpha) < P.alphaStall - 5 * kDeg2Rad) stallLatched_ = false;
    if (nz > P.maxG * 1.05 && !overstressLatched_) { emit(SimEvent::Overstress, nz); overstressLatched_ = true; }
    if (nz < P.maxG) overstressLatched_ = false;
    if (st_.fuelKg < 800 && !fuelLowLatched_) { emit(SimEvent::FuelLow, st_.fuelKg); fuelLowLatched_ = true; }
    if (st_.fuelKg < 450 && !bingoLatched_) { emit(SimEvent::FuelBingo, st_.fuelKg); bingoLatched_ = true; }
    if (st_.fuelKg <= 0 && thrust == 0 && coreTarget == 0 && st_.spool == 0) {}
}

void FlightModel::computeData() {
    const FlightProfile& P = prof_;
    GeoPoint g;
    if (ground_) g = ground_->frame().fromNed(st_.pos);
    else { g.altMslM = -st_.pos.z; }
    fd_.latDeg = g.latDeg; fd_.lonDeg = g.lonDeg; fd_.altMsl = g.altMslM;
    double phi, theta, psi;
    st_.att.toEuler(phi, theta, psi);
    fd_.rollDeg = phi * kRad2Deg; fd_.pitchDeg = theta * kRad2Deg; fd_.headingDeg = wrap360(psi * kRad2Deg);
    fd_.groundSpeed = std::sqrt(st_.vel.x * st_.vel.x + st_.vel.y * st_.vel.y);
    fd_.trackDeg = fd_.groundSpeed > 1 ? wrap360(std::atan2(st_.vel.y, st_.vel.x) * kRad2Deg) : fd_.headingDeg;
    fd_.vsMs = -st_.vel.z;
    AtmosphereSample atm = isaAt(fd_.altMsl, isaDev_);
    Vec3 vb = st_.att.inverseRotate(st_.vel - wind_);
    fd_.tas = vb.length();
    fd_.mach = fd_.tas / atm.speedOfSoundMs;
    fd_.cas = casFromTas(fd_.tas, atm);
    if (fd_.tas > 1) { fd_.alpha = std::atan2(vb.z, vb.x); fd_.beta = std::asin(clampd(vb.y / fd_.tas, -1, 1)); }
    fd_.massKg = massKg();
    if (ground_) {
        double gz;
        GroundSample gs = ground_->sampleNed(st_.pos, gz);
        groundZ_ = gz;
        fd_.groundDataReal = gs.realData;
        fd_.onRunway = gs.surface == SurfaceType::Runway;
    }
    fd_.agl = groundZ_ - st_.pos.z;
    double minH = 1e9;
    const Vec3 p0{st_.pos.x, st_.pos.y, groundZ_};
    for (auto& gc : P.gear) minH = std::min(minH, groundN_.dot(st_.pos + st_.att.rotate(gc.posM) - p0));
    fd_.wheelAgl = minH;
    fd_.rpmPct = st_.fuelKg > 0 ? 65 + 35 * st_.spool : 0;
    fd_.nozzlePct = st_.abLevel > 0 ? 40 + 60 * st_.abLevel : 20 * (1 - st_.spool);
    fd_.stallWarning = fd_.tas > 20 && !fd_.weightOnWheels && std::fabs(fd_.alpha) > P.aoaLimit * 0.92;
}

// ---- FlightControlSystem ------------------------------------------------------------------

SurfaceCommands FlightControlSystem::update(double dt, const ControlInputs& pilot, const FlightModel& fm) {
    const FlightData& fd = fm.data();
    const AircraftState& st = fm.state();
    const FlightProfile& P = fm.profile();
    SurfaceCommands out;
    bool beginner = mode_ == ControlMode::Beginner;
    double V = std::max(fd.tas, 30.0);
    double phi = fd.rollDeg * kDeg2Rad, theta = fd.pitchDeg * kDeg2Rad;
    double p = st.omega.x, q = st.omega.y, r = st.omega.z;
    double qbarEff = std::max(fd.qbar, 1500.0);
    double m = fm.massKg(), ms = m / P.inertiaRefMass;
    double Ixx = P.Ixx * ms, Iyy = P.Iyy * ms, Izz = P.Izz * ms;

    if (fd.weightOnWheels) {
        // Ground: direct control, nose-wheel steering on pedals.
        out.elevator = -clampd(pilot.pitch, -1, 1);
        out.aileron = clampd(-pilot.roll, -1, 1) * 0.5;
        out.rudder = -clampd(pilot.yaw, -1, 1);
        out.nosewheel = clampd(pilot.yaw, -1, 1);
        iq_ = 0; ip_ = 0; nzCmd_ = 1;
        return out;
    }

    // ---- pitch: load-factor command with AoA and g limiting (dynamic-inversion style)
    double nzMax = beginner ? 6.5 : P.maxG, nzMin = beginner ? -1.5 : P.minG;
    double nzBase = beginner ? std::cos(theta) / std::max(std::cos(phi), 0.5) : 1.0;
    double sp = clampd(pilot.pitch, -1, 1);
    double nzCmd = sp >= 0 ? nzBase + sp * (nzMax - nzBase) : nzBase + (-sp) * (nzMin - nzBase);
    nzCmd = clampd(nzCmd, nzMin, nzMax);
    nzCmd_ = nzCmd;
    double qCmd = kG0 * (nzCmd - std::cos(theta) * std::cos(phi)) / V + 0.6 * kG0 * (nzCmd - fd.nz) / V;
    double aLim = beginner ? 18 * kDeg2Rad : P.aoaLimit;
    qCmd = std::min(qCmd, 2.0 * (aLim - fd.alpha));
    qCmd = std::max(qCmd, 2.0 * (-10 * kDeg2Rad - fd.alpha));
    double qhCmd = qCmd * P.c / (2 * V);
    double deTrim = -(P.Cm0 + P.CmA * fd.alpha + P.CmQ * qhCmd) / P.CmDe;
    double eq = qCmd - q;
    iq_ = clampd(iq_ + eq * dt, -0.3, 0.3);
    double Mreq = Iyy * (eq / 0.25 + 1.5 * iq_);
    double de = deTrim + Mreq / (qbarEff * P.S * P.c * P.CmDe);
    out.elevator = clampd(de / P.maxDe, -1, 1);

    // ---- roll: rate command (advanced) or bank-angle command with auto wings-level (beginner)
    double pCmd;
    double sr = clampd(pilot.roll, -1, 1);
    if (beginner) {
        double phiCmd = sr * 60 * kDeg2Rad;
        pCmd = clampd(2.0 * (phiCmd - phi), -90 * kDeg2Rad, 90 * kDeg2Rad);
    } else {
        pCmd = sr * P.maxRollRate;
    }
    double phCmd = pCmd * P.b / (2 * V);
    double daFF = -P.ClP * phCmd / P.ClDa;
    double ep = pCmd - p;
    double Lreq = Ixx * ep / 0.15;
    double da = daFF + Lreq / (qbarEff * P.S * P.b * P.ClDa);
    out.aileron = clampd(da / P.maxDa, -1, 1);

    // ---- yaw: turn coordination + yaw damper + sideslip suppression + pedals
    double rCmd = kG0 * std::sin(phi) * std::cos(theta) / V + 1.5 * fd.beta + clampd(pilot.yaw, -1, 1) * 0.3;
    double Nreq = Izz * (rCmd - r) / 0.5;
    double dr = (Nreq / (qbarEff * P.S * P.b) - P.CnB * fd.beta * 0.5) / P.CnDr;
    out.rudder = clampd(dr / P.maxDr, -1, 1);
    out.nosewheel = 0;
    return out;
}

}  // namespace kanaf
