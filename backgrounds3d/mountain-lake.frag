// Mountain lake: snowy peaks at golden hour, mirrored in a calm lake with soft
// ripples, under slowly drifting clouds. The mountains are a ray-marched
// height field; the lake reflects them.
float hgt(vec2 q) {
  float n = fbm(q * .18 + vec2(3.1, 7.7));
  float ridge = 1. - abs(fbm(q * .09 + 11.) * 2. - 1.);
  float far = smoothstep(4., 18., q.y);              // flat shore, mountains behind
  return far * (ridge * ridge * 7. + n * 3.) - .4;
}

vec3 sky(vec3 d) {
  vec3 sun = normalize(vec3(.5, .12, 1.));
  float s = max(dot(d, sun), 0.);
  vec3 c = mix(vec3(1., .5, .25), vec3(.2, .3, .62), smoothstep(.0, .4, d.y));
  c += vec3(1., .7, .4) * pow(s, 12.) * .6 + vec3(1., .9, .7) * pow(s, 500.) * 8.;
  vec2 cuv = d.xz / max(d.y, .06) * .5 + vec2(cos(LA), sin(LA)) * .25;
  float cl = smoothstep(.5, .85, fbm(cuv * 1.5 + 2.)) * smoothstep(.02, .2, d.y);
  return mix(c, vec3(1., .85, .75) * (.7 + .5 * pow(s, 3.)), cl * .7);
}

vec3 march(vec3 ro, vec3 rd, out float hitT) {
  float t = .5;
  hitT = -1.;
  for (int i = 0; i < 110; i++) {
    vec3 q = ro + rd * t;
    float d = q.y - hgt(q.xz);
    if (d < .003 * t) { hitT = t; break; }
    t += max(.02, d * .5);
    if (t > 80.) break;
  }
  if (hitT < 0.) return sky(rd);
  vec3 q = ro + rd * hitT;
  vec2 e = vec2(.05, 0.);
  vec3 n = normalize(vec3(hgt(q.xz - e.xy) - hgt(q.xz + e.xy), 2. * e.x, hgt(q.xz - e.yx) - hgt(q.xz + e.yx)));
  vec3 sun = normalize(vec3(.5, .12, 1.));
  float dif = max(dot(n, normalize(vec3(.5, .45, -.4))), 0.);
  float snow = smoothstep(3.2, 4.5, q.y + n.y * 1.5);
  vec3 rock = mix(vec3(.18, .14, .14), vec3(.1, .16, .1), smoothstep(1., -.2, q.y));
  vec3 c = mix(rock, vec3(.9, .86, .9), snow) * (.18 + dif * vec3(1.35, .9, .65));
  return mix(c, sky(rd) * vec3(.95, .9, 1.), 1. - exp(-.00025 * hitT * hitT));   // haze
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(1.5 * sin(LA), 1.2, -2.);
  vec3 rd = lookAt(ro, vec3(.0, 2.2, 20.), p, 1.5, 0.);
  float tm;
  vec3 col;
  float tl = rd.y < 0. ? -ro.y / rd.y : -1.;
  if (tl > 0.) {
    vec3 q = ro + rd * tl;
    // lake: ripples (moving whole turns per loop) bend the reflection
    vec2 w = vec2(sin(q.x * 3. + q.z * 1.3 - LA * 2.), cos(q.z * 4. - q.x * 1.1 + LA * 3.)) * .012;
    vec3 n = normalize(vec3(w.x, 1., w.y));
    vec3 r = reflect(rd, n);
    float fres = .25 + .75 * pow(1. - max(-rd.y, 0.), 4.);
    col = mix(vec3(.02, .06, .08), march(q + vec3(0., .01, 0.), r, tm), fres);
  } else {
    col = march(ro, rd, tm);
  }
  outColor = finish(col);
}
