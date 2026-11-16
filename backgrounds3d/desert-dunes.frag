// Desert dunes at sunset: wind-shaped sand dunes rolling to the horizon under
// a huge low sun, with sand blowing off the crests and the first stars.
float dunes(vec2 x) {
  x += vec2(2.5 * fbm(x * .08), 1.5 * fbm(x * .07 + 9.));   // wind-bent, not straight rows
  float h = .0;
  h += .5 * (1. - abs(sin(x.x * .25 + sin(x.y * .15) * 1.5)));
  h += .25 * (1. - abs(sin(x.x * .55 + x.y * .2 + 1.)));
  h += .05 * sin(x.x * 4. + x.y * 3.);
  return h * h * 1.4;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 1.2, 0.);
  vec3 rd = lookAt(ro, ro + vec3(sin(LA) * .4, -.08, 2.), p, 1.5, 0.);
  vec3 sun = normalize(vec3(.25, .06, 1.));
  float s = max(dot(rd, sun), 0.);
  vec3 col = mix(vec3(1., .45, .18), vec3(.12, .08, .3), smoothstep(-.05, .45, rd.y));
  col = mix(col, vec3(.02, .02, .08), smoothstep(.45, 1., rd.y));
  col += vec3(1., .6, .25) * pow(s, 12.) * .7 + vec3(1., .85, .6) * smoothstep(.9985, .9992, s) * 3.;
  vec2 st = floor(rd.xy / max(rd.z, .1) * 200.);
  col += step(.997, hash21(st)) * smoothstep(.25, .6, rd.y) * .6;
  float t = .1;
  bool hit = false;
  for (int i = 0; i < 100; i++) {
    vec3 q = ro + rd * t;
    float d = q.y - dunes(q.xz);
    if (d < .002 * t) { hit = true; break; }
    t += d * .5;
    if (t > 80.) break;
  }
  if (hit) {
    vec3 q = ro + rd * t;
    vec2 e = vec2(.01, 0.);
    vec3 n = normalize(vec3(dunes(q.xz - e.xy) - dunes(q.xz + e.xy), 2. * e.x, dunes(q.xz - e.yx) - dunes(q.xz + e.yx)));
    float dif = max(dot(n, sun), 0.);
    vec3 sand = vec3(.95, .55, .3) * (dif * 1.2 + .3) + vec3(.3, .12, .15) * (1. - dif) * .3;
    sand += vec3(1., .7, .4) * pow(max(dot(reflect(rd, n), sun), 0.), 30.) * .3;   // glints
    sand *= .93 + .07 * sin(q.x * 40. + q.z * 30. + 3. * fbm(q.xz));              // ripples
    col = mix(sand, col, smoothstep(10., 70., t));
    // sand blowing off the crests
    float crest = smoothstep(.75, 1., dunes(q.xz) / 1.4);
    col += vec3(1., .7, .45) * crest * .25 * fbm(q.xz * 3. + vec2(cos(LA), sin(LA)) * 2.);
  }
  outColor = finish(col);
}
