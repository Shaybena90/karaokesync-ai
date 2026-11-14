// International Standard Atmosphere (ISA, ICAO Doc 7488) up to 20 km, with temperature offset.
#pragma once

namespace kanaf {

struct AtmosphereSample {
    double temperatureK = 288.15;
    double pressurePa = 101325.0;
    double densityKgM3 = 1.225;
    double speedOfSoundMs = 340.294;
};

AtmosphereSample isaAt(double geopotentialAltM, double isaDeviationK = 0.0);
constexpr double kRho0 = 1.225;
// Calibrated airspeed from true airspeed (subsonic compressible formula, valid to M~1).
double casFromTas(double tasMs, const AtmosphereSample& a);

}  // namespace kanaf
