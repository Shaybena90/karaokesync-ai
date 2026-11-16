// Silk ribbons: wide ribbons of shiny silk flowing in waves through a dark
// space, in deep purple and gold, with a soft sheen moving along the folds.
vec3 ribbon(vec2 p, float k, vec3 base, vec3 sheen) {
  float y = .35 * sin(p.x * 1.3 + LA + k * 2.) + .15 * sin(p.x * 2.7 - 2. * LA + k);
  float dy = .35 * 1.3 * cos(p.x * 1.3 + LA + k * 2.) + .15 * 2.7 * cos(p.x * 2.7 - 2. * LA + k);
  float width = .18 + .06 * sin(p.x * 1.1 + LA + k * 3.);
  float d = (p.y - y - (k - 1.) * .45) / width;
  if (abs(d) > 1.) return vec3(-1.);
  float twist = sin(p.x * 1.7 + LA * 2. + k * 1.3);            // the ribbon turns over
  vec3 n = normalize(vec3(-dy, 1., 0.) + vec3(0., 0., twist * 1.5 + d * .6));
  vec3 l = normalize(vec3(.4, .6, .8));
  float dif = .4 + .6 * max(dot(n, l), 0.);
  float spec = pow(max(dot(reflect(vec3(0., 0., -1.), n), l), 0.), 24.);
  float threads = .9 + .1 * sin(d * 60.);
  vec3 c = base * dif * threads + sheen * spec * 1.6;
  c *= smoothstep(1., .85, abs(d));                            // soft edges
  return c;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.06, .02, .1), vec3(.0), length(p) * .6);
  for (int i = 0; i < 3; i++) {
    float k = float(i);
    vec3 base = k == 1. ? vec3(.8, .55, .15) : vec3(.35, .08, .55);
    vec3 r = ribbon(p, k, base, vec3(1., .9, .7));
    if (r.x >= 0.) col = r + col * .1;
  }
  // a little floating gold dust
  vec2 g = p * 30. + vec2(PHASE * 30., 0.);
  float h = hash21(floor(g));
  col += vec3(1., .8, .45) * step(.99, h) * smoothstep(.3, .0, length(fract(g) - .5)) * (.5 + .5 * sin(LA * 3. + h * 60.));
  outColor = finish(col);
}
