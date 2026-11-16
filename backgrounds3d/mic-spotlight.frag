// Microphone in the spotlight: a chrome stage microphone on its stand, lit by
// a moving spotlight through haze, with coloured stage lights behind it.
// A small ray-marched scene inside a bounding box, so it stays fast.
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)) - r; }

float mic(vec3 p, out float part) {
  p.xz = rot(.25 * sin(LA)) * p.xz;
  vec3 q = p - vec3(0., 1.1, 0.);
  q.yz = rot(-.35) * q.yz;
  float head = length(q - vec3(0., .55, 0.)) - .34;                    // the grille ball
  float body = sdCapsule(q, vec3(0., -.4, 0.), vec3(0., .3, 0.), .14 - .04 * smoothstep(.3, -.4, q.y));
  float ring = length(vec2(length(q.xz) - .2, q.y - .28)) - .035;
  float stand = sdCapsule(p, vec3(0., -3., 0.), vec3(0., .75, -.05), .045);
  float d = min(min(head, body), min(ring, stand));
  part = d == head ? 0. : d == ring ? 2. : 1.;
  return d;
}

vec3 normalAt(vec3 p) {
  float k; vec2 e = vec2(.002, 0.);
  return normalize(vec3(mic(p + e.xyy, k) - mic(p - e.xyy, k), mic(p + e.yxy, k) - mic(p - e.yxy, k), mic(p + e.yyx, k) - mic(p - e.yyx, k)));
}

vec3 stageBack(vec3 d) {
  vec3 c = vec3(.01, .005, .02);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = (fi - 2.5) * .35 + .12 * sin(LA + fi * 1.7);
    vec3 beam = normalize(vec3(sin(a), -.8, 1.));
    float s = pow(max(dot(normalize(d + vec3(0., .4, 0.)), beam), 0.), 40.);
    c += pal(fi / 6. + PHASE, vec3(.5), vec3(.5), vec3(1.), vec3(0., .33, .67)) * s * 1.4;
  }
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(.6 * sin(LA), 1.75, -2.4);
  vec3 rd = lookAt(ro, vec3(0., 1.45, 0.), p, 2.1, 0.);
  vec3 col = stageBack(rd);
  vec3 spot = normalize(vec3(.6 * sin(LA), 2.4, -1.2));
  // haze lit by the spotlight cone (a few samples)
  float haze = 0.;
  for (int i = 0; i < 24; i++) {
    vec3 q = ro + rd * (1. + float(i) * .22);
    vec3 v = q - spot * 6.;
    float cone = pow(max(dot(normalize(-v), spot), 0.), 60.);
    haze += cone * (.6 + .4 * noise(q.xz * 2. + q.y + vec2(cos(LA), sin(LA))));
  }
  col += vec3(1., .9, .75) * haze * .009;
  // march the microphone
  float t = 1.5, part = 0.;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = mic(ro + rd * t, part);
    if (d < .001) { hit = true; break; }
    t += d;
    if (t > 7.) break;
  }
  if (hit) {
    vec3 q = ro + rd * t, n = normalAt(q);
    if (part == 0.) {
      // the mesh grille: tiny holes
      vec3 l = q - vec3(0., 1.6, 0.);
      vec2 uv = vec2(atan(l.z, l.x), acos(clamp(l.y / length(l), -1., 1.))) * vec2(18., 22.);
      float holes = smoothstep(.3, .15, length(fract(uv) - .5));
      n = normalize(n + .15 * vec3(holes));
      part = holes > .5 ? 3. : 0.;
    }
    vec3 r = reflect(rd, n);
    float spec = pow(max(dot(r, spot), 0.), part == 1. ? 30. : 80.);
    // chrome: sharp reflections of the stage and of two soft-box strips
    float strips = smoothstep(.06, .0, abs(r.y - .35)) * .8;
    vec3 env = stageBack(r) * 2.5 + mix(vec3(.01), vec3(.08), smoothstep(-.3, .8, r.y)) + vec3(1.) * strips;
    vec3 metal = part == 1. ? vec3(.08) : part == 3. ? vec3(.12) : vec3(.6, .62, .66);
    col = metal * (env + .08 * max(dot(n, spot), 0.)) + vec3(1., .95, .85) * spec * 2.5;
    col += vec3(.6, .3, 1.) * pow(1. - max(dot(n, -rd), 0.), 3.) * .25;    // rim
  }
  outColor = finish(col * 1.1);
}
