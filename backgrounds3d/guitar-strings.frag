// Guitar strings: a close look along the neck of a guitar, its six strings
// vibrating and glowing, the frets passing by and warm light on the wood.
void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .55, 0.);
  vec3 rd = lookAt(ro, vec3(.0, .0, 3.), p, 1.5, .1);
  vec3 col = vec3(.02, .01, .015);
  float t = ro.y / -rd.y;
  if (rd.y < 0.) {
    vec3 h = ro + rd * t;
    float neckW = .55;
    float travel = PHASE * 8.;                                  // 8 frets per loop
    float z = h.z + travel;
    if (abs(h.x) < neckW) {
      // rosewood with grain
      vec3 wood = vec3(.2, .08, .04) * (.7 + .3 * fbm(vec2(h.x * 20., z * 2.)));
      // frets
      float fz = fract(z);
      wood = mix(wood, vec3(.75, .7, .6), smoothstep(.03, .0, abs(fz - .5)) * .9);
      // inlay dots
      float fid = floor(z);
      if (mod(fid, 2.) == 1.) wood = mix(wood, vec3(.9, .9, .85), smoothstep(.06, .04, length(vec2(h.x, (fz - .25) * 1.))));
      col = wood * (.5 + .6 * exp(-t * .3));
    } else col = vec3(.01);
    col *= exp(-t * .15);
  }
  // the six strings, just above the wood, seen as glowing lines
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float xs = (fi - 2.5) * .17;
    float amp = .012 * (1. + fi * .3) * (.6 + .4 * sin(LA * (2. + fi)));
    // a string in screen space: project points (xs, .03, z) for the pixel's depth
    float tz = (ro.y - .03) / max(-rd.y, 1e-3);
    vec3 q = ro + rd * tz;
    float vib = amp * sin(q.z * 3. - LA * (6. + fi * 2.)) * sin(q.z * .7);
    float d = abs(q.x - xs - vib) / (tz * .004 + .002);
    vec3 sc = mix(vec3(1., .8, .45), vec3(.9, .9, 1.), step(3., fi));
    float glow = exp(-d * d * .5) + .25 * exp(-d * .3);
    col += sc * glow * exp(-tz * .12) * (.6 + .5 * sin(LA * (2. + fi)) * .5) * step(0., -rd.y);
  }
  // warm stage light from above
  col += vec3(1., .5, .2) * .1 * exp(-length(p - vec2(.5, .9)) * 2.);
  outColor = finish(col * 1.1);
}
