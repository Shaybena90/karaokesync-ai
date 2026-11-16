// @out intro
// @seconds 7
// Title card backdrop "floral": soft ivory and blush light for weddings, with
// white petals drifting down and a delicate golden frame of light.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.75, .62, .6), vec3(.35, .25, .28), length(p * vec2(.7, 1.)) * .7);
  col += vec3(1., .9, .8) * .25 * exp(-length(p) * 1.3);
  // a thin golden frame
  vec2 b = abs(p) - vec2(1.55, .82);
  float frame = abs(max(b.x, b.y)) ;
  col += vec3(1., .8, .45) * smoothstep(.008, .0, frame) * .8 + vec3(1., .8, .5) * exp(-frame * 40.) * .1;
  // petals falling and turning
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 g = p * (4. + fk * 3.) + vec2(sin(uTime * .4 + fk) * .4, uTime * (.8 + fk * .4));
    vec2 id = floor(g);
    vec3 h = hash33(vec3(id, fk + 9.));
    if (h.z > .6) {
      vec2 q = rot(uTime * (h.x - .5) * 2. + h.y * 6.) * (fract(g) - .5 - (h.xy - .5) * .4);
      q.x /= .4 + .6 * abs(cos(uTime + h.x * 9.));
      float d = length(q * vec2(1., 1.8)) - .12;
      col = mix(col, vec3(1., .95, .93), smoothstep(.02, .0, d) * .9);
    }
  }
  outColor = finish(col * .9);
}
