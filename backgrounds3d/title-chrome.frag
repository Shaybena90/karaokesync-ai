// @out intro
// @seconds 7
// Title card backdrop "chrome": brushed dark steel with sharp reflections
// of studio strip lights sliding across it, cool and modern.
void main() {
  vec2 p = screen();
  float brushed = .5 + .5 * sin(p.y * 900. + 6. * noise(p * vec2(2., 80.)));
  vec3 col = vec3(.06, .065, .075) * (.85 + .3 * brushed);
  col *= .6 + .4 * smoothstep(1.4, .0, length(p));
  // reflections of strip lights moving slowly
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * .8 + p.y * .35 - (fi - 1.) * 1.1 - .25 * sin(uTime * .5 + fi * 2.);
    col += vec3(.75, .8, .9) * exp(-x * x * 60.) * .45 * (.8 + .2 * brushed);
    col += vec3(.4, .45, .55) * exp(-x * x * 4.) * .06;
  }
  // a thin cyan line light at the bottom and top
  col += vec3(.3, .8, 1.) * (exp(-abs(p.y + .85) * 60.) + exp(-abs(p.y - .85) * 60.)) * .6;
  outColor = finish(col);
}
