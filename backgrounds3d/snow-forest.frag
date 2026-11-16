// Snowy forest: a quiet winter night with rows of snow-covered pine trees,
// a big moon, and snow falling in layers. Everything moves in whole turns or
// whole cells per loop, so the clip loops seamlessly.
float pine(vec2 p, float h) {
  // a pine silhouette: stacked triangles; returns > 0 inside
  float d = -1.;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y0 = fi * h * .22, w = h * (.42 - fi * .08);
    float t = (p.y - y0) / (h * .38);
    if (t > 0. && t < 1.) d = max(d, w * (1. - t) - abs(p.x));
  }
  return max(d, .02 * h - abs(p.x)) * step(0., p.y) * step(p.y, h);
}

vec3 forestRow(vec2 p, float scale, float seed, vec3 col, vec3 snow, vec3 bg) {
  vec2 q = p * scale;
  float id = floor(q.x);
  float h = .9 + .6 * hash11(id + seed);
  vec2 local = vec2(fract(q.x) - .5 + (hash11(id * 3.1 + seed) - .5) * .3, q.y + 1.2);
  float d = pine(local, h);
  if (d > 0.) {
    // dark needles, snow lying on the branches and along the moonlit edge
    float lumps = step(.58, noise(local * vec2(18., 30.) + seed));
    float edge = smoothstep(.035, .0, d) * step(0., local.x);
    return mix(col, snow, clamp(lumps * .7 + edge * .8, 0., 1.));
  }
  return bg;
}

void main() {
  vec2 p = screen();
  p.x += .05 * sin(LA);                                   // the camera sways a little
  vec3 col = mix(vec3(.05, .08, .16), vec3(.005, .01, .03), smoothstep(-.3, 1., p.y));
  vec2 moon = vec2(.7, .55);
  float md = length(p - moon);
  col += vec3(.7, .8, 1.) * (smoothstep(.13, .12, md) * (.9 + .1 * fbm(p * 12.)) + .25 * exp(-md * 4.));
  // stars
  vec2 g = floor(p * 150.);
  col += step(.996, hash21(g)) * (.5 + .5 * sin(LA * 2. + hash21(g) * 50.)) * smoothstep(.0, .5, p.y);
  // snowy ground
  if (p.y < -.55) col = mix(vec3(.55, .62, .78), vec3(.25, .3, .45), smoothstep(-.55, -1., p.y));
  // tree rows, far to near (parallax shifts by whole tree widths per loop)
  col = forestRow(p + vec2(PHASE * 1. / 3., .1), 3., 1., vec3(.06, .1, .14), vec3(.4, .45, .6), col);
  col = forestRow(p + vec2(PHASE * 2. / 2.2, .35), 2.2, 7., vec3(.025, .06, .07), vec3(.55, .6, .75), col);
  col = forestRow(p + vec2(PHASE * 3. / 1.4, .7), 1.4, 13., vec3(.01, .03, .03), vec3(.75, .8, .95), col);
  // falling snow, three depths
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 8. + fi * 9.;
    float n = ceil(sc * 2.4);                                   // whole cells per loop, more than the screen
    vec2 s = p * sc + vec2(sin(LA + fi) * .5, PHASE * n);
    vec2 id = floor(s);
    vec3 h = hash33(vec3(id.x, mod(id.y, n), fi));
    vec2 c = id + .5 + .3 * vec2(sin(LA * 2. + h.x * TAU), 0.);
    float r = .04 + .06 * h.y;
    col += vec3(.9, .95, 1.) * smoothstep(r, r * .3, length(s - c)) * step(.5, h.z) * (.5 + fi * .25);
  }
  outColor = finish(col);
}
