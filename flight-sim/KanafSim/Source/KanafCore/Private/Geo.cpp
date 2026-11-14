#include "Kanaf/Geo.h"

namespace kanaf {

Vec3 geodeticToEcef(double latDeg, double lonDeg, double h) {
    double lat = latDeg * kDeg2Rad, lon = lonDeg * kDeg2Rad;
    double s = std::sin(lat), c = std::cos(lat);
    double N = wgs84::a / std::sqrt(1 - wgs84::e2 * s * s);
    return {(N + h) * c * std::cos(lon), (N + h) * c * std::sin(lon), (N * (1 - wgs84::e2) + h) * s};
}

void ecefToGeodetic(const Vec3& e, double& latDeg, double& lonDeg, double& h) {
    // Bowring's method with two refinements — sub-millimetre for terrestrial heights.
    double p = std::sqrt(e.x * e.x + e.y * e.y);
    double lon = std::atan2(e.y, e.x);
    double ep2 = (wgs84::a * wgs84::a - wgs84::b * wgs84::b) / (wgs84::b * wgs84::b);
    double th = std::atan2(e.z * wgs84::a, p * wgs84::b);
    double lat = std::atan2(e.z + ep2 * wgs84::b * std::pow(std::sin(th), 3),
                            p - wgs84::e2 * wgs84::a * std::pow(std::cos(th), 3));
    for (int i = 0; i < 2; ++i) {
        double s = std::sin(lat);
        double N = wgs84::a / std::sqrt(1 - wgs84::e2 * s * s);
        h = p / std::cos(lat) - N;
        lat = std::atan2(e.z, p * (1 - wgs84::e2 * N / (N + h)));
    }
    double s = std::sin(lat);
    double N = wgs84::a / std::sqrt(1 - wgs84::e2 * s * s);
    h = p / std::cos(lat) - N;
    latDeg = lat * kRad2Deg;
    lonDeg = lon * kRad2Deg;
}

double greatCircleDistanceM(double lat1, double lon1, double lat2, double lon2) {
    const double R = 6371008.8;
    double p1 = lat1 * kDeg2Rad, p2 = lat2 * kDeg2Rad;
    double dp = p2 - p1, dl = (lon2 - lon1) * kDeg2Rad;
    double h = std::sin(dp / 2) * std::sin(dp / 2) + std::cos(p1) * std::cos(p2) * std::sin(dl / 2) * std::sin(dl / 2);
    return 2 * R * std::asin(std::sqrt(h));
}

double initialBearingDeg(double lat1, double lon1, double lat2, double lon2) {
    double p1 = lat1 * kDeg2Rad, p2 = lat2 * kDeg2Rad, dl = (lon2 - lon1) * kDeg2Rad;
    double y = std::sin(dl) * std::cos(p2);
    double x = std::cos(p1) * std::sin(p2) - std::sin(p1) * std::cos(p2) * std::cos(dl);
    return wrap360(std::atan2(y, x) * kRad2Deg);
}

bool vincentyInverse(double lat1, double lon1, double lat2, double lon2, double& dist, double& az1) {
    using namespace wgs84;
    double L = (lon2 - lon1) * kDeg2Rad;
    double U1 = std::atan((1 - f) * std::tan(lat1 * kDeg2Rad));
    double U2 = std::atan((1 - f) * std::tan(lat2 * kDeg2Rad));
    double sU1 = std::sin(U1), cU1 = std::cos(U1), sU2 = std::sin(U2), cU2 = std::cos(U2);
    double lam = L, lamP;
    double sSig = 0, cSig = 0, sig = 0, cos2A = 0, cos2SigM = 0;
    int iter = 100;
    do {
        double sL = std::sin(lam), cL = std::cos(lam);
        sSig = std::sqrt((cU2 * sL) * (cU2 * sL) + (cU1 * sU2 - sU1 * cU2 * cL) * (cU1 * sU2 - sU1 * cU2 * cL));
        if (sSig == 0) { dist = 0; az1 = 0; return true; }
        cSig = sU1 * sU2 + cU1 * cU2 * cL;
        sig = std::atan2(sSig, cSig);
        double sA = cU1 * cU2 * sL / sSig;
        cos2A = 1 - sA * sA;
        cos2SigM = cos2A != 0 ? cSig - 2 * sU1 * sU2 / cos2A : 0;
        double C = f / 16 * cos2A * (4 + f * (4 - 3 * cos2A));
        lamP = lam;
        lam = L + (1 - C) * f * sA * (sig + C * sSig * (cos2SigM + C * cSig * (-1 + 2 * cos2SigM * cos2SigM)));
    } while (std::fabs(lam - lamP) > 1e-12 && --iter > 0);
    if (iter == 0) return false;
    double u2 = cos2A * (a * a - b * b) / (b * b);
    double A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    double B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    double dSig = B * sSig * (cos2SigM + B / 4 * (cSig * (-1 + 2 * cos2SigM * cos2SigM) -
                  B / 6 * cos2SigM * (-3 + 4 * sSig * sSig) * (-3 + 4 * cos2SigM * cos2SigM)));
    dist = b * A * (sig - dSig);
    az1 = wrap360(std::atan2(cU2 * std::sin(lam), cU1 * sU2 - sU1 * cU2 * std::cos(lam)) * kRad2Deg);
    return true;
}

GeoFrame::GeoFrame(double lat, double lon, double msl, double N) { reset(lat, lon, msl, N); }

void GeoFrame::reset(double lat, double lon, double msl, double N) {
    lat0_ = lat; lon0_ = lon; N_ = N; h0_ = msl + N;
    ecef0_ = geodeticToEcef(lat, lon, h0_);
    double sl = std::sin(lat * kDeg2Rad), cl = std::cos(lat * kDeg2Rad);
    double so = std::sin(lon * kDeg2Rad), co = std::cos(lon * kDeg2Rad);
    rN_ = {-sl * co, -sl * so, cl};
    rE_ = {-so, co, 0};
    rD_ = {-cl * co, -cl * so, -sl};
}

Vec3 GeoFrame::toNed(const GeoPoint& g) const {
    Vec3 d = geodeticToEcef(g.latDeg, g.lonDeg, g.altMslM + N_) - ecef0_;
    return {rN_.dot(d), rE_.dot(d), rD_.dot(d)};
}

GeoPoint GeoFrame::fromNed(const Vec3& n) const {
    Vec3 e = ecef0_ + rN_ * n.x + rE_ * n.y + rD_ * n.z;
    GeoPoint g;
    double h;
    ecefToGeodetic(e, g.latDeg, g.lonDeg, h);
    g.altMslM = h - N_;
    return g;
}

Vec3 GeoFrame::upAt(const Vec3& ned) const {
    GeoPoint g = fromNed(ned);
    double sl = std::sin(g.latDeg * kDeg2Rad), cl = std::cos(g.latDeg * kDeg2Rad);
    double so = std::sin(g.lonDeg * kDeg2Rad), co = std::cos(g.lonDeg * kDeg2Rad);
    Vec3 upEcef{cl * co, cl * so, sl};
    return {rN_.dot(upEcef), rE_.dot(upEcef), rD_.dot(upEcef)};
}

}  // namespace kanaf
