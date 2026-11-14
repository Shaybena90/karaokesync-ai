// @out intro
// Backdrop of the song title card (the words themselves are drawn by the video
// renderer, per song). It continues the intro's look: the same deep purple,
// the logo's purple and blue in soft drifting lights, twinkling stars and a
// glow behind the title, so the change from the intro is smooth. A 10 s loop.
#include "lib/logo.glsl"

void main() {
  vec2 p = screen();
  // the intro's background colours
  vec3 col = mix(vec3(.035, .012, .08), vec3(.002, .003, .015), smoothstep(-1.1, 1.1, p.y));
  col += LOGO_PURPLE * .16 * exp(-length(p * vec2(.6, 1.)) * 1.8);          // glow behind the title
  col += LOGO_BLUE * .06 * exp(-abs(p.y + .55) * 5.) * (.8 + .2 * sin(LA));   // a faint floor light, like the intro's mirror
  // stars, as in the intro
  for (int l = 0; l < 3; l++) {
    vec2 g = p * (6. + 4. * float(l)) + vec2(float(l) * 3.7, 0.);
    vec2 id = floor(g);
    vec3 h = hash32(id + float(l) * 7.);
    float tw = .5 + .5 * sin(LA * floor(1. + 3. * h.x) + h.y * 6.28);
    col += mix(LOGO_PURPLE, vec3(1.), h.y) * step(.93, h.z) * smoothstep(.12, .0, length(fract(g) - .5 - (h.xy - .5) * .6)) * tw * .45;
  }
  // soft purple and blue lights drifting up slowly (whole cells per loop, so it loops)
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float scale = 1.8 + fl * 1.4;
    float shift = 3. + 2. * fl;
    vec2 g = p * scale + vec2(fl * 4.1, -PHASE * shift);
    vec2 id = floor(g);
    vec3 h = hash32(vec2(id.x, mod(id.y, shift)) + fl * 9. + 40.);
    vec2 c = fract(g) - .5 - (h.xy - .5) * .6;
    float r = .16 + .1 * h.z;
    float bok = smoothstep(r, r * .3, length(c)) * step(.78, h.z);
    col += mix(LOGO_PURPLE, LOGO_BLUE, h.x) * bok * (.10 + .05 * fl) * (.7 + .3 * sin(LA + h.y * 6.28));
  }
  // slow light rays from above, in the logo's purple
  float a = atan(p.x, 1.8 - p.y);
  col += LOGO_PURPLE * .035 * (.5 + .5 * sin(a * 16. + sin(LA) * .5)) * smoothstep(-.4, 1.2, p.y);
  outColor = finish(col);
}
