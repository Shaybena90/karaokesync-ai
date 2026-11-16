// Underwater: sunlight streaming down through the waves in shafts, dancing
// caustics on the sandy floor and bubbles rising, in deep blue and turquoise.
float caustic(vec2 p) {
  vec2 q = p;
  float c = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + LA + fi), cos(q.x * 1.5 - LA + fi * 2.)) * .45;
    c += 1. / (1. + 30. * abs(sin(q.x * 2.) * sin(q.y * 2.)));
  }
  return c / 3.;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(.3 * sin(LA), 1.2, 0.);
  vec3 rd = lookAt(ro, vec3(.3 * sin(LA + 1.), .9, 4.), p, 1.3, 0.);
  vec3 col = mix(vec3(.0, .05, .12), vec3(.05, .45, .6), smoothstep(-.4, .9, rd.y));
  // the surface far above: bright rippling light
  if (rd.y > 0.) {
    vec2 s = rd.xz / rd.y * 2.;
    col += vec3(.6, .95, 1.) * caustic(s * .8) * smoothstep(.1, .8, rd.y) * .5;
  } else {
    float t = ro.y / -rd.y;
    vec2 f = (ro + rd * t).xz;
    float sand = .5 + .5 * sin(f.x * 3. + sin(f.y * 2.)) * .3 + fbm(f * 2.) * .5;
    vec3 floorC = vec3(.55, .5, .35) * sand * (.3 + 1.2 * caustic(f * .9));
    col = mix(floorC * .6, col, 1. - exp(-t * .18));
  }
  // light shafts
  float shafts = 0.;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = p.x + p.y * .35 - (fi - 2.5) * .45 - .08 * sin(LA + fi * 2.);
    shafts += exp(-x * x * 40.) * (.5 + .5 * sin(LA * floor(1. + fi * .5) + fi * 3.));
  }
  col += vec3(.5, .9, 1.) * shafts * .12 * smoothstep(-1., 1., p.y);
  // bubbles rising: whole cells per loop
  vec2 g = vec2(p.x * 6., p.y * 6. - PHASE * 24.);
  vec2 id = floor(g);
  vec3 h = hash33(vec3(id.x, mod(id.y, 24.), 5.));   // repeats every 24 cells: the loop closes
  vec2 c = id + .5 + vec2(.3 * sin(LA * 2. + h.x * TAU + g.y * TAU), 0.) * .5;
  float d = length(g - c), r = .05 + .1 * h.y;
  float bub = step(.7, h.z) * (smoothstep(r, r - .03, d) - smoothstep(r - .03, r - .06, d) * .7);
  col += vec3(.8, 1., 1.) * bub * .6;
  outColor = finish(col);
}
