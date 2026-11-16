// Rain on glass: drops running down a window at night, each one bending the
// soft city lights behind it, which glow out of focus in many colours.
vec3 city(vec2 p, float blur) {
  vec3 c = mix(vec3(.04, .02, .08), vec3(.0, .01, .03), p.y * .5 + .5);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 pos = vec2(hash11(fi * 1.7) * 3.6 - 1.8, hash11(fi * 4.3) * 1.6 - .9);
    pos.x += .05 * sin(LA + fi);
    vec3 col = pal(hash11(fi * 9.1), vec3(.6, .5, .5), vec3(.4), vec3(1.), vec3(0., .2, .5));
    float r = .08 + .1 * hash11(fi * 2.9);
    c += col * smoothstep(r, r - blur, length(p - pos)) * .35 * (.7 + .3 * sin(LA * 2. + fi));
  }
  return c;
}

vec2 drops(vec2 p, float scale, float seed, out float mask) {
  vec2 g = p * vec2(scale, scale * .5);
  float col = floor(g.x);
  float speed = floor(2. + 3. * hash11(col + seed));          // whole cells per loop
  g.y += PHASE * speed + hash11(col * 7. + seed);
  vec2 id = floor(g), f = fract(g) - .5;
  float r = hash21(id + seed);
  f.x += .2 * sin(g.y * 6. + col) * (r - .5);
  vec2 d = f * vec2(1., 2.) - vec2(0., .1);
  float body = smoothstep(.22, .17, length(d));
  float trail = smoothstep(.05, .02, abs(f.x)) * smoothstep(-.1, .5, f.y) * step(.0, f.y) * .5;
  mask = step(.55, r) * max(body, trail * .6);
  return d * mask;
}

void main() {
  vec2 p = screen();
  float m1, m2;
  vec2 o1 = drops(p, 7., 1., m1), o2 = drops(p + 1.3, 13., 5., m2);
  vec2 offs = o1 * .25 + o2 * .15;
  float mask = max(m1, m2);
  vec3 bg = city(p, .06);
  vec3 through = city(p + offs * 2.5, .015);                  // sharp lights through each drop
  vec3 col = mix(bg * .8, through * 1.2, mask);
  col += vec3(.6, .7, 1.) * pow(mask, 3.) * .08;
  // a light mist on the glass
  col = mix(col, vec3(.08, .07, .12), (1. - mask) * .25 * fbm(p * 3.));
  outColor = finish(col);
}
