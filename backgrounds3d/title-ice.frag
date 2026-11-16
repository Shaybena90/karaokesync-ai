// @out intro
// @seconds 7
// Title card backdrop "ice": frosty blue-white light with ice crystals
// growing at the edges of the frame and slow drifting snow.
float frost(vec2 p) {
  float f = 0.;
  vec2 q = p * 3.;
  for (int i = 0; i < 4; i++) {
    f += abs(noise(q) - .5) * 2. / float(i + 1);
    q = rot(.7) * q * 2.1;
  }
  return f;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.05, .12, .22), vec3(.01, .03, .07), length(p) * .6);
  col += vec3(.4, .7, 1.) * .12 * exp(-length(p) * 1.5);
  float edge = smoothstep(.75, 1.4, max(abs(p.x) * .62, abs(p.y)) + .2 * frost(p * .6));
  col += vec3(.75, .9, 1.) * edge * (.12 + .3 * smoothstep(.55, .8, frost(p))) * (.9 + .1 * sin(uTime));
  vec2 g = p * 16. + vec2(sin(uTime * .3) * .5, uTime * 1.2);
  vec2 id = floor(g);
  vec3 h = hash33(vec3(id, 3.));
  col += vec3(.9, .95, 1.) * step(.8, h.z) * smoothstep(.1, .02, length(fract(g) - .5 - (h.xy - .5) * .5)) * .6;
  outColor = finish(col);
}
