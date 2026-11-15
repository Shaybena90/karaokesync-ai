// @out intro
// Title card backdrop "minimal": calm charcoal, a soft light slowly moving
// behind the title and a few faint specks. Elegant and quiet. 10 s loop.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.05, .05, .055), vec3(.012, .012, .015), smoothstep(-1., 1., p.y) * .6 + length(p) * .25);
  vec2 lc = vec2(.35 * sin(LA), .08 * cos(LA));
  col += vec3(.16, .15, .14) * exp(-length((p - lc) * vec2(.7, 1.3)) * 2.2);
  // two thin light lines framing the title
  col += vec3(.18) * smoothstep(.003, .0, abs(abs(p.y) - .42)) * smoothstep(.9, .0, abs(p.x)) * .6;
  vec2 g = p * 30. + vec2(PHASE * 3., 0.);
  vec3 h = hash32(vec2(mod(floor(g.x), 90.), floor(g.y)));
  col += vec3(.5) * step(.992, h.z) * smoothstep(.2, .0, length(fract(g) - .5)) * (.4 + .6 * sin(LA + h.x * 6.28));
  outColor = finish(col);
}
