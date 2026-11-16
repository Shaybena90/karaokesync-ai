// @out intro
// @seconds 7
// Title card backdrop "sakura": a pink spring evening with cherry blossom
// branches at the top corners and petals drifting slowly across.
void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.55, .3, .45), vec3(.15, .08, .22), smoothstep(-1., 1., p.y));
  col += vec3(1., .75, .8) * .2 * exp(-length(p) * 1.4);
  float blossom = smoothstep(.55, .72, fbm(p * 2.5 + 3.)) * smoothstep(.45, 1., abs(p.x) * .45 + p.y * .7);
  col = mix(col, vec3(1., .6, .75), blossom * .85);
  vec2 g = p * 5. + vec2(-uTime * .7, uTime * .5);
  vec2 id = floor(g);
  vec3 h = hash33(vec3(id, 5.));
  if (h.z > .55) {
    vec2 q = rot(uTime * (h.x - .5) * 3. + h.y * 6.) * (fract(g) - .5 - (h.xy - .5) * .4);
    q.x /= .35 + .65 * abs(cos(uTime * 1.5 + h.x * 9.));
    float d = length(q * vec2(1., 1.6)) - .1;
    col = mix(col, vec3(1., .72, .82), smoothstep(.015, .0, d));
  }
  outColor = finish(col);
}
