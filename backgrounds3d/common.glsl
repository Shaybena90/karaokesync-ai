// Shared by every 3D background (prepended by web/scripts/render-3d-backgrounds.mjs).
// A scene is a pure function of uTime and loops exactly every LOOP seconds:
// time is only used through whole turns (LA = one turn per loop) or through
// movements that cover a whole number of repeating cells per loop.
uniform float uTime;
uniform vec2 uRes;
out vec4 outColor;

#define LOOP 10.0
#define PI 3.14159265359
#define TAU 6.28318530718
#define LA (TAU * uTime / LOOP)
#define PHASE (uTime / LOOP)

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec3 hash33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }

// Value noise that repeats every `period` cells along x and y (period > 0).
float tnoise(vec2 p, vec2 period) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  float a = hash21(mod(i, period)), b = hash21(mod(i + vec2(1, 0), period));
  float c = hash21(mod(i + vec2(0, 1), period)), d = hash21(mod(i + vec2(1, 1), period));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float noise(vec2 p) { return tnoise(p, vec2(1e4)); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float tfbm(vec2 p, vec2 period) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * tnoise(p, period); p *= 2.; period *= 2.; a *= .5; } return s; }

vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(TAU * (c * t + d)); }

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

// Tone mapping, gamma, a soft vignette and a tiny dither (no banding in dark gradients).
vec4 finish(vec3 col) {
  vec2 q = gl_FragCoord.xy / uRes;
  col *= .55 + .45 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .18);
  col = pow(aces(col), vec3(1. / 2.2));
  col += (hash21(gl_FragCoord.xy) - .5) / 255.;
  return vec4(col, 1.);
}

// Screen position: y from -1 (bottom) to 1 (top), x scaled by the aspect.
vec2 screen() { return (2. * gl_FragCoord.xy - uRes) / uRes.y; }

// Camera ray towards `ta` from `ro`.
vec3 lookAt(vec3 ro, vec3 ta, vec2 p, float zoom, float roll) {
  vec3 f = normalize(ta - ro);
  vec3 r = normalize(cross(vec3(sin(roll), cos(roll), 0.), f));
  vec3 u = cross(f, r);
  return normalize(p.x * r + p.y * u + zoom * f);
}
