// @out intro
// @seconds 7
// Title card backdrop "cinema": a dark movie theatre with the projector's
// beam shining from the back through floating dust, a soft flicker and film grain.
void main() {
  vec2 p = screen();
  vec3 col = vec3(.015, .012, .01);
  // the beam from the top right corner, opening towards the screen
  vec2 o = vec2(1.6, .95);
  vec2 d = p - o;
  float cone = smoothstep(.94, .995, dot(normalize(d), normalize(vec2(-1., -.42)))) * smoothstep(3.8, .3, length(d));
  float flick = .9 + .1 * sin(uTime * 48.) * sin(uTime * 31.);
  float dust = .6 + .4 * fbm(p * 4. + vec2(uTime * .1, uTime * .05));
  col += vec3(1., .92, .75) * cone * dust * flick * .35;
  col += vec3(1., .95, .8) * exp(-length(d) * 6.) * 1.2;                 // the projector lens
  // dust specks in the beam
  vec2 g = p * 40. + vec2(uTime * .6, uTime * .3);
  float h = hash21(floor(g));
  col += vec3(1.) * step(.985, h) * smoothstep(.3, 0., length(fract(g) - .5)) * cone * .8;
  // the seats' silhouettes
  float seats = -.82 + .05 * abs(sin(p.x * 10.));
  col *= smoothstep(seats - .01, seats + .01, p.y) * .9 + .1;
  // film grain
  col += (hash21(gl_FragCoord.xy + floor(uTime * 24.) * 17.) - .5) * .025;
  outColor = finish(col * 1.1);
}
