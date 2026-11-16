// City fireworks: a city skyline at night on the water, with fireworks bursting
// above it and mirrored in the bay. Each firework repeats a whole number of
// times per loop; the windows twinkle in whole turns, so it loops seamlessly.
vec3 fireworks(vec2 p) {
  vec3 c = vec3(0.);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float n = 1. + mod(fk, 2.), per = LOOP / n;            // 1 or 2 bursts per loop
    float t = mod(uTime + fk * 1.7, per) / per;            // 0..1 in its own cycle
    float cycle = mod(floor((uTime + fk * 1.7) / per), n);   // the same bursts every loop
    vec2 centre = vec2(hash11(fk * 3.7 + cycle) * 2.6 - 1.3, .35 + hash11(fk * 9.1) * .45);
    vec3 colr = pal(hash11(fk * 5.3 + cycle), vec3(.6), vec3(.4), vec3(1.), vec3(0., .33, .67));
    float rise = smoothstep(0., .18, t);
    if (t < .18) {                                          // the rocket going up
      vec2 rp = vec2(centre.x, mix(-.3, centre.y, rise));
      c += vec3(1., .8, .5) * .002 / (length(p - rp) + .002) * exp(-length(p - rp) * 20.);
      continue;
    }
    float age = (t - .18) / .82;
    float rad = (1. - pow(1. - age, 3.)) * .6;
    float fade = pow(1. - age, 2.);
    if (length(p - centre) > rad + .25) {                  // far from this burst: only its soft glow
      c += colr * fade * .03 * exp(-length(p - centre) * 4.);
      continue;
    }
    for (int i = 0; i < 60; i++) {
      float a = float(i) / 60. * 3. * TAU + hash11(fk);
      vec2 dir = vec2(cos(a), sin(a)) * (.3 + .7 * hash11(float(i) + fk * 10.));
      vec2 sp = centre + dir * rad - vec2(0., age * age * .12);
      float d = length(p - sp);
      c += colr * fade * .0011 / (d + .0015) * exp(-d * 25.) * (.7 + .3 * sin(float(i) * 7. + age * 40.));
    }
    c += colr * fade * .03 * exp(-length(p - centre) * 4.);  // lit smoke
  }
  return c;
}

float skyline(float x) {
  float id = floor(x * 9.);
  float h = .08 + .28 * pow(hash11(id), 1.6);
  return -.32 + h;
}

vec3 scene(vec2 p) {
  vec3 c = mix(vec3(.025, .01, .06), vec3(.0, .0, .012), smoothstep(-.3, .9, p.y));
  c += vec3(.35, .12, .3) * exp(-max(p.y + .32, 0.) * 5.);           // the city's glow on the horizon
  c += fireworks(p);
  float top = skyline(p.x);
  if (p.y < top) {
    float id = floor(p.x * 9.);
    vec2 w = vec2(fract(p.x * 9. * 6.), fract(p.y * 50.));
    float lit = step(.72, hash21(floor(vec2(p.x * 54., p.y * 50.))));
    float tw = .7 + .3 * sin(LA * floor(1. + 3. * hash21(floor(vec2(p.x * 54., p.y * 50.)))) + id);
    float win = smoothstep(.3, .25, abs(w.x - .5)) * smoothstep(.35, .3, abs(w.y - .5));
    c = vec3(.01, .01, .025) + vec3(1., .8, .45) * win * lit * tw * .6 + fireworks(vec2(p.x, top + .1)) * .05;
  }
  return c;
}

void main() {
  vec2 p = screen() * .9;
  vec3 col;
  float water = -.32;
  if (p.y > water) col = scene(p);
  else {
    float d = water - p.y;
    vec2 q = vec2(p.x + .01 * sin(p.y * 80. + LA * 2.) * d * 4., water + d);
    col = scene(q) * .45 * (1. - d);
    col += vec3(.02, .02, .05);
  }
  outColor = finish(col);
}
