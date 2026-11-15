// @out intro
// Title card backdrop "space": a coloured nebula slowly turning, thousands of
// stars twinkling, and a blue glow behind the title. 10 s loop.
void main() {
  vec2 p = screen();
  vec2 c = vec2(cos(LA), sin(LA)) * .35;                             // sample the clouds on a circle: loops
  float n1 = fbm(p * 1.2 + c + 2.), n2 = fbm(p * 2.3 - c * .8 + 9.), n3 = fbm(p * .8 + c * .5 + 5.);
  vec3 col = vec3(.005, .008, .025);
  col += vec3(.1, .35, .8) * pow(n1, 2.4) * .9 + vec3(.6, .15, .7) * pow(n2, 3.) * .8 + vec3(.0, .5, .55) * pow(n3, 3.) * .5;
  col *= .55 + .45 * smoothstep(1.8, .2, length(p));
  col += vec3(.3, .55, 1.) * .18 * exp(-length(p * vec2(.6, 1.)) * 2.);
  for (int l = 0; l < 3; l++) {
    vec2 g = p * (25. + 20. * float(l)) + float(l) * 11.;
    vec2 id = floor(g);
    vec3 h = hash32(id + float(l) * 3.);
    float tw = .5 + .5 * sin(LA * floor(1. + 3. * h.x) + h.y * 6.28);
    col += mix(vec3(.7, .85, 1.), vec3(1.), h.y) * step(.97, h.z) * smoothstep(.25, .0, length(fract(g) - .5 - (h.xy - .5) * .5)) * tw * (.9 - .25 * float(l));
  }
  outColor = finish(col);
}
