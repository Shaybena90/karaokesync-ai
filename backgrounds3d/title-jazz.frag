// @out intro
// @seconds 7
// Title card backdrop "jazz": a smoky blue jazz club, a warm spotlight on the
// back wall, slow curling smoke and the glow of a bar far away.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.02, .04, .09), vec3(.005, .01, .03), length(p) * .6);
  col += vec3(1., .7, .4) * .25 * exp(-length((p - vec2(0., .15)) * vec2(.9, 1.3)) * 2.);  // the spotlight on the wall
  float smoke = fbm(vec2(p.x * 1.2 + fbm(p * 1.5 + uTime * .08), p.y * 1.6 - uTime * .12));
  col += vec3(.25, .4, .7) * smoothstep(.4, .9, smoke) * .3;
  // bar lights at the bottom, out of focus
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 c = vec2((fi - 4.5) * .38, -.8 + .03 * sin(fi * 3.));
    col += mix(vec3(1., .6, .25), vec3(.4, .6, 1.), step(.6, hash11(fi))) * smoothstep(.09, .06, length(p - c)) * .2 * (.8 + .2 * sin(uTime + fi));
  }
  outColor = finish(col);
}
