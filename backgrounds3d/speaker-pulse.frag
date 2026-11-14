// A loudspeaker pumping to the beat: the woofer cone kicks out, its neon ring
// flashes, and rings of sound roll out. The KaraokeSync logo glows on top.
#include "lib/logo.glsl"
#include "lib/speaker.glsl"

mat3 spkRot() { float a = -.35 + .12 * sin(LA); float c = cos(a), s = sin(a); return mat3(c, 0., s, 0., 1., 0., -s, 0., c); }

void main() {
  vec2 p = screen();
  float pump = beat();
  vec3 ro = vec3(.4 * sin(LA), .15, -3.5);
  vec3 rd = lookAt(ro, vec3(0., -.05, 0.), p, 1.35, 0.);
  mat3 R = spkRot();
  vec3 col = mix(vec3(.06, .02, .12), vec3(.005, .005, .02), smoothstep(-.6, 1., p.y));
  col += LOGO_BLUE * .12 * exp(-length(p - vec2(.0, .1)) * 1.2) * (1. + pump);
  // sound rings rolling out from the woofer
  vec2 wc = vec2(.03, -.42);
  for (int k = 0; k < 3; k++) {
    float ph = fract(PHASE * 20. / 3. + float(k) / 3.);   // a new ring every beat
    float rad = .4 + ph * 1.8;
    float ring = exp(-pow((length((p - wc) * vec2(1., 1.15)) - rad) / .02, 2.)) * (1. - ph);
    col += mix(LOGO_PURPLE, LOGO_BLUE, ph) * ring * .6;
  }
  float t = 2., d = 1.;
  for (int i = 0; i < 110; i++) {
    vec3 q = R * (ro + rd * t);
    d = sdSpeaker(q, pump);
    if (d < .001 || t > 10.) break;
    t += d;
  }
  float tf = rd.y < 0. ? (-SPK.y - ro.y) / rd.y : -1.;
  if (t < 10. && (tf < 0. || t < tf)) {
    vec3 q = R * (ro + rd * t);
    vec2 e = vec2(.001, 0.);
    vec3 n = normalize(vec3(sdSpeaker(q + e.xyy, pump) - sdSpeaker(q - e.xyy, pump),
                            sdSpeaker(q + e.yxy, pump) - sdSpeaker(q - e.yxy, pump),
                            sdSpeaker(q + e.yyx, pump) - sdSpeaker(q - e.yyx, pump)));
    vec3 glow = mix(LOGO_PURPLE, LOGO_BLUE, .5 + .5 * sin(LA));
    col = shadeSpeaker(q, n, R * rd, normalize(vec3(-.5, .7, -.6)), glow, pump, vec3(.5, .35, .9));
  } else if (tf > 0.) {
    vec3 fp = ro + rd * tf;
    // glossy floor: a soft reflection of the neon and the logo colours under the speaker
    vec3 lq = R * fp;
    col = vec3(.008, .006, .015) + mix(LOGO_PURPLE, LOGO_BLUE, .5) * .35 * exp(-length(lq.xz - vec2(0., -.6)) * 1.5) * (.4 + pump);
    col = mix(col, vec3(.01, .005, .02), smoothstep(3., 9., tf));
  }
  outColor = finish(col);
}
