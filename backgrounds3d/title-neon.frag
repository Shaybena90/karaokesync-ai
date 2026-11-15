// @out intro
// Title card backdrop "neon": a dark night with a glowing cyan and pink grid
// floor moving towards you, a bright horizon line and a soft haze. 10 s loop.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.02, .0, .06), vec3(.0, .0, .02), smoothstep(-.2, 1., p.y));
  float hz = -.45;                                                   // the horizon (below the title)
  col += vec3(1., .2, .7) * .5 * exp(-abs(p.y - hz) * 9.) + vec3(.1, .8, 1.) * .25 * exp(-abs(p.y - hz) * 3.);
  if (p.y < hz) {
    float d = hz - p.y;
    vec2 g = vec2(p.x / d, 1. / d) * .5;
    g.y += PHASE * 4.;                                               // 4 grid rows per loop
    vec2 fw = fwidth(g);
    vec2 dist = .5 - abs(fract(g) - .5);                              // 0 on a grid line
    vec2 l = 1. - smoothstep(vec2(0.), fw * 1.5 + .012, dist);
    float line = max(l.x, l.y) * smoothstep(.0, .3, d) * (1. - smoothstep(.0, 3., max(fw.x, fw.y) * 3.));
    vec3 lc = mix(vec3(1., .2, .75), vec3(.1, .85, 1.), smoothstep(.0, .8, d));
    col += lc * line * 1.1 + lc * .03 * smoothstep(.0, .6, d);
  }
  // stars above
  vec2 sg = p * 45.;
  float h = hash21(floor(sg));
  col += step(.985, h) * smoothstep(.2, .0, length(fract(sg) - .5)) * smoothstep(hz, hz + .4, p.y) * (.5 + .5 * sin(LA * 2. + h * 6.28));
  // soft haze bands drifting (on a circle in noise space)
  col += vec3(.5, .2, .9) * .06 * fbm(p * 1.5 + vec2(cos(LA), sin(LA)) * .4) * smoothstep(-.4, .8, p.y);
  outColor = finish(col);
}
