// @out intro
// @seconds 7
// Title card backdrop "nebula": a colourful cosmic cloud of magenta and blue
// gas, slowly turning, with bright young stars shining through it.
void main() {
  vec2 p = screen();
  vec2 q = rot(uTime * .02) * p;
  float n1 = fbm(q * 1.4 + vec2(uTime * .03, 0.));
  float n2 = fbm(q * 2.3 - vec2(0., uTime * .04) + 7.);
  vec3 col = vec3(.005, .004, .02);
  col += vec3(.8, .15, .55) * pow(n1, 3.) * 1.4;
  col += vec3(.15, .35, 1.) * pow(n2, 3.) * 1.1;
  col *= .3 + .7 * smoothstep(.3, 1.3, length(p * vec2(.75, 1.)));                     // calmer behind the words
  vec2 g = floor(p * 120.);
  float h = hash21(g);
  col += step(.994, h) * (.6 + .4 * sin(uTime * 2. + h * 30.)) * .8;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(hash11(fi * 4.1) * 3.4 - 1.7, hash11(fi * 9.2) * 1.8 - .9);
    if (length(c * vec2(.7, 1.3)) < .55) c *= 1.8;
    col += vec3(.8, .9, 1.) * .003 / (length(p - c) + .003) * (.7 + .3 * sin(uTime * 2. + fi));
  }
  outColor = finish(col);
}
