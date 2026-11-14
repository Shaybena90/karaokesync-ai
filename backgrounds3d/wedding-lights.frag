// Fairy lights: curtains of warm little lights hanging in the dark, swaying
// gently, at different depths, the far ones softly out of focus (like a wedding
// canopy at night). Each string is a curve; each light a glowing point.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.05, .02, .03), vec3(.01, .005, .012), smoothstep(-1., 1., p.y));
  col += vec3(.25, .12, .06) * .25 * exp(-length(p - vec2(0., -.3)) * 1.5);
  // three layers: far (blurred, small), middle, near (big, sharp)
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = mix(1.7, .75, fl / 2.);        // how much screen one unit covers
    float blur = mix(.035, .006, fl / 2.);
    float bright = mix(.45, 1.1, fl / 2.);
    vec2 q = p * scale + vec2(fl * 1.37, 0.);
    // strings every .55 units, hanging from the top with a gentle sway
    float sid = floor(q.x / .55 + .5);
    for (int s = -1; s <= 1; s++) {
      float id = sid + float(s);
      float hs = hash11(id * 7.3 + fl * 31.);
      float x0 = id * .55 + (hs - .5) * .2;
      float sway = .04 * sin(LA + hs * TAU) * (1.2 - q.y);
      float xs = x0 + sway;
      // the wire
      col += vec3(.25, .15, .08) * .02 * bright * smoothstep(.006 + blur * .3, .0, abs(q.x - xs)) * step(-1.6, q.y);
      // lights along the string, every .22 units, twinkling
      float ly = floor(q.y / .22 + .5);
      for (int j = -1; j <= 1; j++) {
        float lj = ly + float(j);
        vec2 lp = vec2(xs + .04 * sin(LA + hs * TAU) * (1.2 - lj * .22) - sway, lj * .22);
        lp.x = x0 + .04 * sin(LA + hs * TAU) * (1.2 - lp.y);
        float h2 = hash11(lj * 13.1 + id * 3.7 + fl * 5.);
        if (lp.y < -1.6 + h2 * .8) continue;     // strings have different lengths
        float tw = .65 + .35 * sin(LA * floor(1. + 3. * h2) + h2 * TAU);
        float d = length(q - lp);
        float r = .018 + blur;
        vec3 lc = mix(vec3(1., .72, .4), vec3(1., .85, .65), h2);
        col += lc * bright * tw * (smoothstep(r, r * .3, d) * 1.6 + .12 * exp(-d / (r * 2.5)));
      }
    }
  }
  // slow floating golden dust
  vec2 g = p * 6. + vec2(.0, -PHASE * 6.);
  vec3 hs = hash32(floor(g));
  col += vec3(1., .8, .5) * .5 * step(.92, hs.x) * smoothstep(.07, .0, length(fract(g) - .5 - (hs.yz - .5) * .6));
  outColor = finish(col);
}
