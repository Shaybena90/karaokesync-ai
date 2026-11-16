// @out intro
// @seconds 7
// Title card backdrop "emerald": deep green crystal light, slow diagonal
// rays and glittering green and gold particles, rich and elegant.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.0, .08, .05), vec3(.0, .01, .01), length(p) * .7);
  float ang = atan(p.y - 1.3, p.x + 1.2);
  col += vec3(.1, .8, .45) * pow(.5 + .5 * sin(ang * 16. + uTime * .4), 8.) * exp(-length(p - vec2(-1.2, 1.3)) * .6) * .3;
  col += vec3(.2, .9, .5) * .12 * exp(-length(p) * 1.4);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = p * (14. + fi * 12.) + vec2(uTime * (.5 + fi), uTime * (1. + fi));
    vec2 id = floor(g);
    vec3 h = hash33(vec3(id, fi + 4.));
    float d = length(fract(g) - .5 - (h.xy - .5) * .5);
    vec3 c = mix(vec3(.3, 1., .6), vec3(1., .85, .4), step(.75, h.x));
    col += c * step(.9, h.z) * smoothstep(.12, 0., d) * (.5 + .5 * sin(uTime * 3. + h.y * 40.)) * (1. - fi * .3);
  }
  outColor = finish(col);
}
