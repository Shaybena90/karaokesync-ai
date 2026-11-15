// @out intro
// Title card backdrop "sunset": a warm sky going from orange to pink to deep
// purple, a big soft sun low behind the title with glowing bands across it,
// and warm lights floating up. 10 s loop.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.75, .25, .08), vec3(.45, .08, .28), smoothstep(-.7, .2, p.y));
  col = mix(col, vec3(.07, .02, .14), smoothstep(.05, 1., p.y));
  vec2 sc = vec2(0., -.55);
  float sd = length(p - sc);
  col += vec3(1., .6, .3) * smoothstep(.5, .45, sd) * .5 + vec3(1., .45, .25) * .35 * exp(-sd * 2.5);
  // glowing bands across the sun, drifting down slowly
  col *= 1. - .25 * smoothstep(.5, .45, sd) * step(.5, fract((p.y - sc.y) * 9. + PHASE * 2.)) * step(p.y, sc.y + .1);
  col *= .45 + .55 * smoothstep(-1.1, -.55, p.y) + .0;               // darker ground
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float shift = 3. + 2. * fl;
    vec2 g = p * (2. + fl * 1.5) + vec2(fl * 3.3, -PHASE * shift);
    vec2 id = floor(g);
    vec3 h = hash32(vec2(id.x, mod(id.y, shift)) + 20. + fl * 5.);
    float r = .12 + .08 * h.z;
    col += vec3(1., .8, .55) * smoothstep(r, r * .3, length(fract(g) - .5 - (h.xy - .5) * .6)) * step(.82, h.z) * .1;
  }
  outColor = finish(col * .62);
}
