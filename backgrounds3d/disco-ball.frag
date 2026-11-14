// Disco ball: a mirror ball made of hundreds of little tiles, turning slowly,
// throwing spots of light around a dark club. Ray vs sphere, tiles from the angles.
vec3 club(vec3 d) {
  // light spots on the walls: a grid of dots that turns with the ball
  vec3 q = d;
  q.xz *= rot(-LA);
  vec2 uv = vec2(atan(q.z, q.x) / TAU * 36., q.y * 12.);
  vec2 id = floor(uv);
  vec3 h = hash32(id);
  vec3 c = vec3(.01, .008, .02);
  float spot = smoothstep(.2, .02, length(fract(uv) - .5)) * step(.62, h.x);
  c += spot * pal(h.y, vec3(.6), vec3(.4), vec3(1.), vec3(.0, .33, .67)) * (.25 + .5 * h.z * h.z);
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., -.3, -4.2);
  vec3 rd = lookAt(ro, vec3(0., .25, 0.), p, 1.5, 0.);
  vec3 col = club(rd) * .7;
  // two coloured lamps aimed at the ball
  vec3 L1 = normalize(vec3(-.8, .5, -.6)), L2 = normalize(vec3(.9, .2, -.4));
  vec3 c1 = vec3(1., .35, .75), c2 = vec3(.3, .7, 1.);
  // the hanging string
  if (abs(p.x * 1.0 - 0.) < .006 && p.y > .55) col = vec3(.15);
  vec3 C = vec3(0., .25, 0.);
  float R = 1.15;
  vec3 oc = ro - C;
  float b = dot(oc, rd), c = dot(oc, oc) - R * R, h = b * b - c;
  if (h > 0.) {
    float t = -b - sqrt(h);
    vec3 pos = ro + rd * t, n = normalize(pos - C);
    // the ball makes one full turn per loop
    vec3 m = n;
    m.xz *= rot(LA);
    float lat = asin(m.y), lon = atan(m.z, m.x);
    float rows = 22.;
    float row = floor((lat / PI + .5) * rows);
    float cols = max(4., floor(cos((row + .5) / rows * PI - PI / 2.) * rows * 2.));
    float col_i = floor((lon / TAU + .5) * cols);
    vec2 cell = vec2((col_i + .5) / cols * TAU - PI, (row + .5) / rows * PI - PI / 2.);
    vec3 tn = vec3(cos(cell.y) * cos(cell.x), sin(cell.y), cos(cell.y) * sin(cell.x));
    tn.xz *= rot(-LA);                         // back to world space
    vec2 f = vec2(fract((lon / TAU + .5) * cols), fract((lat / PI + .5) * rows));
    float gap = smoothstep(.0, .08, min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)));
    vec3 r = reflect(rd, normalize(mix(n, tn, .92)));
    float jitter = hash21(vec2(row, col_i));
    vec3 refl = club(r) * 1.5 + c1 * 8. * pow(max(dot(r, L1), 0.), 60.) + c2 * 8. * pow(max(dot(r, L2), 0.), 60.);
    refl += vec3(1.) * 6. * pow(max(dot(r, normalize(vec3(0., 1., -.2))), 0.), 30.) * step(.6, jitter);
    vec3 tile = vec3(.06) + refl * (.75 + .25 * jitter);
    col = mix(vec3(.02), tile, gap);
    col += (c1 * max(dot(n, L1), 0.) + c2 * max(dot(n, L2), 0.)) * .06;
  }
  // a soft halo of light around the ball
  float closest = length(cross(oc, rd));
  col += vec3(.6, .5, 1.) * .15 * exp(-max(closest - R, 0.) * 3.) * step(R, closest);
  outColor = finish(col);
}
