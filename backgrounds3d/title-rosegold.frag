// @out intro
// @seconds 7
// Title card backdrop "rose gold": soft pink-gold silk light with big
// romantic bokeh circles and a gentle shimmer. For weddings and love songs.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.3, .14, .14), vec3(.08, .03, .04), length(p * vec2(.8, 1.)) * .8);
  // silk waves of light
  float s = sin(p.x * 2.5 + p.y * 1.5 + uTime * .4) + .5 * sin(p.x * 5. - p.y * 2. - uTime * .3);
  col += vec3(.9, .55, .45) * pow(.5 + .25 * s, 4.) * .35;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 c = vec2(hash11(fi * 2.1) * 3.6 - 1.8, hash11(fi * 5.9) * 2. - 1.);
    c += .08 * vec2(sin(uTime * .4 + fi), cos(uTime * .35 + fi * 2.));
    float r = .1 + .18 * hash11(fi * 8.3);
    float d = length(p - c);
    float disc = smoothstep(r, r - .03, d) * (.6 + .4 * smoothstep(r - .06, r, d));
    col += mix(vec3(1., .65, .6), vec3(1., .85, .6), hash11(fi)) * disc * .13;
  }
  vec2 g = p * 30. + vec2(0., uTime * 2.);
  float h = hash21(floor(g));
  col += vec3(1., .85, .7) * step(.99, h) * smoothstep(.3, 0., length(fract(g) - .5)) * (.5 + .5 * sin(uTime * 4. + h * 50.));
  outColor = finish(col);
}
