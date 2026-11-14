// WGS84 geodesy helpers. All angles in degrees at the API boundary unless suffixed Rad.
// Heights: "MSL" = above EGM2008 geoid (what the DEM and charts give). Ellipsoidal height is
// only used internally; geoid undulation over Israel is ~ +17..+21 m and is applied as a
// configurable constant per region (see GeoFrame::geoidUndulationM).
#pragma once
#include "Kanaf/MathTypes.h"

namespace kanaf {

struct GeoPoint {
    double latDeg = 0, lonDeg = 0, altMslM = 0;
};

namespace wgs84 {
constexpr double a = 6378137.0;
constexpr double f = 1.0 / 298.257223563;
constexpr double b = a * (1 - f);
constexpr double e2 = f * (2 - f);
}  // namespace wgs84

Vec3 geodeticToEcef(double latDeg, double lonDeg, double hEllM);
void ecefToGeodetic(const Vec3& ecef, double& latDeg, double& lonDeg, double& hEllM);

// Great-circle (haversine on mean radius) distance in metres and initial true bearing in degrees.
double greatCircleDistanceM(double lat1, double lon1, double lat2, double lon2);
double initialBearingDeg(double lat1, double lon1, double lat2, double lon2);
// Vincenty inverse on the WGS84 ellipsoid (accurate to ~mm). Returns false if not converged.
bool vincentyInverse(double lat1, double lon1, double lat2, double lon2, double& distM, double& az1Deg);

// Local tangent frame anchored at an origin. World simulation frame is NED (x north, y east,
// z down) in metres relative to the origin on the ellipsoid. The frame is exact (no flat-earth
// approximation in the conversions): points far from the origin are below the tangent plane.
class GeoFrame {
public:
    GeoFrame() = default;
    GeoFrame(double latDeg, double lonDeg, double originMslM, double geoidUndulationM);
    void reset(double latDeg, double lonDeg, double originMslM, double geoidUndulationM);

    Vec3 toNed(const GeoPoint& g) const;
    GeoPoint fromNed(const Vec3& ned) const;
    // Local "up" at a NED position (differs from -z away from origin due to earth curvature).
    Vec3 upAt(const Vec3& ned) const;

    double originLat() const { return lat0_; }
    double originLon() const { return lon0_; }
    double geoidUndulationM() const { return N_; }

private:
    double lat0_ = 0, lon0_ = 0, h0_ = 0, N_ = 0;
    Vec3 ecef0_;
    // rotation ECEF->NED rows
    Vec3 rN_, rE_, rD_;
};

}  // namespace kanaf
