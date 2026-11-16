// Heart bokeh: soft pink and gold heart-shaped lights floating up in a warm
// romantic haze, in three depths. For weddings and love songs.
float heart(vec2 p) {
  p.y -= .25;
  p.x = abs(p.x);
  p.y = -p.y;
  float a = atan(p.x, p.y) / PI;
  float r = length(p);
  float h = abs(a);
  float d = (13. * h - 22. * h * h + 10. * h * h * h) / (6. - 5. * h);
  return r - d * .5;
}

vec3 layer(vec2 p, float scale, float speed, float blur, float seed) {
  vec3 c = vec3(0.);
  vec2 g = p * scale + vec2(0., -PHASE * speed);
  vec2 id = floor(g);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = id + vec2(x, y);
    vec3 h = hash33(vec3(cell.x, mod(cell.y, speed), seed));
    if (h.z < .68) continue;
    vec2 centre = cell + .5 + .3 * vec2(sin(LA + h.x * TAU), cos(LA + h.y * TAU) * .5);
    vec2 q = (g - centre) / (.55 + .3 * h.y);
    q = rot(.3 * sin(LA + h.x * 6.)) * q;
    float d = heart(q);
    float v = smoothstep(blur, -blur, d) * (.8 + .4 * smoothstep(-.2, 0., d));
    vec3 tint = mix(vec3(1., .35, .6), vec3(1., .8, .5), h.x);
    c += tint * v;
  }
  return c;
}

void main() {
  vec2 p = screen();
  vec3 col = mix(vec3(.18, .03, .1), vec3(.03, .0, .03), length(p) * .6);
  col += vec3(.5, .15, .3) * exp(-length(p - vec2(.2 * sin(LA), -.2)) * 1.5) * .3;
  col += layer(p, 2., 5., .2, 1.) * .18;
  col += layer(p * rot(.1), 3.5, 9., .08, 2.) * .3;
  col += layer(p * rot(-.15), 6., 15., .03, 3.) * .45;
  outColor = finish(col * 1.1);
}
