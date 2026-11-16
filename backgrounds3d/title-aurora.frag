// @out intro
// @seconds 7
// Title card backdrop "aurora": curtains of green and violet northern lights
// moving softly across a starry night sky above a dark horizon.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.01, .03, .06), vec3(.0, .005, .02), smoothstep(-.6, 1., p.y));
  vec2 g = floor(p * 160.);
  col += step(.996, hash21(g)) * (.5 + .5 * sin(uTime * 2. + hash21(g) * 40.)) * .7;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = .25 + fi * .14 + .18 * sin(p.x * (1.2 + fi * .3) + uTime * (.25 + fi * .07) + fi * 2.);
    float band = exp(-max(p.y - y, 0.) * 5.) * smoothstep(y - .5, y, p.y);
    float rays = .5 + .5 * sin(p.x * 30. + 3. * sin(p.x * 2. + uTime * .3 + fi));
    vec3 c = mix(vec3(.1, 1., .55), vec3(.6, .3, 1.), fi / 3.);
    col += c * band * (.4 + .6 * rays) * .22;
  }
  // a dark horizon with soft hills
  float hill = -.72 + .06 * sin(p.x * 2.3) + .04 * sin(p.x * 5.1 + 1.);
  col = mix(col, vec3(.0, .006, .012), smoothstep(hill + .01, hill - .01, p.y));
  outColor = finish(col * 1.1);
}
