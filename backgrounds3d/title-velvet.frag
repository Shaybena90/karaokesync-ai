// @out intro
// @seconds 7
// Title card backdrop "velvet": deep red velvet curtains with soft folds on
// both sides, warm golden light from above and gold dust drifting down.
void main() {
  vec2 p = screen();
  float sway = .02 * sin(LA * 10. / 7.);
  // curtain folds: the brightness of a pleated cloth
  float folds = sin((p.x + sway * (1. + p.y)) * 18. + sin(p.y * 2. + p.x * 3.) * .8);
  float sheen = pow(.5 + .5 * folds, 3.);
  vec3 velvet = vec3(.25, .015, .03) * (.35 + .9 * sheen) + vec3(.6, .1, .08) * pow(sheen, 12.) * .5;
  // curtains on the sides, an opening of dark stage in the middle
  float open = smoothstep(.55, .95, abs(p.x) + .08 * p.y * p.y);
  vec3 stage = mix(vec3(.05, .01, .015), vec3(.012, .002, .004), length(p) * .7);
  vec3 col = mix(stage, velvet, open);
  // the valance at the top
  float val = smoothstep(.78, .82, p.y + .03 * sin(p.x * 9.));
  col = mix(col, vec3(.3, .02, .04) * (.6 + .4 * sheen), val);
  col = mix(col, vec3(.9, .65, .25), smoothstep(.006, .0, abs(p.y - .79 - .03 * sin(p.x * 9.))) * .9);   // gold trim
  // warm spotlight from above on the centre
  col += vec3(1., .7, .35) * .1 * exp(-length((p - vec2(0., .2)) * vec2(1., .6)) * 1.8);
  // gold dust
  vec2 g = p * 26. + vec2(0., uTime * 26. / 7. * 1.5);
  float h = hash21(floor(g));
  col += vec3(1., .8, .4) * step(.985, h) * smoothstep(.35, 0., length(fract(g) - .5)) * (.6 + .4 * sin(uTime * 3. + h * 40.));
  outColor = finish(col * 1.1);
}
