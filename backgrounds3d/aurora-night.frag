// Aurora night: curtains of northern lights waving over snowy mountains, with
// a still lake that mirrors them and a sky full of stars. The curtains are
// sampled as a few layers (cheap), and every movement is a whole turn per loop.
vec3 aurora(vec3 d) {
  vec3 c = vec3(0.);
  if (d.y < .02) return c;
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float h = .9 + fi * .14;                       // height of this layer
    vec2 uv = d.xz / d.y * h;
    float wave = sin(uv.x * .6 + LA + fi * .25) * .9 + sin(uv.x * 1.3 - 2. * LA + fi * .4) * .35;
    float band = exp(-abs(uv.y - 3. - wave) * 2.2);
    float rays = .55 + .45 * sin(uv.x * 9. + 3. * sin(LA + uv.x * .3));
    vec3 col = mix(vec3(.1, 1., .55), vec3(.55, .25, 1.), smoothstep(4., 14., fi));
    c += col * band * rays * (1. - fi / 18.) * .09;
  }
  return c * smoothstep(.02, .2, d.y);
}

float stars(vec3 d) {
  vec2 g = vec2(atan(d.z, d.x) * 160., d.y * 160.);
  vec2 id = floor(g), f = fract(g) - .5;
  float r = hash21(id);
  float tw = .6 + .4 * sin(LA * floor(1. + r * 3.) + r * 40.);
  return step(.985, r) * smoothstep(.12, .0, length(f)) * tw;
}

float ridge(float x, float seed) { return .25 * fbm(vec2(x * .35 + seed, seed)) + .08 * fbm(vec2(x * 1.7, seed + 3.)); }

vec3 sky(vec3 d) {
  vec3 c = mix(vec3(.02, .05, .12), vec3(.003, .006, .02), smoothstep(0., .7, d.y));
  c += aurora(d) + vec3(stars(d)) * smoothstep(.0, .1, d.y);
  // two ranges of snowy mountains on the horizon
  float ang = atan(d.x, d.z);
  float far = ridge(ang * 6., 1.) + .02, near = ridge(ang * 4., 7.) - .03;
  if (d.y < far) c = mix(vec3(.04, .07, .12), vec3(.25, .35, .45), smoothstep(far - .15, far, d.y) * .6) + aurora(vec3(d.x, .3, d.z)) * .15;
  if (d.y < near) c = vec3(.008, .012, .024) + vec3(.05, .08, .1) * smoothstep(near - .03, near, d.y);
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .25, 0.);
  vec3 rd = lookAt(ro, vec3(sin(LA) * .6, .55, 4.), p, 1.35, 0.);
  vec3 col;
  if (rd.y > -.0) col = sky(rd);
  else {
    // the lake: a mirror with slow ripples
    float t = ro.y / -rd.y;
    vec2 q = (ro + rd * t).xz;
    vec2 rip = vec2(sin(q.x * 3. + LA), sin(q.y * 4. - LA)) * .004 * exp(-t * .1);
    vec3 r = reflect(rd, normalize(vec3(rip.x, 1., rip.y)));
    col = sky(r) * .75 + vec3(.0, .01, .02);
  }
  outColor = finish(col * 1.2);
}
