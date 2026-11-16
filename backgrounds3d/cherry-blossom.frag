// Cherry blossom: pink petals drifting through soft spring light in front of
// blossoming branches out of focus, with a gentle breeze.
float petal(vec2 q) {
  q.x *= 1.6;
  float d = length(q - vec2(0., -.05)) - .18;
  d = max(d, length(q + vec2(0., .2)) - .32);
  return max(d, .06 - length(q - vec2(0., .14)));        // the little notch of a cherry petal
}

// one depth of petals: their colour and how much they cover
vec4 petals(vec2 p, float scale, float speed, float seed, float blur) {
  vec4 c = vec4(0.);
  vec2 g = p * scale + vec2(-PHASE * speed, PHASE * speed);
  vec2 id = floor(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = id + vec2(x, y);
    vec3 h = hash33(vec3(cell, seed));
    if (h.z < .55) continue;
    vec2 centre = cell + .5 + .3 * vec2(sin(LA + h.x * TAU), cos(LA * 2. + h.y * TAU));
    vec2 q = rot(LA * (h.x > .5 ? 1. : -1.) + h.y * 6.) * (g - centre) / (.6 + .3 * h.y);
    float turn = cos(LA * 2. + h.x * 9.);
    q.x /= .35 + .65 * abs(turn);                              // the petal turning over
    float a = smoothstep(blur, -blur, petal(q));
    vec3 pc = mix(vec3(1., .38, .6), vec3(1., .68, .8), h.x) * (.8 + .2 * turn) * (1. - .25 * smoothstep(-.2, .1, q.y));
    c.rgb = mix(c.rgb, pc, a);
    c.a = max(c.a, a);
  }
  return c;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.6, .42, .55), vec3(.22, .3, .6), smoothstep(-.8, 1., p.y));
  col += vec3(1., .95, .8) * .35 * exp(-length(p - vec2(-.8, .8)) * 1.2);      // the sun
  // blossoming branches out of focus
  float br = fbm(p * 2.2 + vec2(cos(LA), sin(LA)) * .08);
  float blossom = smoothstep(.55, .75, br) * smoothstep(-.1, .6, p.y + .2 * p.x);
  col = mix(col, vec3(.95, .5, .7), blossom * .75);
  col = mix(col, vec3(.35, .2, .25), smoothstep(.72, .8, br) * smoothstep(.2, .9, p.y + .4 * p.x) * .5);
  vec4 l1 = petals(p, 1.4, 2., 1., .15), l2 = petals(p, 2.6, 3., 2., .05), l3 = petals(p, 5., 5., 3., .02);
  col = mix(col, l1.rgb, l1.a * .55);
  col = mix(col, l2.rgb, l2.a * .9);
  col = mix(col, l3.rgb, l3.a);
  outColor = finish(col * 1.1);
}
