// Two speakers on a stage, pumping to the beat, with the KaraokeSync logo
// turning in the middle above a glowing ring, and light beams behind.
#include "lib/logo.glsl"
#include "lib/speaker.glsl"

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., s, 0., 1., 0., -s, 0., c); }

vec3 logoSpace(vec3 p) {
  p -= vec3(0., .25 + .1 * sin(LA * 2.), .3);
  p.xz *= rot(LA);
  return p / .75;
}

// (distance, what): 1 = left speaker, 2 = right speaker, 3 = logo tile, 4 = logo microphone
vec2 map(vec3 p, float pump) {
  float l = sdSpeaker(rotY(.45) * (p - vec3(-2.25, 0., .4)), pump);
  float r = sdSpeaker(rotY(-.45) * (p - vec3(2.25, 0., .4)), pump);
  vec2 lg = sdLogo(logoSpace(p));
  lg.x *= .75;
  vec2 res = l < r ? vec2(l, 1.) : vec2(r, 2.);
  if (lg.x < res.x) res = vec2(lg.x, 2. + lg.y);
  return res;
}

void main() {
  vec2 p = screen();
  float pump = beat();
  vec3 ro = vec3(.5 * sin(LA), .35, -4.6);
  vec3 rd = lookAt(ro, vec3(0., .05, 0.), p, 1.2, 0.);
  vec3 col = mix(vec3(.05, .015, .1), vec3(.004, .004, .015), smoothstep(-.5, 1., p.y));
  // light beams from the back, swinging (whole turns per loop)
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    vec2 o = vec2(-1.25 + k * .5, -.15);
    float a = 1.57 + .45 * sin(LA * (1. + mod(k, 2.)) + k * 1.3);
    vec2 dir = vec2(cos(a), sin(a)), v = p - o;
    float along = dot(v, dir), across = abs(dot(v, vec2(-dir.y, dir.x)));
    col += mix(LOGO_PURPLE, LOGO_BLUE, k / 5.) * .22 * smoothstep(.05 + along * .12, .0, across) * step(0., along) * exp(-along * .9) * (.6 + .4 * pump);
  }
  float t = 2.;
  vec2 h = vec2(1.);
  for (int i = 0; i < 120; i++) {
    h = map(ro + rd * t, pump);
    if (h.x < .001 || t > 14.) break;
    t += h.x;
  }
  float tf = rd.y < 0. ? (-SPK.y - ro.y) / rd.y : -1.;
  vec3 L = normalize(vec3(-.3, .8, -.6));
  if (t < 14. && (tf < 0. || t < tf)) {
    vec3 pos = ro + rd * t;
    vec2 e = vec2(.001, 0.);
    vec3 n = normalize(vec3(map(pos + e.xyy, pump).x - map(pos - e.xyy, pump).x, map(pos + e.yxy, pump).x - map(pos - e.yxy, pump).x,
                            map(pos + e.yyx, pump).x - map(pos - e.yyx, pump).x));
    if (h.y < 2.5) {
      mat3 R = h.y < 1.5 ? rotY(.45) : rotY(-.45);
      vec3 q = R * (pos - vec3(h.y < 1.5 ? -2.25 : 2.25, 0., .4));
      col = shadeSpeaker(q, R * n, R * rd, R * L, h.y < 1.5 ? LOGO_PURPLE : LOGO_BLUE, pump, vec3(.45, .3, .85));
    } else {
      vec3 lp = logoSpace(pos);
      vec3 base = h.y > 3.5 ? vec3(1.) : logoGradient(lp.xy);
      vec3 r = reflect(rd, n);
      float dif = .35 + .65 * max(dot(n, L), 0.);
      float fres = pow(1. - max(dot(-rd, n), 0.), 4.);
      col = base * base * dif * 1.6 + pow(max(dot(r, L), 0.), 50.) * 1.2 + mix(LOGO_PURPLE, LOGO_BLUE, .5 + .5 * r.x) * fres * .5;
    }
  } else if (tf > 0.) {
    vec3 fp = ro + rd * tf;
    float rr = length(fp.xz - vec2(0., .3));
    col = vec3(.012, .008, .024);
    col += mix(LOGO_PURPLE, LOGO_BLUE, .5 + .5 * sin(atan(fp.z - .3, fp.x) + LA)) * smoothstep(.04, .0, abs(rr - 1.1)) * (1. + 1.5 * pump);   // glowing ring
    col += LOGO_PURPLE * .18 * exp(-rr * .9) * (.6 + pump);
    col += LOGO_PURPLE * .3 * exp(-length(fp.xz - vec2(-2.25, -.1)) * 1.6) * pump + LOGO_BLUE * .3 * exp(-length(fp.xz - vec2(2.25, -.1)) * 1.6) * pump;
    col = mix(col, vec3(.01, .005, .02), smoothstep(5., 13., tf));
  }
  outColor = finish(col);
}
