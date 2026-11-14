#include "Kanaf/Atmosphere.h"

#include <cmath>

namespace kanaf {

AtmosphereSample isaAt(double h, double dT) {
    const double g = 9.80665, R = 287.05287, T0 = 288.15, P0 = 101325.0, L = -0.0065;
    AtmosphereSample s;
    if (h < -1000) h = -1000;
    if (h <= 11000) {
        double T = T0 + L * h;
        s.pressurePa = P0 * std::pow(T / T0, -g / (L * R));
        s.temperatureK = T + dT;
    } else {
        double T11 = T0 + L * 11000;
        double P11 = P0 * std::pow(T11 / T0, -g / (L * R));
        double hh = h > 20000 ? 20000 : h;
        s.pressurePa = P11 * std::exp(-g * (hh - 11000) / (R * T11));
        s.temperatureK = T11 + dT;
    }
    s.densityKgM3 = s.pressurePa / (R * s.temperatureK);
    s.speedOfSoundMs = std::sqrt(1.4 * R * s.temperatureK);
    return s;
}

double casFromTas(double tas, const AtmosphereSample& a) {
    const double P0 = 101325.0, a0 = 340.294;
    double M = tas / a.speedOfSoundMs;
    if (M > 0.999) M = 0.999;
    double qc = a.pressurePa * (std::pow(1 + 0.2 * M * M, 3.5) - 1);
    return a0 * std::sqrt(5 * (std::pow(qc / P0 + 1, 2.0 / 7.0) - 1));
}

}  // namespace kanaf
