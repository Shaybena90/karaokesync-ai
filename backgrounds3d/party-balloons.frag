// Party balloons: shiny balloons of many colours rising and swaying, with
// strings, in front of a warm party glow. Ray vs ellipsoid, found exactly.
const int N = 11;
vec4 balloon(int i) {
  float k = float(i);
  float range = 10.;
  float y = mod(k * 2.9 + PHASE * range, range) - range * .5;    // one full range per loop
  float z = 1. + 2.5 * hash11(k + 2.);
  float x = (k / float(N - 1) - .5) * 7.5 + (hash11(k) - .5) * .6 + .3 * sin(LA + k * 1.3);
  return vec4(x, y, z, .7);
}

float hitBalloon(vec3 ro, vec3 rd, vec4 b, out vec3 n) {
  vec3 sc = vec3(1., 1.22, 1.) * b.w;   // a little taller than wide
  vec3 o = (ro - b.xyz) / sc, d = rd / sc;
  float a = dot(d, d), bb = dot(o, d), c = dot(o, o) - 1., h = bb * bb - a * c;
  if (h < 0.) return -1.;
  float t = (-bb - sqrt(h)) / a;
  n = normalize((o + d * t) / sc);
  return t;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 0., -6.);
  vec3 rd = lookAt(ro, vec3(0., 0., 0.), p, 1.5, 0.);
  vec3 col = mix(vec3(.45, .12, .25), vec3(.08, .03, .15), smoothstep(-1., 1., p.y));
  col += vec3(1., .6, .3) * .3 * exp(-length(p - vec2(.0, -.8)) * 1.2);
  // bokeh party lights
  for (int i = 0; i < 16; i++) {
    float k = float(i);
    vec2 c = vec2(sin(k * 2.3) * 1.9, cos(k * 1.3) * 1.) + .1 * vec2(cos(LA + k), sin(LA + k));
    float r = .07 + .09 * hash11(k);
    col += pal(hash11(k + 3.), vec3(.6), vec3(.4), vec3(1.), vec3(.0, .33, .67)) * .3 * smoothstep(r, r * .6, length(p - c));
  }
  float best = 1e9; int bi = -1; vec3 bn;
  for (int i = 0; i < N; i++) {
    vec3 n;
    float t = hitBalloon(ro, rd, balloon(i), n);
    if (t > 0. && t < best) { best = t; bi = i; bn = n; }
  }
  // strings (drawn under the balloons): on screen a balloon at depth z appears at xy * zoom / (z + D)
  for (int i = 0; i < N; i++) {
    vec4 b = balloon(i);
    float sc = 1.5 / (b.z - ro.z);
    vec2 top = vec2(b.x, b.y - 1.22 * b.w) * sc;
    float y = top.y - p.y;
    if (y > 0. && y < 2.2 * sc) {
      float x = top.x + .025 * sin(y / sc * 2.5 + LA * 2. + float(i)) * sc * 4. * min(y / sc, 1.);
      col = mix(col, vec3(.9), .55 * smoothstep(.005, .0, abs(p.x - x)));
    }
  }
  if (bi >= 0) {
    float k = float(bi);
    vec3 base = pal(hash11(k + 7.), vec3(.6), vec3(.45), vec3(1.), vec3(.0, .33, .67));
    vec3 L = normalize(vec3(-.5, .6, -.6));
    float dif = max(dot(bn, L), 0.);
    float fres = pow(1. - max(dot(-rd, bn), 0.), 3.);
    vec3 r = reflect(rd, bn);
    float spec = pow(max(dot(r, L), 0.), 80.);
    float glow = pow(max(dot(rd, L), 0.), 2.) * .4 + .35 * (1. - abs(dot(bn, rd)));
    col = base * (.12 + .8 * dif + glow) + vec3(1.) * spec * 2.5 + vec3(1., .8, .9) * fres * .25;
  }
  outColor = finish(col);
}
