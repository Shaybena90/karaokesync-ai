// Golden gyroscope: three polished gold rings turning around a glowing core,
// in a dark room with floating dust that catches the light. Ray marched.
float sdTorus(vec3 p, vec2 t) { return length(vec2(length(p.xz) - t.x, p.y)) - t.y; }

vec3 ringSpace(vec3 p, int i) {
  float k = float(i);
  p.yz *= rot(LA * (k == 1. ? -1. : 1.) + k * .9);
  p.xy *= rot(LA * (k == 2. ? 2. : 1.) * .5 * (1. + k) + k * 1.4);
  return p;
}

vec2 map(vec3 p) {
  vec2 res = vec2(length(p) - .42, 3.);              // the core
  for (int i = 0; i < 3; i++) {
    float r = 1.05 + .42 * float(i);
    float d = sdTorus(ringSpace(p, i), vec2(r, .085));
    if (d < res.x) res = vec2(d, float(i));
  }
  return res;
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.0015, 0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

vec3 env(vec3 d) {
  vec3 c = vec3(.02, .015, .03) + vec3(.25, .15, .08) * smoothstep(-.2, 1., d.y);
  c += vec3(1., .85, .6) * 6. * smoothstep(.35, .0, length(d - normalize(vec3(-.5, .8, -.4))));
  c += vec3(.5, .6, 1.) * 2. * smoothstep(.3, .0, length(d - normalize(vec3(.8, .1, -.3))));
  c += vec3(.9, .4, .2) * 1.2 * smoothstep(.2, -.6, d.y);
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .5, -4.7);
  ro.xz *= rot(.3 * sin(LA));
  vec3 rd = lookAt(ro, vec3(0.), p, 1.8, .05 * sin(LA));
  vec3 col = mix(vec3(.05, .025, .02), vec3(.0), length(p) * .8);
  float t = 2.;
  vec2 h;
  for (int i = 0; i < 100; i++) {
    h = map(ro + rd * t);
    if (h.x < .001) break;
    t += h.x * .9;
    if (t > 9.) break;
  }
  float closest = length(cross(ro, rd));          // light around the core
  col += vec3(1., .55, .2) * .9 * exp(-max(closest - .42, 0.) * 2.5);
  if (t < 9.) {
    vec3 pos = ro + rd * t, n = normal(pos);
    if (h.y > 2.5) {
      col = vec3(1., .8, .45) * 4. + vec3(1., .4, .1) * pow(1. - max(dot(-rd, n), 0.), 2.) * 4.;
    } else {
      vec3 r = reflect(rd, n);
      float fres = .6 + .4 * pow(1. - max(dot(-rd, n), 0.), 5.);
      vec3 gold = vec3(1., .74, .35);
      // light from the core
      float core = max(dot(n, normalize(-pos)), 0.) / (1. + dot(pos, pos) * .6);
      col = env(r) * gold * fres + vec3(1., .6, .25) * core * 1.6 * gold;
    }
  }
  // dust in the light: soft points on a 3D grid that drift through one cell per loop
  for (int l = 0; l < 3; l++) {
    float z = 2. + float(l) * 1.6;
    vec3 q = ro + rd * z;
    vec2 g = q.xy * 2.2 + vec2(0., PHASE * 2.2 * (1. + float(l)) / 2.2 * 2.2);
    vec2 id = floor(g);
    vec3 hh = hash32(id + float(l) * 19.);
    vec2 off = fract(g) - .5 - (hh.xy - .5) * .7;
    col += vec3(1., .75, .4) * step(.7, hh.z) * smoothstep(.06, .0, length(off)) * .6 / (1. + float(l));
  }
  outColor = finish(col);
}
