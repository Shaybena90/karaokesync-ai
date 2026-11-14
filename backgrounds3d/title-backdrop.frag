// @out intro
// Backdrop of the song title card (the title itself is drawn by the video
// renderer, per song): deep black-blue velvet, soft golden light from above,
// gold bokeh drifting up and fine sparkling dust. A 10 s loop.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.03, .02, .05), vec3(.004, .004, .012), smoothstep(-1., 1.2, p.y));
  col += vec3(.35, .25, .1) * .25 * exp(-length(p - vec2(0., .05)) * 1.6);          // warm glow behind the title
  // light rays from the top, swaying slowly
  float a = atan(p.x, 1.6 - p.y);
  float rays = .5 + .5 * sin(a * 18. + sin(LA) * .6) * sin(a * 7. - LA);
  col += vec3(1., .8, .45) * .05 * rays * smoothstep(-.6, 1.2, p.y);
  // gold bokeh rising: 3 layers, each rises a whole number of cells per loop
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float scale = 2.2 + fl * 1.6;
    float shift = 4. + 2. * fl;                                   // cells risen per loop
    vec2 g = p * scale + vec2(fl * 4.1, -PHASE * shift);
    vec2 id = floor(g);
    vec3 h = hash32(vec2(id.x, mod(id.y, shift)) + fl * 9.);
    vec2 c = fract(g) - .5 - (h.xy - .5) * .6;
    float r = .14 + .1 * h.z;
    float bok = smoothstep(r, r * .5, length(c)) * step(.8, h.z);
    col += mix(vec3(1., .78, .4), vec3(1., .6, .3), h.x) * bok * (.07 + .05 * fl) * (.7 + .3 * sin(LA + h.y * 6.28));
  }
  // fine dust that twinkles
  vec2 g = p * 40.;
  vec3 h = hash32(floor(g));
  col += vec3(1., .85, .55) * step(.985, h.x) * smoothstep(.25, .0, length(fract(g) - .5)) * (.5 + .5 * sin(LA * floor(1. + 3. * h.y) + h.z * 6.28)) * .8;
  outColor = finish(col);
}
