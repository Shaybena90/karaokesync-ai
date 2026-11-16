// @out intro
// @seconds 7
// Title card backdrop "fire": flames rising from the bottom of the frame,
// hot glowing embers flying up and a smoky dark top for the words.
void main() {
  vec2 p = screen();
  vec3 col = vec3(.02, .005, .0);
  // flames: noise stretched upwards and moving up
  vec2 q = vec2(p.x * 2., p.y * 1.3 - uTime * 1.2);
  float n = fbm(q + fbm(q * 1.5 + uTime * .3));
  float h = (p.y + 1.05) * 1.6;
  float flame = smoothstep(.0, .9, n * 1.6 - h);
  col += mix(vec3(1., .25, .02), vec3(1., .85, .4), flame) * flame * 2.;
  col += vec3(.8, .2, .02) * exp(-max(p.y + .9, 0.) * 2.5) * .45;       // the glow above the fire
  // embers
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = vec2(p.x * (10. + fi * 8.), p.y * (10. + fi * 8.) - uTime * (3. + fi * 2.));
    vec2 id = floor(g);
    vec3 r = hash33(vec3(id, fi));
    vec2 c = id + .5 + .3 * vec2(sin(uTime * 3. + r.x * 9.), 0.);
    float e = smoothstep(.12, .0, length(g - c)) * step(.88, r.z);
    col += vec3(1., .55, .15) * e * (1.2 - (p.y + 1.) * .45);
  }
  // smoke darkening the top
  col *= .7 + .3 * fbm(vec2(p.x * 1.5, p.y * 1.2 - uTime * .25) + 5.);
  outColor = finish(col);
}
