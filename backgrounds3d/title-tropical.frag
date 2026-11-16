// @out intro
// @seconds 7
// Title card backdrop "tropical": a turquoise sunset sky with palm leaves
// swaying in the corners and warm light, for summer songs.
float leaf(vec2 p, float ang, float len) {
  p = rot(ang) * p;
  if (p.x < 0. || p.x > len) return 0.;
  float t = p.x / len;
  float w = .12 * sin(t * PI) * len;
  float y = p.y - .15 * len * t * t;                                      // the leaf bends down
  float fronds = abs(fract(p.x * 14. / len) - .5);
  return step(abs(y), w * (.55 + .45 * smoothstep(.1, .3, fronds)));
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(1., .55, .35), vec3(.1, .55, .7), smoothstep(-.6, .9, p.y));
  col = mix(col, vec3(.05, .2, .4), smoothstep(.6, 1.1, p.y));
  col += vec3(1., .8, .5) * .5 * exp(-length(p - vec2(.0, -.55)) * 2.5);  // the low sun
  float sway = .06 * sin(uTime * .9);
  float palms = 0.;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    palms = max(palms, leaf(p - vec2(-1.95, 1.1), -.3 - fi * .35 + sway, 1.2));
    palms = max(palms, leaf(vec2(-p.x, p.y) - vec2(-1.95, 1.05), -.35 - fi * .33 - sway, 1.15));
  }
  col = mix(col, vec3(.01, .05, .04), palms);
  outColor = finish(col);
}
