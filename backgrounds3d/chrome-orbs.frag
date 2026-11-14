// Chrome orbs: glossy spheres dancing over a mirror floor in a dark studio,
// with coloured light strips reflected in them. All found exactly (ray vs sphere).
const int N = 6;

vec4 sphere(int i) {
  float k = float(i);
  float a = LA * (k < 3. ? 1. : -1.) + k * TAU / 6.;
  float r = 1.55 + .45 * sin(LA * 2. + k);
  float rad = .5 + .22 * hash11(k + 3.);
  return vec4(r * cos(a), rad + .15 + .45 * (.5 + .5 * sin(LA * 3. + k * 2.1)), r * sin(a), rad);
}

// angle (0..pi) between the horizontal direction of d and the compass angle c
float away(vec3 d, float c) { return acos(clamp(dot(normalize(d.xz + 1e-5), vec2(cos(c), sin(c))), -1., 1.)); }

vec3 backdrop(vec3 d) {
  vec3 c = mix(vec3(.10, .04, .22), vec3(.01, .01, .04), smoothstep(-.05, .6, d.y));   // purple horizon glow
  return c + vec3(.25, .08, .3) * exp(-abs(d.y) * 12.);
}

// What the mirrors see: the backdrop plus studio lights (not visible directly).
vec3 env(vec3 d) {
  vec3 c = backdrop(d);
  c += vec3(1., .25, .65) * 4. * smoothstep(.12, .0, abs(d.y - .3)) * smoothstep(.9, .3, away(d, 1.2));
  c += vec3(.15, .75, 1.) * 4. * smoothstep(.12, .0, abs(d.y - .22)) * smoothstep(.9, .3, away(d, -1.4));
  c += vec3(1., .95, .9) * 6. * smoothstep(.15, .0, abs(d.y - .85)) * smoothstep(1.2, .4, away(d, 2.6));
  c += vec3(1., .7, .3) * 2.5 * smoothstep(.1, .0, abs(d.y - .15)) * smoothstep(.7, .2, away(d, 3.));
  return c;
}

float hitSphere(vec3 ro, vec3 rd, vec4 s) {
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd), c = dot(oc, oc) - s.w * s.w, h = b * b - c;
  if (h < 0.) return -1.;
  float t = -b - sqrt(h);
  return t > 1e-3 ? t : -1.;
}

// Closest sphere along the ray: (t, index); t < 0 when none.
vec2 trace(vec3 ro, vec3 rd) {
  vec2 best = vec2(-1., -1.);
  for (int i = 0; i < N; i++) {
    float t = hitSphere(ro, rd, sphere(i));
    if (t > 0. && (best.x < 0. || t < best.x)) best = vec2(t, float(i));
  }
  return best;
}

vec3 tint(float k) { return mix(vec3(1.), pal(k / 6., vec3(.7), vec3(.3), vec3(1.), vec3(.0, .33, .67)), .55); }

vec3 shadeSphere(vec3 ro, vec3 rd, vec2 h, int depth) {
  vec3 pos = ro + rd * h.x;
  vec3 n = normalize(pos - sphere(int(h.y)).xyz);
  vec3 r = reflect(rd, n);
  float fres = .25 + .75 * pow(1. - max(dot(-rd, n), 0.), 4.);
  vec3 c = env(r);
  if (depth == 0) {
    vec2 h2 = trace(pos, r);
    if (h2.x > 0.) c = tint(h2.y) * env(reflect(r, normalize(pos + r * h2.x - sphere(int(h2.y)).xyz))) * .8;
  }
  return c * tint(h.y) * (.6 + .6 * fres);
}

void main() {
  vec2 p = screen();
  float ca = .4 + .45 * sin(LA);
  vec3 ro = vec3(4.6 * sin(ca), 1.5 + .25 * cos(LA), -4.6 * cos(ca));
  vec3 rd = lookAt(ro, vec3(0., .75, 0.), p, 1.5, 0.);
  vec3 col = backdrop(rd);
  vec2 h = trace(ro, rd);
  float tFloor = rd.y < 0. ? -ro.y / rd.y : -1.;
  if (h.x > 0. && (tFloor < 0. || h.x < tFloor)) {
    col = shadeSphere(ro, rd, h, 0);
  } else if (tFloor > 0.) {
    vec3 pos = ro + rd * tFloor;
    vec3 r = reflect(rd, vec3(0, 1, 0));
    vec2 hr = trace(pos, r);
    vec3 refl = hr.x > 0. ? shadeSphere(pos, r, hr, 1) : backdrop(r);
    // soft contact shadows and a faint tile pattern
    float ao = 1.;
    for (int i = 0; i < N; i++) {
      vec4 s = sphere(i);
      float d = length(pos.xz - s.xz);
      ao *= 1. - .7 * exp(-pow(d / (s.w * 1.4), 2.)) * s.w / max(s.y, s.w);
    }
    vec2 g = abs(fract(pos.xz * .5) - .5);
    float tile = smoothstep(.0, .02, min(g.x, g.y));
    float fres = .15 + .6 * pow(1. - max(-rd.y, 0.), 3.);
    vec3 fl = (vec3(.02, .015, .04) * tile + refl * fres) * ao;
    col = mix(backdrop(rd), fl, exp(-.012 * tFloor * tFloor));   // the floor fades into the backdrop
  }
  outColor = finish(col);
}
