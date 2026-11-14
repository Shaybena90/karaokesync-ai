// The KaraokeSync logo in 3D: a glossy tile turning slowly above a mirror
// floor, lit by pink and blue studio lights, with soft lights drifting behind.
#include "lib/logo.glsl"

vec2 map(vec3 p) {
  p.y -= .15 * sin(LA * 2.);                    // floats up and down
  p.xz *= rot(LA);                              // one full turn per loop
  p.yz *= rot(.12 * sin(LA));
  return sdLogo(p);
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.001, 0.);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

vec3 local(vec3 p) {   // the same turn as in map(), for the colours
  p.y -= .15 * sin(LA * 2.);
  p.xz *= rot(LA);
  p.yz *= rot(.12 * sin(LA));
  return p;
}

vec3 backdrop(vec3 rd, vec2 p) {
  vec3 c = mix(vec3(.10, .03, .22), vec3(.01, .01, .05), smoothstep(-.1, .7, rd.y));
  c += LOGO_PURPLE * .25 * exp(-abs(rd.y - .05) * 6.);
  return c;
}

vec3 env(vec3 r) {
  vec3 c = backdrop(r, vec2(0.));
  c += vec3(1., .35, .75) * 3. * smoothstep(.35, .0, length(r - normalize(vec3(-.9, .5, -.3))));
  c += vec3(.3, .7, 1.) * 3. * smoothstep(.35, .0, length(r - normalize(vec3(.9, .4, -.2))));
  c += vec3(1.) * 4. * smoothstep(.3, .0, length(r - normalize(vec3(0., 1., -.4))));
  return c;
}

vec3 shade(vec3 ro, vec3 rd, float t) {
  vec3 pos = ro + rd * t, n = normal(pos);
  vec3 lp = local(pos);
  vec3 r = reflect(rd, n);
  float fres = .1 + .9 * pow(1. - max(dot(-rd, n), 0.), 4.);
  float mat = map(pos).y;
  vec3 base = mat > 1.5 ? vec3(1.) : logoGradient(lp.xy);
  float dif = .35 + .65 * max(dot(n, normalize(vec3(-.4, .8, -.6))), 0.);
  float spec = pow(max(dot(r, normalize(vec3(-.4, .8, -.6))), 0.), 50.);
  return base * base * dif * 1.6 + env(r) * mix(.03, .35, fres) + spec * 1.2;
}

float march(vec3 ro, vec3 rd) {
  float t = .5;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t).x;
    if (d < .001) return t;
    t += d;
    if (t > 12.) break;
  }
  return -1.;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .3, -3.5);
  vec3 rd = lookAt(ro, vec3(0., .05, 0.), p, 1.7, 0.);
  vec3 col = backdrop(rd, p);
  // drifting soft lights behind (on circles: loops)
  for (int i = 0; i < 10; i++) {
    float k = float(i);
    vec2 c = vec2(sin(k * 2.4) * 1.8, .2 + cos(k * 1.9) * .7) + .12 * vec2(cos(LA + k), sin(LA + k * 2.));
    col += mix(LOGO_PURPLE, LOGO_BLUE, hash11(k)) * .18 * smoothstep(.16, .03, length(p - c));
  }
  float t = march(ro, rd);
  float tf = rd.y < 0. ? (-1.25 - ro.y) / rd.y : -1.;
  if (t > 0. && (tf < 0. || t < tf)) {
    col = shade(ro, rd, t);
  } else if (tf > 0.) {
    vec3 fp = ro + rd * tf, rr = reflect(rd, vec3(0., 1., 0.));
    float t2 = march(fp, rr);
    vec3 refl = t2 > 0. ? shade(fp, rr, t2) : backdrop(rr, p);
    float fade = exp(-.08 * tf * tf * .2);
    col = mix(backdrop(rd, p), vec3(.01, .008, .02) + refl * .45, fade);
    col += LOGO_PURPLE * .15 * exp(-length(fp.xz) * 1.2);   // light pool under the logo
  }
  outColor = finish(col);
}
