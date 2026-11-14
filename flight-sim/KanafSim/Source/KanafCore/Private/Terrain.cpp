#include "Kanaf/Terrain.h"

#include <cstdio>

#include "Kanaf/Json.h"

namespace kanaf {

bool HeightGridProvider::loadFromMemory(const std::string& metaJson, const std::vector<unsigned char>& raw, std::string& error) {
    auto r = parseJson(metaJson);
    if (!r.ok) { error = "terrain meta JSON: " + r.error; return false; }
    const auto& m = r.value;
    W_ = int(m["width"].num()); H_ = int(m["height"].num());
    s_ = m["south"].num(); n_ = m["north"].num(); w_ = m["west"].num(); e_ = m["east"].num();
    hmin_ = m["heightMinMeters"].num(); hmax_ = m["heightMaxMeters"].num();
    attribution_ = m["attribution"].str();
    if (W_ < 2 || H_ < 2 || n_ <= s_ || e_ <= w_ || hmax_ <= hmin_) { error = "terrain meta invalid"; return false; }
    size_t need = size_t(W_) * size_t(H_) * 2;
    if (raw.size() != need) {
        error = "terrain raw size mismatch: got " + std::to_string(raw.size()) + " expected " + std::to_string(need);
        return false;
    }
    data_.resize(size_t(W_) * H_);
    for (size_t i = 0; i < data_.size(); ++i) data_[i] = (unsigned short)(raw[2 * i] | (raw[2 * i + 1] << 8));
    return true;
}

bool HeightGridProvider::load(const std::string& base, std::string& error) {
    std::string meta;
    if (!readTextFile(base + ".json", meta)) { error = "cannot read " + base + ".json"; return false; }
    std::string rawS;
    if (!readTextFile(base + ".r16", rawS)) { error = "cannot read " + base + ".r16"; return false; }
    std::vector<unsigned char> raw(rawS.begin(), rawS.end());
    return loadFromMemory(meta, raw, error);
}

bool HeightGridProvider::covers(double lat, double lon) const {
    return !data_.empty() && lat >= s_ && lat <= n_ && lon >= w_ && lon <= e_;
}

double HeightGridProvider::heightMsl(double lat, double lon) const {
    if (data_.empty()) return 0;
    double fr = (n_ - lat) / (n_ - s_) * (H_ - 1);
    double fc = (lon - w_) / (e_ - w_) * (W_ - 1);
    fr = clampd(fr, 0, H_ - 1.000001);
    fc = clampd(fc, 0, W_ - 1.000001);
    int r = int(fr), c = int(fc);
    double tr = fr - r, tc = fc - c;
    auto at = [&](int rr, int cc) { return double(data_[size_t(rr) * W_ + cc]); };
    double v = at(r, c) * (1 - tr) * (1 - tc) + at(r, c + 1) * (1 - tr) * tc + at(r + 1, c) * tr * (1 - tc) + at(r + 1, c + 1) * tr * tc;
    return hmin_ + v / 65535.0 * (hmax_ - hmin_);
}

void GroundModel::addRunway(const RunwaySurface& r) {
    RW rw;
    rw.r = r;
    GeoPoint a = r.endA, b = r.endB;
    rw.a = frame_.toNed(a);
    rw.b = frame_.toNed(b);
    Vec3 d = rw.b - rw.a;
    d.z = 0;
    rw.len = d.length();
    rw.dir = d.normalized();
    runways_.push_back(rw);
}

const GroundModel::RW* GroundModel::runwayAt(const Vec3& p) const {
    for (auto& rw : runways_) {
        Vec3 rel = p - rw.a;
        rel.z = 0;
        double along = rel.dot(rw.dir);
        Vec3 lateralV = rel - rw.dir * along;
        double lat = lateralV.length();
        // Include a 60 m overrun/stopway each end and 15 m shoulders: paved for physics.
        if (along >= -60 && along <= rw.len + 60 && lat <= rw.r.widthM * 0.5 + 15) return &rw;
    }
    return nullptr;
}

bool GroundModel::usingFallback(double lat, double lon) const {
    return !(primary_ && primary_->covers(lat, lon));
}

GroundSample GroundModel::sampleGeo(double lat, double lon) const {
    GroundSample g;
    if (primary_ && primary_->covers(lat, lon)) {
        g.heightMslM = primary_->heightMsl(lat, lon);
        g.realData = primary_->isRealData();
    } else if (fallback_) {
        g.heightMslM = fallback_->heightMsl(lat, lon);
        g.realData = fallback_->isRealData();
    }
    Vec3 p = frame_.toNed({lat, lon, 0});
    if (const RW* rw = runwayAt(p)) {
        Vec3 rel = p - rw->a;
        rel.z = 0;
        double t = clampd(rel.dot(rw->dir) / (rw->len > 1 ? rw->len : 1), 0, 1);
        g.heightMslM = lerpd(rw->r.endA.altMslM, rw->r.endB.altMslM, t);
        g.surface = SurfaceType::Runway;
    }
    return g;
}

GroundSample GroundModel::sampleNed(const Vec3& ned, double& groundZ) const {
    GeoPoint gp = frame_.fromNed(ned);
    GroundSample g = sampleGeo(gp.latDeg, gp.lonDeg);
    // Ground point in NED (exact, includes curvature drop)
    Vec3 gn = frame_.toNed({gp.latDeg, gp.lonDeg, g.heightMslM});
    // gn shares the query's geodetic column; its horizontal NED offset from the query point is
    // negligible (alt difference x sin(frame tilt)), so its z is the ground's z under the point.
    groundZ = gn.z;
    // Finite-difference normal from DEM (2 m step equivalent in degrees).
    if (g.surface == SurfaceType::Runway) {
        g.normalNed = frame_.upAt(ned);  // local vertical (points up: negative z)
    } else {
        double dLat = 15.0 / 111132.0, dLon = 15.0 / (111320.0 * std::cos(gp.latDeg * kDeg2Rad));
        double hn = sampleGeo(gp.latDeg + dLat, gp.lonDeg).heightMslM;
        double hs = sampleGeo(gp.latDeg - dLat, gp.lonDeg).heightMslM;
        double he = sampleGeo(gp.latDeg, gp.lonDeg + dLon).heightMslM;
        double hw = sampleGeo(gp.latDeg, gp.lonDeg - dLon).heightMslM;
        Vec3 tN{30.0, 0, -(hn - hs)};
        Vec3 tE{0, 30.0, -(he - hw)};
        Vec3 n = tN.cross(tE).normalized();
        if (n.z > 0) n = -n;  // the surface normal points up, i.e. negative z in NED
        g.normalNed = n;
    }
    return g;
}

double GroundModel::aglM(const Vec3& ned) const {
    double gz;
    sampleNed(ned, gz);
    return gz - ned.z;
}

}  // namespace kanaf
