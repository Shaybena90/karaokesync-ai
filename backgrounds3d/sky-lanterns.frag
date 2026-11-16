// Sky lanterns: glowing paper lanterns rising slowly from a lake at dusk,
// mirrored in the water, swaying a little. Each lantern rises a whole number
// of cells per loop, so the clip loops seamlessly.
vec3 lanterns(vec2 p, float scale, float speed, float seed, float bright) {
  vec3 c = vec3(0.);
  vec2 g = p * scale - vec2(0., PHASE * speed);
  vec2 id = floor(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = id + vec2(x, y);
    vec3 h = hash33(vec3(cell, seed));
    if (h.z < .78) continue;
    vec2 centre = cell + .5 + vec2(.25 * sin(LA + h.x * TAU), 0.);
    vec2 q = (g - centre) * vec2(1., .8);
    float body = smoothstep(.17, .13, max(abs(q.x) * (1.1 - q.y * .9), abs(q.y) * .8));   // a tapered paper lantern
    float shade = .55 + .45 * smoothstep(.15, -.15, q.y) * (1. - abs(q.x) * 3.);
    float flame = exp(-length(q - vec2(0., -.12)) * 12.);
    float fl = .85 + .15 * sin(LA * floor(3. + h.y * 4.) + h.x * 20.);
    c += vec3(1., .55, .2) * (body * shade + flame * 1.5) * fl * bright;
    c += vec3(1., .45, .15) * exp(-length(q) * 4.) * .25 * bright;
  }
  return c;
}

vec3 sky(vec2 p) {
  vec3 c = mix(vec3(.6, .25, .3), vec3(.05, .05, .2), smoothstep(-.2, .9, p.y));
  c += lanterns(p, 2.5, 2., 1., .5) + lanterns(p, 4.5, 3., 2., .35) + lanterns(p, 8., 5., 3., .22);
  return c;
}

void main() {
  vec2 p = screen();
  float horizon = -.35;
  vec3 col;
  if (p.y > horizon) {
    col = sky(p);
    // far hills
    float hill = horizon + .06 + .05 * fbm(vec2(p.x * 2., 3.));
    if (p.y < hill) col = vec3(.04, .03, .07) + sky(vec2(p.x, hill)) * .05;
  } else {
    float d = horizon - p.y;
    vec2 q = vec2(p.x + .006 * sin(d * 120. - LA * 3.), horizon + d * 1.1);
    col = sky(q) * .55 * (1. - d * .6) + vec3(.01, .01, .03);
  }
  outColor = finish(col);
}
