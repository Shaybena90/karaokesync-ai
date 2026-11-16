// @out intro
// @seconds 7
// Title card backdrop "rainbow": smooth flowing bands of every colour on a
// dark background, glowing softly, cheerful and bright.
void main() {
  vec2 p = screen();
  vec3 col = vec3(.02, .015, .04);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float y = .55 + fi * .07 + .12 * sin(p.x * 1.6 + uTime * .6 + fi * .25);
    float y2 = -.55 - fi * .07 + .12 * sin(p.x * 1.6 - uTime * .6 + fi * .25 + 2.);
    vec3 c = pal(fi / 6., vec3(.55), vec3(.45), vec3(1.), vec3(0., .33, .67));
    col += c * (exp(-abs(p.y - y) * 60.) + exp(-abs(p.y - y2) * 60.)) * .9;
    col += c * (exp(-abs(p.y - y) * 8.) + exp(-abs(p.y - y2) * 8.)) * .05;
  }
  vec2 g = p * 25. + vec2(uTime * .5, 0.);
  float h = hash21(floor(g));
  col += vec3(1.) * step(.992, h) * smoothstep(.3, 0., length(fract(g) - .5)) * (.5 + .5 * sin(uTime * 3. + h * 40.));
  outColor = finish(col);
}
