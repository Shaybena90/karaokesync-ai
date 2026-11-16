// @out intro
// @seconds 7
// Title card backdrop "ocean": deep blue water with sunlight shafts coming
// down from the waves above, slow caustic light and tiny rising bubbles.
float caustic(vec2 p) {
  vec2 q = p;
  float c = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.6 + uTime * .5 + fi), cos(q.x * 1.4 - uTime * .45 + fi * 2.)) * .45;
    c += 1. / (1. + 25. * abs(sin(q.x * 2.) * sin(q.y * 2.)));
  }
  return c / 3.;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.0, .03, .09), vec3(.02, .25, .42), smoothstep(-1., 1.1, p.y));
  col += vec3(.4, .85, 1.) * caustic(vec2(p.x * 2., p.y * 1.2 + 4.)) * smoothstep(.2, 1., p.y) * .25;
  float shafts = 0.;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float x = p.x + p.y * .3 - (fi - 3.) * .5 - .06 * sin(uTime * .6 + fi * 2.);
    shafts += exp(-x * x * 30.) * (.5 + .5 * sin(uTime * .8 + fi * 3.));
  }
  col += vec3(.45, .85, 1.) * shafts * .1 * smoothstep(-1., 1., p.y);
  vec2 g = vec2(p.x * 8., p.y * 8. - uTime * 2.);
  vec2 id = floor(g);
  vec3 h = hash33(vec3(id, 2.));
  float d = length(g - id - .5 - vec2(.25 * sin(uTime * 2. + h.x * 9.), 0.));
  col += vec3(.8, 1., 1.) * step(.8, h.z) * (smoothstep(.09, .06, d) - smoothstep(.06, .03, d) * .6) * .5;
  outColor = finish(col);
}
