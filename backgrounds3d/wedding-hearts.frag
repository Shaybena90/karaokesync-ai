// Wedding hearts: glossy puffy hearts floating upwards and turning, in a soft
// pink and gold haze with blurred lights behind. Ray marched.
float dot2(vec2 v) { return dot(v, v); }
float sdHeart2(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.) return sqrt(dot2(p - vec2(.25, .75))) - sqrt(2.) / 4.;
  return sqrt(min(dot2(p - vec2(0., 1.)), dot2(p - .5 * max(p.x + p.y, 0.)))) * sign(p.x - p.y);
}
// a puffy heart: the 2D heart blown up like a pillow
float sdHeart(vec3 p) {
  p.y += .5;
  float d = sdHeart2(p.xy);
  float th = .2 * smoothstep(.0, -.35, d) + .02;
  return length(vec2(max(d + .05, 0.), p.z)) - th + min(d + .05, 0.) * .0;
}

const int N = 9;
vec4 heart(int i) {   // centre and size
  float k = float(i);
  float x = (k - 4.) * 1.05 + .3 * sin(k * 2.7);
  float z = 1.5 * sin(k * 1.9);
  float range = 9.;
  float y = mod(k * 3.7 + PHASE * range, range) - range * .5;   // rises one full range per loop
  return vec4(x + .25 * sin(LA + k), y, z, .8 + .35 * hash11(k));
}

vec2 map(vec3 p) {
  vec2 res = vec2(1e3, -1.);
  for (int i = 0; i < N; i++) {
    vec4 h = heart(i);
    vec3 q = (p - h.xyz) / h.w;
    q.xz *= rot(LA * (mod(float(i), 2.) < 1. ? 1. : -1.) + float(i));
    q.xy *= rot(.25 * sin(LA + float(i)));
    float d = sdHeart(q) * h.w * .8;
    if (d < res.x) res = vec2(d, float(i));
  }
  return res;
}

vec3 env(vec3 d) {
  vec3 c = mix(vec3(.35, .08, .2), vec3(.05, .01, .06), smoothstep(-.3, .8, d.y));
  c += vec3(1., .85, .6) * 3. * smoothstep(.4, .0, length(d - normalize(vec3(-.4, .7, -.6))));
  c += vec3(1., .5, .7) * 1.2 * smoothstep(.5, .0, length(d - normalize(vec3(.8, .2, -.5))));
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 0., -6.5);
  vec3 rd = lookAt(ro, vec3(0.), p, 1.6, 0.);
  // background: plum to rose, with big blurred golden lights drifting (on a circle: loops)
  vec3 col = mix(vec3(.35, .06, .18), vec3(.06, .01, .08), smoothstep(-1., 1., p.y));
  for (int i = 0; i < 9; i++) {
    float k = float(i);
    vec2 c = vec2(sin(k * 3.1) * 1.8, cos(k * 1.7) * .9) + .15 * vec2(cos(LA + k), sin(LA * 2. + k));
    float r = .12 + .12 * hash11(k);
    col += mix(vec3(1., .75, .45), vec3(1., .45, .6), hash11(k + 5.)) * .14 * smoothstep(r, r * .2, length(p - c));
  }
  float t = 3.;
  vec2 h = vec2(1.);
  for (int i = 0; i < 90; i++) {
    h = map(ro + rd * t);
    if (h.x < .002 || t > 14.) break;
    t += h.x;
  }
  if (t < 14.) {
    vec3 pos = ro + rd * t;
    vec2 e = vec2(.002, 0.);
    vec3 n = normalize(vec3(map(pos + e.xyy).x - map(pos - e.xyy).x, map(pos + e.yxy).x - map(pos - e.yxy).x, map(pos + e.yyx).x - map(pos - e.yyx).x));
    float k = h.y;
    vec3 base = mix(vec3(.9, .05, .2), vec3(1., .45, .65), hash11(k + 1.));
    if (hash11(k + 9.) > .75) base = vec3(1., .72, .35);   // a few golden hearts
    vec3 L = normalize(vec3(-.4, .7, -.6));
    float dif = max(dot(n, L), 0.);
    float fres = pow(1. - max(dot(-rd, n), 0.), 3.);
    float sss = pow(max(dot(rd, L), 0.), 2.) * .3 + .25 * (1. - abs(dot(n, rd)));   // light through the edges
    vec3 r = reflect(rd, n);
    col = base * (.15 + dif * .9 + sss) + env(r) * (.15 + .8 * fres) + vec3(1.) * pow(max(dot(r, L), 0.), 60.) * 2.;
  }
  // tiny sparkles in front
  vec2 g = p * 9. + vec2(0., PHASE * 9.);
  vec3 hs = hash32(floor(g));
  col += vec3(1., .85, .6) * step(.9, hs.x) * smoothstep(.08, .0, length(fract(g) - .5 - (hs.yz - .5) * .6)) * (.5 + .5 * sin(LA * 3. + hs.y * TAU));
  outColor = finish(col);
}
