// Sound waves: a landscape of glowing lines rising and falling like an audio
// signal, flying towards the viewer under a starry sky, in pink and cyan.
// The surface is a ray against a wavy height field (a short march).
float wave(vec2 x) {
  float beat = .5 + .5 * sin(LA * 8.);           // 8 beats per loop
  // along the flight (x.y) the waves repeat exactly every 40 rows, the distance flown in one loop
  float h = .35 * sin(x.x * .9 + LA * 2.) * sin(x.y * TAU * 2. / 40. + LA)
          + .2 * sin(x.x * 2.1 - LA * 3.) * cos(x.y * TAU * 4. / 40. + LA * 2.);
  return h * (.6 + .5 * beat * exp(-abs(x.x) * .25));
}

void main() {
  vec2 p = screen();
  float travel = PHASE * 40.;                    // 40 rows of lines per loop
  vec3 ro = vec3(0., 1.6, travel);
  vec3 rd = lookAt(ro, ro + vec3(0., -.35, 3.), p, 1.4, .05 * sin(LA));
  vec3 col = mix(vec3(.12, .02, .2), vec3(.0, .0, .03), smoothstep(-.1, .5, rd.y));
  vec2 g = floor(rd.xy * 220.);
  col += step(.996, hash21(g)) * .7 * smoothstep(.05, .3, rd.y);
  col += vec3(1., .3, .7) * .5 * exp(-abs(rd.y + .05) * 18.);   // horizon glow
  float t = 0.;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    vec3 q = ro + rd * t;
    float d = q.y - wave(q.xz);
    if (d < .01) { hit = true; break; }
    t += max(d * .5, .02);
    if (t > 60.) break;
  }
  if (hit) {
    vec3 q = ro + rd * t;
    float rows = q.z, cols = q.x * 1.5;
    float fwR = fwidth(rows), fwC = fwidth(cols);
    float lr = smoothstep(.05 + fwR, .05 - fwR, abs(fract(rows) - .5) - .45 + .45) ;
    lr = smoothstep(fwR * 1.5, 0., abs(fract(rows + .5) - .5) - .02);
    float lc = smoothstep(fwC * 1.5, 0., abs(fract(cols + .5) - .5) - .01) * .35;
    float hgt = wave(q.xz);
    vec3 c = mix(vec3(0., .9, 1.), vec3(1., .2, .8), smoothstep(-.3, .4, hgt));
    float fog = exp(-t * .06);
    col = mix(col, vec3(.01, .0, .03) + c * (lr * 1.8 + lc) + c * .05, fog);
  }
  outColor = finish(col);
}
