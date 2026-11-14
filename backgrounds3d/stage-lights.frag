// Concert stage: moving spotlight beams cutting through haze, a glossy stage
// floor with pools of light and a glowing LED wall at the back.
// Each beam is drawn from the closest distance between the eye ray and the beam.

vec3 beamColor(float k) { return pal(k / 7. + .05, vec3(.6), vec3(.5), vec3(1.), vec3(.0, .33, .67)); }

// beam k: starts at the top truss and swings (whole turns per loop)
void beam(int i, out vec3 o, out vec3 dir) {
  float k = float(i);
  o = vec3(-4.5 + k * 1.5, 4.2, 3.);
  float swing = .55 * sin(LA * (1. + mod(k, 2.)) + k * 1.3);
  float tiltF = .35 + .25 * sin(LA * 2. + k * .7);
  dir = normalize(vec3(sin(swing), -1., -tiltF));
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(.5 * sin(LA), 1.1, -3.4);
  vec3 rd = lookAt(ro, vec3(0., 2.1, 3.), p, 1.05, 0.);
  vec3 col = vec3(.005, .004, .012);

  // LED wall at z = 4.5
  float tw = (4.5 - ro.z) / rd.z;
  vec3 wp = ro + rd * tw;
  if (abs(wp.x) < 7. && wp.y > 0. && wp.y < 5.) {
    vec2 cell = floor(wp.xy * 4.);
    vec2 f = fract(wp.xy * 4.) - .5;
    float wave = .5 + .5 * sin(cell.x * .35 + cell.y * .2 - LA * 3.);
    float lit = smoothstep(.45, .3, max(abs(f.x), abs(f.y))) * wave * (.4 + .6 * hash21(cell));
    col = pal(cell.x / 28. + PHASE, vec3(.5), vec3(.5), vec3(1.), vec3(.6, .3, .1)) * lit * .25;
  }
  // stage floor (y = 0): dark glossy with light pools
  float tf = -ro.y / rd.y;
  vec3 haze = vec3(0.);
  if (rd.y < 0. && tf < tw) {
    vec3 fp = ro + rd * tf;
    vec3 fc = vec3(.015, .012, .02);
    for (int i = 0; i < 7; i++) {
      vec3 o, dir; beam(i, o, dir);
      vec3 hitp = o + dir * (o.y / -dir.y);
      fc += beamColor(float(i)) * 1.3 * exp(-pow(length(fp.xz - hitp.xz) / .55, 2.));
    }
    // the wall reflected in the floor, blurred
    fc += col * .5 * exp(-tf * .1);
    col = fc * exp(-.02 * tf);
  }
  // beams and haze
  float tEnd = rd.y < 0. ? min(tf, tw) : tw;
  for (int i = 0; i < 7; i++) {
    vec3 o, dir; beam(i, o, dir);
    // closest points between the eye ray and the beam axis
    vec3 w = ro - o;
    float b = dot(rd, dir), dd = dot(rd, w), e = dot(dir, w);
    float den = max(1. - b * b, 1e-4);
    float t = (b * e - dd) / den, s = (e - b * dd) / den;
    if (t < 0. || t > tEnd || s < 0.) continue;
    float dist = length((ro + rd * t) - (o + dir * s));
    float width = .05 + s * .09;                  // the cone widens
    float g = exp(-pow(dist / width, 2.)) * exp(-s * .12) * .8 + .15 * exp(-dist / (width * 3.)) * exp(-s * .2);
    float dust = .75 + .25 * noise(vec2(s * 2., dist * 6.) + float(i) * 13.);
    haze += beamColor(float(i)) * g * dust;
    // the lamp itself
    col += beamColor(float(i)) * 3. * exp(-length(cross(o - ro, rd)) * 30.);
  }
  col += haze;
  // truss
  float tt = (3. - ro.z) / rd.z;
  vec3 tp = ro + rd * tt;
  if (abs(tp.y - 4.35) < .12 && abs(tp.x) < 6.) col = mix(col, vec3(.04), .8);
  outColor = finish(col * 1.1);
}
