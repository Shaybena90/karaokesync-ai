// @out intro
// Title card backdrop "stage": deep red curtains on a dark stage, a warm
// spotlight from above with dust floating in its light, and a pool of light
// on the floor. 10 s loop.
void main() {
  vec2 p = screen();
  // curtains: vertical folds that sway gently
  float folds = sin(p.x * 26. + .6 * sin(p.y * 2. + LA)) * .5 + .5;
  vec3 curtain = vec3(.32, .02, .04) * (.25 + .75 * pow(folds, 1.5)) * (.6 + .4 * smoothstep(-1., .8, p.y));
  vec3 col = curtain * .55;
  // the spotlight cone from the top centre, swaying a little
  vec2 o = vec2(.08 * sin(LA), 1.3);
  vec2 v = p - o;
  float ang = abs(atan(v.x, -v.y));
  float cone = smoothstep(.42, .25, ang) * smoothstep(-1.2, .9, p.y + .3);
  col += vec3(1., .82, .55) * .17 * cone;
  // floor pool of light
  col += vec3(1., .78, .5) * .32 * exp(-pow(length((p - vec2(o.x * .4, -.78)) * vec2(.8, 3.2)), 2.) * 2.);
  // dust in the beam (rises whole cells per loop)
  vec2 g = p * 18. + vec2(0., -PHASE * 6.);
  vec2 id = floor(g);
  vec3 h = hash32(vec2(id.x, mod(id.y, 6.)));
  col += vec3(1., .9, .7) * step(.9, h.z) * smoothstep(.1, .0, length(fract(g) - .5 - (h.xy - .5) * .6)) * cone * .9;
  // a darker edge at the bottom (the stage floor)
  col *= .55 + .45 * smoothstep(-1.05, -.6, p.y);
  outColor = finish(col);
}
