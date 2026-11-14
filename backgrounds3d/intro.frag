// @seconds 8
// @out intro
// @sizes intro=1280x720 intro-9x16=720x1280 intro-1x1=720x720
// @text Karaoke Sync
// @font ../server/fonts/Rubik.ttf
// @audio audio/intro.lavfi
//
// Opening clip: the KaraokeSync logo flies in turning and lands with a ring of
// light, then the words "Karaoke Sync" rise in chrome 3D letters, one after
// the other, a light sweeps across them, and the camera slowly comes closer.
// Not a loop: 8 seconds, then the video goes on (a transition).
#include "lib/logo.glsl"
uniform sampler2D uText;

const float TXW = 2.4, TXH = .6;        // the text map covers x -2.4..2.4, y -.6...6
const vec3 LOGO_POS = vec3(0., .78, 0.);
const float LOGO_SIZE = .72;
const float TEXT_Y = -.62;

float ease(float x) { x = clamp(x, 0., 1.); return 1. - pow(1. - x, 3.); }
float landT() { return ease(uTime / 1.8); }

// how far each part of the text has risen: letters come up one after another, left to right
float rise(float x) { return ease((uTime - 2. - (x + TXW) / (2. * TXW) * 1.1) / .7); }

float textSdf2(vec2 p) {
  vec2 uv = vec2(p.x / (2. * TXW) + .5, .5 - p.y / (2. * TXH));
  vec2 out_ = max(abs(p) - vec2(TXW, TXH), 0.);
  float d = texture(uText, clamp(uv, 0., 1.)).r * (2. * TXW / 2048.);
  return length(out_) > 0. ? length(out_) + .05 : d;
}

vec3 logoLocal(vec3 p) {
  float k = landT();
  vec3 pos = LOGO_POS + vec3(0., 0., (1. - k) * 16.) + vec3(0., .05 * sin(uTime * 1.3) * step(1.8, uTime), 0.);
  p -= pos;
  p.xz *= rot((1. - k) * 3. * PI + .18 * sin(uTime * .8) * smoothstep(1.8, 3., uTime));
  p.xy *= rot((1. - k) * .6);
  return p / LOGO_SIZE;
}

vec3 textLocal(vec3 p) {
  p.y -= TEXT_Y;
  p.yz *= rot(-.28);             // leaning back a little: the tops of the letters show their depth
  float r = rise(p.x);
  p.y += (1. - r) * .9;          // comes up from below
  p.z -= (1. - r) * .6;
  return p;
}

// (distance, material): 1 tile, 2 microphone, 3 text
vec2 map(vec3 p) {
  vec2 lg = sdLogo(logoLocal(p));
  lg.x *= LOGO_SIZE * .8;
  vec3 q = textLocal(p);
  float d2 = textSdf2(q.xy);
  vec2 w = vec2(d2 + .015, abs(q.z) - .17);
  float txt = (min(max(w.x, w.y), 0.) + length(max(w, 0.)) - .015) * .7;
  txt += (1. - smoothstep(.0, .25, rise(q.x))) * 1.5;   // not there yet
  return txt < lg.x ? vec2(txt, 3.) : lg;
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.0015, 0.);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

vec3 backdrop(vec3 rd) {
  vec3 c = mix(vec3(.035, .012, .08), vec3(.002, .003, .015), smoothstep(-.2, .8, rd.y));
  c += LOGO_PURPLE * .16 * exp(-length(rd.xy - vec2(0., .12)) * 4.) * smoothstep(1., 2.5, uTime);
  return c;
}

vec3 env(vec3 r) {
  vec3 c = backdrop(r);
  c += vec3(1., .4, .8) * 3. * smoothstep(.4, .0, length(r - normalize(vec3(-.9, .4, -.3))));
  c += vec3(.3, .7, 1.) * 3. * smoothstep(.4, .0, length(r - normalize(vec3(.9, .3, -.3))));
  c += vec3(1.) * 5. * smoothstep(.35, .0, length(r - normalize(vec3(.1, 1., -.5))));
  return c;
}

vec3 shade(vec3 ro, vec3 rd, float t, float mat) {
  vec3 pos = ro + rd * t, n = normal(pos), r = reflect(rd, n);
  vec3 L = normalize(vec3(-.4, .8, -.6));
  float dif = .35 + .65 * max(dot(n, L), 0.);
  float spec = pow(max(dot(r, L), 0.), 60.);
  float fres = pow(1. - max(dot(-rd, n), 0.), 4.);
  if (mat < 2.5) {
    vec3 lp = logoLocal(pos);
    vec3 base = mat > 1.5 ? vec3(1.) : logoGradient(lp.xy);
    return base * base * dif * 1.6 + env(r) * mix(.03, .35, fres) + spec * 1.2;
  }
  // chrome letters tinted with the logo colours, a brighter front face, and a light sweep
  vec3 q = textLocal(pos);
  vec3 tint = mix(LOGO_PURPLE, LOGO_BLUE, clamp(.5 + q.x / (2. * TXW) - q.y * .3, 0., 1.));
  vec3 nl = n;
  nl.yz *= rot(.28);
  float front = smoothstep(.5, .9, -nl.z);
  vec3 face = mix(vec3(1.), tint, .45) * (.75 + .5 * dif) + env(r) * .25 + spec * 1.5;     // bright chrome front
  vec3 side = tint * tint * (.12 + .5 * dif) + env(r) * tint * .3 * fres;                  // deep coloured sides
  vec3 col = mix(side, face, front);
  float sweep = exp(-pow((q.x - mix(-3.2, 3.2, (uTime - 4.) / 1.6)) / .25, 2.)) * step(4., uTime) * step(uTime, 5.8);
  col += vec3(1.) * sweep * (1.2 + front);
  return col;
}

float march(vec3 ro, vec3 rd, out float mat) {
  float t = .5;
  mat = 0.;
  for (int i = 0; i < 120; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < .001) { mat = h.y; return t; }
    t += h.x;
    if (t > 30.) break;
  }
  return -1.;
}

void main() {
  vec2 p = screen();
  float aspect = uRes.x / uRes.y;
  float zoom = min(2.75, aspect * 2.15);                 // the words always fit the width
  float push = ease(uTime / 8.);
  vec3 ro = vec3(.35 * sin(uTime * .4), .25, -6.2 + push * .7);
  vec3 rd = lookAt(ro, vec3(0., .1, 0.), p, zoom, 0.);
  vec3 col = backdrop(rd);
  // stars streaming past at the start, slowing down
  for (int l = 0; l < 3; l++) {
    vec2 g = p * (6. + 4. * float(l)) + vec2(float(l) * 3.7, 0.);
    vec2 id = floor(g);
    vec3 h = hash32(id + float(l) * 7.);
    float tw = .5 + .5 * sin(uTime * 3. + h.x * 6.28);
    col += mix(LOGO_PURPLE, vec3(1.), h.y) * step(.93, h.z) * smoothstep(.12, .0, length(fract(g) - .5 - (h.xy - .5) * .6)) * tw * .5;
  }
  // the ring of light when the logo lands
  float since = uTime - 1.8;
  if (since > 0.) {
    vec2 lc = vec2(0., .2);
    float rad = since * 1.6;
    col += mix(LOGO_PURPLE, LOGO_BLUE, .5) * exp(-pow((length((p - lc) * vec2(1., 1.6)) - rad) / .03, 2.)) * exp(-since * 1.5) * 2.;
    col += vec3(1., .9, 1.) * exp(-since * 6.) * .5 * exp(-length(p - lc) * 2.);   // flash
  }
  float mat;
  float t = march(ro, rd, mat);
  float tf = rd.y < 0. ? (-1.35 - ro.y) / rd.y : -1.;
  if (t > 0. && (tf < 0. || t < tf)) {
    col = shade(ro, rd, t, mat);
  } else if (tf > 0.) {
    vec3 fp = ro + rd * tf, rr = reflect(rd, vec3(0., 1., 0.));
    float m2;
    float t2 = march(fp, rr, m2);
    vec3 refl = t2 > 0. ? shade(fp, rr, t2, m2) : backdrop(rr);
    col = mix(backdrop(rd), vec3(.008, .006, .016) + refl * .4, exp(-.02 * tf * tf));
    col += LOGO_PURPLE * .12 * exp(-length(fp.xz) * .8);
  }
  col *= smoothstep(.0, .5, uTime);    // fade in from black
  outColor = finish(col);
}
