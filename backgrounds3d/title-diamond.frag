// @out intro
// @seconds 7
// Title card backdrop "diamond": a black jewellery-box space with faceted
// crystal light, sharp white sparkles that twinkle and slow light rays.
float facets(vec2 p) {
  // a field of triangular facets whose brightness turns with the light
  vec2 q = p * 6.;
  q.x += q.y * .577;
  vec2 id = floor(q), f = fract(q);
  float tri = step(f.x, f.y);
  float h = hash21(id + tri * 17.);
  return pow(.5 + .5 * sin(h * 40. + uTime * 1.3 + p.x * 2.), 8.);
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.03, .035, .05), vec3(.0, .0, .005), length(p) * .7);
  float f = facets(p * rot(.2) + vec2(uTime * .02, 0.));
  col += vec3(.55, .65, .85) * f * .06 * smoothstep(.5, 1.4, length(p));
  // light rays from the top centre
  float ang = atan(p.x, p.y - 1.2);
  float rays = pow(.5 + .5 * sin(ang * 22. + uTime * .5), 6.) * exp(-length(p - vec2(0., 1.2)) * .9);
  col += vec3(.7, .8, 1.) * rays * .18;
  // twinkling star sparkles (four-pointed)
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 c = vec2(hash11(fi * 3.3) * 3.4 - 1.7, hash11(fi * 7.7) * 1.9 - .95);
    if (length(c * vec2(.8, 1.4)) < .5) c *= 1.9;                     // keep the centre for the words
    float tw = pow(max(sin(uTime * (1.5 + hash11(fi)) + fi * 2.), 0.), 6.);
    vec2 d = p - c;
    float star = .002 / (abs(d.x * d.y) * 30. + .002) * exp(-length(d) * 18.) + .004 / (length(d) + .004) * .3;
    col += vec3(.9, .95, 1.) * star * tw;
  }
  outColor = finish(col);
}
