// A 3D equalizer: rings of glowing bars jumping to the music around the
// KaraokeSync logo, which turns above a mirror-black floor.
#include "lib/logo.glsl"

const float CELL = .42;

float level(vec2 id) {   // how high a bar is now (whole beats per loop)
  float r = length(id);
  float a = atan(id.y, id.x);
  float b = exp(-fract(PHASE * 20.) * 4.);
  float wave = .5 + .5 * sin(r * .9 - LA * 6. + sin(a * 3. + LA) * 1.5);
  float jitter = .5 + .5 * sin(hash21(id) * 40. + LA * floor(1. + 3. * hash21(id + 3.)));
  return .08 + 1.5 * pow(wave, 3.) * (.5 + .5 * b) * (.6 + .4 * jitter) * smoothstep(10., 4., r);
}

vec3 logoSpace(vec3 p) {
  p -= vec3(0., 1.55 + .12 * sin(LA * 2.), 0.);
  p.xz *= rot(LA);
  return p / .8;
}

// (distance, what): 0 = bar, 1/2 = logo tile/microphone
vec2 map(vec3 p) {
  vec2 id = floor(p.xz / CELL + .5);
  vec2 res = vec2(1e3, 0.);
  if (length(id) > 3.5 && length(id) < 18.) {
    vec2 q = p.xz - id * CELL;
    float h = level(id);
    vec3 b = abs(vec3(q.x, p.y - h * .5, q.y)) - vec3(CELL * .36, h * .5, CELL * .36);
    res.x = length(max(b, 0.)) + min(max(b.x, max(b.y, b.z)), 0.);
  }
  res.x = min(res.x, CELL * .5);   // never step past a neighbour bar
  vec2 lg = sdLogo(logoSpace(p));
  lg.x *= .8;
  if (lg.x < res.x) res = lg;
  return res;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 2.3, -5.6);
  ro.xz *= rot(.35 * sin(LA));
  vec3 rd = lookAt(ro, vec3(0., 1.15, 0.), p, 1.45, 0.);
  vec3 col = mix(vec3(.07, .02, .14), vec3(.005, .005, .02), smoothstep(-.3, .9, p.y));
  float t = 1.;
  vec2 h = vec2(1.);
  for (int i = 0; i < 140; i++) {
    vec3 q = ro + rd * t;
    if (q.y < 0.) break;
    h = map(q);
    if (h.x < .002 || t > 22.) break;
    t += h.x;
  }
  vec3 pos = ro + rd * t;
  vec3 L = normalize(vec3(-.4, .9, -.5));
  if (t < 22. && pos.y >= 0. && h.x < .01) {
    vec2 e = vec2(.002, 0.);
    vec3 n = normalize(vec3(map(pos + e.xyy).x - map(pos - e.xyy).x, map(pos + e.yxy).x - map(pos - e.yxy).x, map(pos + e.yyx).x - map(pos - e.yyx).x));
    if (h.y < .5) {
      vec2 id = floor(pos.xz / CELL + .5);
      float hgt = level(id);
      vec3 c = mix(LOGO_BLUE, LOGO_PURPLE, smoothstep(.0, 1.4, pos.y));
      c = mix(c, vec3(1., .5, .9), smoothstep(1.1, 1.5, pos.y));
      float top = smoothstep(.02, .0, abs(pos.y - hgt));
      float side = pos.y / max(hgt, .2);
      float loud = smoothstep(.1, 1.3, hgt);                 // quiet bars stay dark, loud ones glow
      col = c * (.03 + .3 * side * side * loud) * (.5 + .5 * max(dot(n, L), 0.))
          + c * c * (top + .6 * smoothstep(.0, .5, n.y)) * (.012 + 1.1 * loud);
      col = mix(col, vec3(.05, .02, .1), smoothstep(8., 20., t));
    } else {
      vec3 lp = logoSpace(pos);
      vec3 base = h.y > 1.5 ? vec3(1.) : logoGradient(lp.xy);
      vec3 r = reflect(rd, n);
      col = base * base * (.35 + .65 * max(dot(n, L), 0.)) * 1.6 + pow(max(dot(r, L), 0.), 50.) * 1.2
          + mix(LOGO_PURPLE, LOGO_BLUE, .5 + .5 * r.x) * pow(1. - max(dot(-rd, n), 0.), 4.) * .6;
    }
  } else if (rd.y < 0.) {
    // the black mirror floor: the bars' glow and a ring of light under the logo
    float tf = -ro.y / rd.y;
    vec3 fp = ro + rd * tf;
    vec2 id = floor(fp.xz / CELL + .5);
    float r = length(fp.xz);
    col = vec3(.006, .004, .012);
    if (length(id) > 3.5) col += mix(LOGO_BLUE, LOGO_PURPLE, .5) * .12 * level(id) * exp(-length(fp.xz - id * CELL) * 8.);
    col += mix(LOGO_PURPLE, LOGO_BLUE, .5 + .5 * sin(atan(fp.z, fp.x) * 2. + LA)) * smoothstep(.05, .0, abs(r - 1.2)) * 1.5;
    col += LOGO_PURPLE * .25 * exp(-r * 1.2);
    col = mix(col, vec3(.02, .008, .04), smoothstep(8., 20., tf));
  }
  outColor = finish(col);
}
