// Retro terrain: flying low over glowing wireframe mountains towards a
// striped sun. The ground repeats along z, and one loop flies one repeat.
const float PZ = 24.;   // the terrain repeats every PZ units along z

float height(vec2 q) {
  float side = smoothstep(.8, 3.5, abs(q.x));                 // a flat road in the middle
  float n = tfbm(vec2(q.x * .375 + 40., q.y * .375), vec2(1e3, PZ * .375));   // PZ * .375 = 9 whole noise cells
  return side * (n * n * 5. + .2 * abs(q.x) * side);
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(.25 * sin(LA), 1.15, PHASE * PZ);
  vec3 rd = lookAt(ro, ro + vec3(.0, -.12, 1.), p, 1.6, .02 * sin(LA));

  vec3 sky = mix(vec3(.02, .0, .08), vec3(.55, .05, .35), smoothstep(.45, -.05, rd.y));
  // the sun, with stripes cut out of its lower half
  vec2 sp = vec2(rd.x / rd.z, rd.y / rd.z - .16);
  float sd = length(sp);
  float stripes = step(.0, sin((sp.y + PHASE * .02) * 95.)) + step(.02, sp.y);
  vec3 sunCol = mix(vec3(1., .2, .45), vec3(1., .85, .25), smoothstep(-.12, .2, sp.y));
  vec3 col = sky + sunCol * smoothstep(.205, .2, sd) * min(stripes, 1.) * 1.6;
  col += vec3(1., .3, .5) * .4 * exp(-sd * 3.5);
  // stars
  vec2 sc = rd.xy / max(rd.z, .1) * 60.;
  float st = hash21(floor(sc));
  col += step(.985, st) * smoothstep(.15, .0, length(fract(sc) - .5)) * smoothstep(.1, .35, rd.y) * .9;

  // march the height field
  float t = .2, hit = -1.;
  for (int i = 0; i < 140; i++) {
    vec3 q = ro + rd * t;
    float d = q.y - height(q.xz);
    if (d < .002 * t) { hit = t; break; }
    t += max(.01, d * .45);
    if (t > 60.) break;
  }
  if (hit > 0.) {
    vec3 q = ro + rd * hit;
    vec2 g = q.xz * vec2(1., 1.);
    vec2 fw = fwidth(g) * 1.2;
    vec2 a = abs(fract(g + .5) - .5) / max(fw, 1e-4);
    float line = 1. - min(min(a.x, a.y), 1.);
    float fade = exp(-.022 * hit);
    vec3 lineCol = mix(vec3(.1, .8, 1.), vec3(1., .2, .8), smoothstep(.0, 3., q.y));
    vec3 ground = vec3(.015, .0, .035) + vec3(.05, .0, .07) * smoothstep(3., .0, abs(q.x)) + vec3(.06, .0, .08) * smoothstep(.0, 4., q.y);
    vec3 c = ground + lineCol * line * 2.2 + lineCol * .15 * exp(-12. * min(a.x * fw.x, a.y * fw.y));
    col = mix(vec3(.25, .03, .22), c, fade);
  }
  outColor = finish(col);
}
