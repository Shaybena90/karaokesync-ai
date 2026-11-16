// Laser show: bright club lasers fanning out from the stage through haze,
// sweeping and flashing to the beat, over a dark crowd silhouette.
float beam(vec2 p, vec2 o, float ang, float width) {
  vec2 d = vec2(sin(ang), cos(ang));
  vec2 q = p - o;
  float along = dot(q, d);
  float off = abs(q.x * d.y - q.y * d.x);
  return step(0., along) * exp(-off / (width * (1. + along * .4))) / (1. + along * .6);
}

void main() {
  vec2 p = screen();
  vec3 col = vec3(.005, .0, .015);
  float beat = pow(.5 + .5 * cos(LA * 16.), 6.);              // 16 beats per loop
  float haze = .6 + .4 * fbm(p * 2. + vec2(cos(LA), sin(LA)) * .5);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 o = vec2((fk - 1.) * 1.1, -1.05);
    vec3 c = fk == 0. ? vec3(1., .1, .35) : fk == 1. ? vec3(.2, 1., .4) : vec3(.25, .4, 1.);
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float spread = (fi - 4.) * .13 * (1. + .5 * sin(LA * 2. + fk));
      float sweep = .5 * sin(LA * (fk + 1.) + fk * 2.);
      float on = step(.3, fract(fi * .37 + PHASE * 8. + fk * .3));      // beams switching on and off
      col += c * beam(p, o, spread + sweep, .006) * haze * on * (.5 + .9 * beat);
    }
    col += c * exp(-length(p - o) * 6.) * (.4 + beat);
  }
  // the crowd's heads and raised hands
  float x = p.x * 7.;
  float crowd = -.88 + .07 * sin(floor(x) * 12.3) + .1 * smoothstep(.3, 0., abs(fract(x) - .5)) * (.6 + .4 * sin(LA * 4. + floor(x)));
  float hands = step(.8, hash11(floor(x * 2.))) * smoothstep(.04, .0, abs(fract(x * 2.) - .5) - .02) * step(p.y, crowd + .22 + .05 * sin(LA * 8. + floor(x * 2.)));
  if (p.y < crowd || hands > .5) col = vec3(.0) + col * .05;
  outColor = finish(col);
}
