// @out intro
// @seconds 7
// Title card backdrop "desert gold": a golden hour sky over soft dune
// silhouettes, warm haze and the sun's rays fanning out.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(1., .6, .25), vec3(.35, .15, .2), smoothstep(-.4, 1., p.y));
  vec2 sp = p - vec2(.0, -.35);
  col += vec3(1., .75, .4) * .6 * exp(-length(sp) * 3.);
  float ang = atan(sp.x, sp.y);
  col += vec3(1., .7, .35) * pow(.5 + .5 * sin(ang * 18. + uTime * .3), 10.) * exp(-length(sp) * 1.2) * .25 * step(0., sp.y);
  float d1 = -.45 + .08 * sin(p.x * 1.8 + 1.) + .04 * sin(p.x * 4.);
  float d2 = -.62 + .1 * sin(p.x * 1.3 + 3.) + .03 * sin(p.x * 5. + 2.);
  col = mix(col, vec3(.55, .25, .12), smoothstep(d1 + .005, d1 - .005, p.y));
  col = mix(col, vec3(.25, .1, .06), smoothstep(d2 + .005, d2 - .005, p.y));
  col += vec3(1., .7, .4) * .05 * fbm(p * 3. + vec2(uTime * .1, 0.));     // heat haze
  outColor = finish(col * .9);
}
