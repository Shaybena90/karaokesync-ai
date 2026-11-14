// Terrain/elevation provider layer. Providers are interchangeable: a regional height grid
// (Copernicus DEM), a flat fallback, and — in Unreal — an optional Cesium/Google 3D Tiles
// provider that renders imagery/meshes while physics still queries this layer.
#pragma once
#include <string>
#include <vector>

#include "Kanaf/Geo.h"

namespace kanaf {

enum class SurfaceType { Terrain, Runway, Taxiway, Water };

struct GroundSample {
    double heightMslM = 0;
    Vec3 normalNed{0, 0, -1};
    SurfaceType surface = SurfaceType::Terrain;
    bool realData = false;  // true = measured elevation data, false = fallback/artistic
};

class IElevationProvider {
public:
    virtual ~IElevationProvider() = default;
    virtual bool covers(double latDeg, double lonDeg) const = 0;
    virtual double heightMsl(double latDeg, double lonDeg) const = 0;
    virtual bool isRealData() const = 0;
    virtual const char* name() const = 0;
};

// Regular lat/lon uint16 grid (see tools/build_terrain.py for the exact format).
class HeightGridProvider : public IElevationProvider {
public:
    // Loads <basePath>.json + <basePath>.r16. On failure returns false and fills error.
    bool load(const std::string& basePath, std::string& error);
    // Load from memory (used by Unreal, which reads files via its own file system).
    bool loadFromMemory(const std::string& metaJson, const std::vector<unsigned char>& raw16, std::string& error);

    bool covers(double lat, double lon) const override;
    double heightMsl(double lat, double lon) const override;
    bool isRealData() const override { return true; }
    const char* name() const override { return "CopernicusDEM-GLO30-grid"; }

    double south() const { return s_; }
    double north() const { return n_; }
    double west() const { return w_; }
    double east() const { return e_; }
    int width() const { return W_; }
    int height() const { return H_; }
    const std::string& attribution() const { return attribution_; }

private:
    int W_ = 0, H_ = 0;
    double s_ = 0, n_ = 0, w_ = 0, e_ = 0, hmin_ = 0, hmax_ = 0;
    std::vector<unsigned short> data_;
    std::string attribution_;
};

class FlatProvider : public IElevationProvider {
public:
    explicit FlatProvider(double h = 0) : h_(h) {}
    bool covers(double, double) const override { return true; }
    double heightMsl(double, double) const override { return h_; }
    bool isRealData() const override { return false; }
    const char* name() const override { return "flat-fallback"; }
    void setHeight(double h) { h_ = h; }

private:
    double h_;
};

// A runway as a flat-ish rectangle between two thresholds with linearly varying elevation.
struct RunwaySurface {
    std::string id;           // e.g. "07R/25L"
    GeoPoint endA, endB;      // threshold centres, MSL elevations
    double widthM = 45;
};

// Combines providers + runway overrides and answers physics ground queries in the NED frame.
class GroundModel {
public:
    void setFrame(const GeoFrame& f) { frame_ = f; }
    const GeoFrame& frame() const { return frame_; }
    void setPrimary(const IElevationProvider* p) { primary_ = p; }
    void setFallback(const IElevationProvider* p) { fallback_ = p; }
    void addRunway(const RunwaySurface& r);
    void clearRunways() { runways_.clear(); }

    // Height (MSL) of the surface under a lat/lon, including runway flattening.
    GroundSample sampleGeo(double latDeg, double lonDeg) const;
    // Height of the ground expressed as NED z (down) directly below a NED point, plus normal.
    // Accounts for earth curvature via the GeoFrame.
    GroundSample sampleNed(const Vec3& ned, double& groundZNed) const;
    // Height above ground level for a NED position.
    double aglM(const Vec3& ned) const;

    bool usingFallback(double latDeg, double lonDeg) const;

private:
    struct RW { RunwaySurface r; Vec3 a, b; double len; Vec3 dir; };
    const RW* runwayAt(const Vec3& nedFlat) const;
    GeoFrame frame_;
    const IElevationProvider* primary_ = nullptr;
    const IElevationProvider* fallback_ = nullptr;
    std::vector<RW> runways_;
};

}  // namespace kanaf
