// Kanaf core — engine-independent math types. No Unreal includes; compiled both by UBT and CMake.
#pragma once
#include <cmath>

namespace kanaf {

constexpr double kPi = 3.14159265358979323846;
constexpr double kDeg2Rad = kPi / 180.0;
constexpr double kRad2Deg = 180.0 / kPi;
constexpr double kG0 = 9.80665;          // standard gravity, m/s^2
constexpr double kFt2M = 0.3048;
constexpr double kKt2Ms = 0.514444;
constexpr double kNm2M = 1852.0;

struct Vec3 {
    double x = 0, y = 0, z = 0;
    Vec3() = default;
    Vec3(double ax, double ay, double az) : x(ax), y(ay), z(az) {}
    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator-() const { return {-x, -y, -z}; }
    Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
    Vec3 operator/(double s) const { return {x / s, y / s, z / s}; }
    Vec3& operator+=(const Vec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
    Vec3& operator-=(const Vec3& o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
    Vec3& operator*=(double s) { x *= s; y *= s; z *= s; return *this; }
    double dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }
    Vec3 cross(const Vec3& o) const { return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x}; }
    double length() const { return std::sqrt(x * x + y * y + z * z); }
    double lengthSq() const { return x * x + y * y + z * z; }
    Vec3 normalized() const { double l = length(); return l > 1e-12 ? *this / l : Vec3{}; }
};
inline Vec3 operator*(double s, const Vec3& v) { return v * s; }

// Unit quaternion representing rotation from body frame to world frame (q * v_body * q^-1 = v_world).
struct Quat {
    double w = 1, x = 0, y = 0, z = 0;
    Quat() = default;
    Quat(double aw, double ax, double ay, double az) : w(aw), x(ax), y(ay), z(az) {}
    Quat operator*(const Quat& b) const {
        return {w * b.w - x * b.x - y * b.y - z * b.z,
                w * b.x + x * b.w + y * b.z - z * b.y,
                w * b.y - x * b.z + y * b.w + z * b.x,
                w * b.z + x * b.y - y * b.x + z * b.w};
    }
    Quat conj() const { return {w, -x, -y, -z}; }
    void normalize() {
        double n = std::sqrt(w * w + x * x + y * y + z * z);
        if (n > 1e-12) { w /= n; x /= n; y /= n; z /= n; } else { w = 1; x = y = z = 0; }
    }
    Vec3 rotate(const Vec3& v) const {  // body -> world
        Quat p(0, v.x, v.y, v.z);
        Quat r = (*this) * p * conj();
        return {r.x, r.y, r.z};
    }
    Vec3 inverseRotate(const Vec3& v) const {  // world -> body
        Quat p(0, v.x, v.y, v.z);
        Quat r = conj() * p * (*this);
        return {r.x, r.y, r.z};
    }
    // Aerospace 3-2-1 Euler (yaw psi, pitch theta, roll phi), body frame x fwd / y right / z down,
    // world frame NED.
    static Quat fromEuler(double phi, double theta, double psi) {
        double cr = std::cos(phi / 2), sr = std::sin(phi / 2);
        double cp = std::cos(theta / 2), sp = std::sin(theta / 2);
        double cy = std::cos(psi / 2), sy = std::sin(psi / 2);
        return {cr * cp * cy + sr * sp * sy,
                sr * cp * cy - cr * sp * sy,
                cr * sp * cy + sr * cp * sy,
                cr * cp * sy - sr * sp * cy};
    }
    void toEuler(double& phi, double& theta, double& psi) const {
        phi = std::atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
        double s = 2 * (w * y - z * x);
        s = s > 1 ? 1 : (s < -1 ? -1 : s);
        theta = std::asin(s);
        psi = std::atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    }
};

inline double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline double lerpd(double a, double b, double t) { return a + (b - a) * t; }
inline double wrapPi(double a) {
    while (a > kPi) a -= 2 * kPi;
    while (a < -kPi) a += 2 * kPi;
    return a;
}
inline double wrap360(double a) {
    a = std::fmod(a, 360.0);
    return a < 0 ? a + 360.0 : a;
}
// Move value toward target by at most maxDelta.
inline double approach(double v, double target, double maxDelta) {
    if (v < target) return v + maxDelta > target ? target : v + maxDelta;
    return v - maxDelta < target ? target : v - maxDelta;
}

}  // namespace kanaf
