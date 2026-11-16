// @out intro
// @seconds 7
// Title card backdrop "electric": dark blue with crackling lightning arcs
// running along the edges of the frame and a cool electric haze.
float bolt(vec2 p, float seed, float t) {
  float x = p.x;
  float y = .0;
  float a = .25;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    y += a * (noise(vec2(x * (2. + fi * 2.) + seed * 10., floor(t * 8.) + seed)) - .5);
    a *= .55;
  }
  return abs(p.y - y);
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.01, .02, .06), vec3(.0, .0, .015), length(p) * .6);
  col += vec3(.1, .25, .6) * .07 * fbm(p * 2. + uTime * .2);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yOff = fi < 2. ? .72 + fi * .12 : -.72 - (fi - 2.) * .12;    // top and bottom, away from the words
    float flick = step(.35, hash11(floor(uTime * 8.) + fi * 13.));
    float d = bolt(vec2(p.x, p.y - yOff), fi * 3.1, uTime + fi);
    col += vec3(.6, .8, 1.) * (.0025 / (d + .0025) + .2 * exp(-d * 20.)) * flick * .5;
  }
  outColor = finish(col);
}
