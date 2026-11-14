// Floating cubes: flying through a field of slowly turning glass-edged cubes
// lit by neon lights. The field repeats every cell, and one loop flies a
// whole number of cells.
const float CELL = 4.;

float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }

vec3 cellRot(vec3 p, vec3 id) {
  vec3 h = hash33(id + 7.);
  p.xy *= rot(LA * (h.x < .5 ? 1. : -1.) + h.y * TAU);
  p.yz *= rot(LA * (h.z < .5 ? 1. : 2.) + h.x * TAU);
  return p;
}

float map(vec3 p, out vec3 id) {
  id = floor(p / CELL);
  id.z = mod(id.z, 4.);   // the same 4 rows of cubes come back each loop (the flight covers 4 cells)
  vec3 q = mod(p, CELL) - CELL * .5;
  vec3 h = hash33(id);
  vec3 off = (h - .5) * 2.2;
  // keep the flight path (the z axis) free of cubes
  if (length((id.xy + .5) * CELL + off.xy) < 1.3) return .6;
  q = cellRot(q - off, id);
  return sdBox(q, vec3(.4 + .15 * h.x), .06);
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 0., PHASE * CELL * 4.);        // between the cells: never inside a cube
  ro.xy += vec2(.35 * cos(LA), .3 * sin(LA));
  vec3 rd = lookAt(ro, ro + vec3(.2 * sin(LA), .1 * cos(LA), 1.), p, 1.3, .1 * sin(LA));
  vec3 col = vec3(0.);
  float t = .1;
  vec3 id;
  float d;
  for (int i = 0; i < 120; i++) {
    d = map(ro + rd * t, id);
    if (d < .002 || t > 34.) break;
    t += min(d, .6);
  }
  vec3 bg = mix(vec3(.01, .0, .03), vec3(.08, .01, .12), .5 + .5 * rd.y);
  col = bg;
  if (t < 34.) {
    vec3 pos = ro + rd * t;
    vec2 e = vec2(.002, 0);
    vec3 tmp;
    vec3 n = normalize(vec3(map(pos + e.xyy, tmp) - map(pos - e.xyy, tmp), map(pos + e.yxy, tmp) - map(pos - e.yxy, tmp), map(pos + e.yyx, tmp) - map(pos - e.yyx, tmp)));
    vec3 h = hash33(id);
    vec3 base = pal(h.y * .5 + .6, vec3(.5), vec3(.5), vec3(1.), vec3(.0, .33, .67));
    // glowing edges: the local box coordinates near two faces at once
    vec3 q = mod(pos, CELL) - CELL * .5 - (h - .5) * 2.2;
    q = cellRot(q, id);
    vec3 a = abs(q) / (.4 + .15 * h.x);
    float e2 = 0.;
    e2 += smoothstep(.88, .96, min(a.x, a.y)) + smoothstep(.88, .96, min(a.y, a.z)) + smoothstep(.88, .96, min(a.x, a.z));
    vec3 L1 = normalize(vec3(.6, .8, -.3)), L2 = normalize(vec3(-.7, -.2, -.5));
    float dif = max(dot(n, L1), 0.), dif2 = max(dot(n, L2), 0.);
    float spec = pow(max(dot(reflect(rd, n), L1), 0.), 40.);
    float fres = pow(1. - max(dot(-rd, n), 0.), 3.);
    vec3 c = base * .05 + vec3(1., .4, .8) * dif * .35 + vec3(.2, .6, 1.) * dif2 * .35 + spec * 1.5 + fres * base * .6;
    c += base * min(e2, 1.) * 2.5;
    col = mix(bg, c, exp(-.0025 * t * t));
  }
  outColor = finish(col);
}
