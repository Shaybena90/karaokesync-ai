// @out intro
// @seconds 7
// Title card backdrop "retro": an 80s synthwave night: a striped sun sinking
// behind a magenta neon grid that rolls towards the viewer.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.25, .02, .3), vec3(.02, .0, .08), smoothstep(-.1, 1., p.y));
  // the sun with stripes
  vec2 sc = p - vec2(0., .15);
  float sun = smoothstep(.62, .6, length(sc));
  float stripes = step(.5, fract((sc.y + uTime * .05) * 9.)) + step(.1, sc.y);
  col = mix(col, mix(vec3(1., .2, .5), vec3(1., .85, .3), smoothstep(-.5, .5, sc.y)), sun * min(stripes, 1.) * .8);
  col += vec3(1., .3, .6) * .2 * exp(-length(sc) * 2.);
  // the grid floor
  if (p.y < -.12) {
    float z = .5 / (-.12 - p.y);
    vec2 g = vec2(p.x * z, z + uTime * 1.5);
    float fx = abs(fract(g.x) - .5), fy = abs(fract(g.y) - .5);
    float lx = clamp(1. - (.5 - fx) / (fwidth(g.x) * 1.5 + .015), 0., 1.);
    float ly = clamp(1. - (.5 - fy) / (fwidth(g.y) * 1.5 + .015), 0., 1.);
    col = mix(vec3(.04, .0, .08), vec3(.06, .0, .12), -p.y);
    col += vec3(1., .2, .8) * max(lx, ly) * exp(-z * .08);
  }
  col += vec3(1., .3, .9) * .25 * exp(-abs(p.y + .12) * 30.);              // the horizon glow
  outColor = finish(col);
}
