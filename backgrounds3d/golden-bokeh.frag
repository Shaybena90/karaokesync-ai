// Golden bokeh: soft out-of-focus lights and sparkling gold dust drifting
// through a warm dark space, in three depths, for a luxurious look.
// Each particle moves a whole number of cells per loop, so it loops seamlessly.
vec3 layer(vec2 p, float scale, float speed, float blur, float seed) {
  vec3 c = vec3(0.);
  vec2 g = p * scale + vec2(0., PHASE * speed);        // speed: whole cells per loop
  vec2 id = floor(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = id + vec2(x, y);
    vec3 h = hash33(vec3(cell, seed));
    vec2 centre = cell + .5 + .35 * vec2(sin(LA + h.x * TAU), cos(LA + h.y * TAU));
    float d = length(g - centre);
    float size = .15 + .25 * h.z;
    float disc = smoothstep(size, size - blur, d) * (.7 + .3 * smoothstep(size - blur * 2., size, d));   // brighter rim
    float tw = .6 + .4 * sin(LA * floor(1. + h.x * 3.) + h.y * 30.);
    vec3 tint = mix(vec3(1., .72, .3), vec3(1., .9, .65), h.y);
    c += tint * disc * step(.72, h.x) * tw;
  }
  return c;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.08, .045, .015), vec3(.01, .005, .0), length(p) * .7);
  col += vec3(.4, .22, .06) * exp(-length(p - vec2(.3 * sin(LA), .1)) * 1.5) * .35;
  col += layer(p, 2.2, 2., .1, 1.) * .22;
  col += layer(p * rot(.2), 4., 4., .05, 2.) * .35;
  col += layer(p * rot(-.1), 9., 10., .02, 3.) * .5;
  // fine sparkling dust
  vec2 g = p * 40. + vec2(0., PHASE * 40.);
  float r = hash21(floor(g));
  col += vec3(1., .85, .5) * step(.985, r) * smoothstep(.3, 0., length(fract(g) - .5)) * (.5 + .5 * sin(LA * 4. + r * 80.)) * 1.5;
  outColor = finish(col * 1.2);
}
