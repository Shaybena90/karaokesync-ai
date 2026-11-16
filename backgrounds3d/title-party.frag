// @out intro
// @seconds 7
// Title card backdrop "party": colourful confetti falling and spinning in
// front of disco lights sweeping a dark club. Happy and loud.
void main() {
  vec2 p = screen();
  vec3 col = vec3(.02, .01, .04);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 o = vec2((fi - 1.5) * .9, 1.1);
    vec2 d = normalize(vec2(sin(uTime * (.7 + fi * .2) + fi * 2.) * .6, -1.));
    float beam = smoothstep(.97, .995, dot(normalize(p - o), d));
    col += pal(fi / 4. + uTime * .05, vec3(.5), vec3(.5), vec3(1.), vec3(0., .33, .67)) * beam * .25;
  }
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 g = p * (6. + fk * 5.) + vec2(0., uTime * (1.5 + fk));
    vec2 id = floor(g);
    vec3 h = hash33(vec3(id, fk + 2.));
    if (h.z > .72) {
      vec2 q = rot(uTime * 3. * (h.x - .5) + h.y * 6.) * (fract(g) - .5 - (h.xy - .5) * .4);
      q.y /= .2 + .8 * abs(sin(uTime * 4. + h.x * 9.));
      float r = step(max(abs(q.x) - .12, abs(q.y) - .05), 0.);
      col = mix(col, pal(h.x, vec3(.6), vec3(.4), vec3(1.), vec3(0., .33, .67)), r);
    }
  }
  outColor = finish(col);
}
