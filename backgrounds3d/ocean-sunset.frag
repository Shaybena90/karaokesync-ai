// 3D ocean at sunset: rolling waves with a golden sun path glittering on the
// water, a warm sky and soft clouds. The waves are sums of sine waves whose
// speeds are whole turns per loop, so the sea loops seamlessly.
float waves(vec2 x) {
  float h = 0.;
  float amp = .35, fr = .35;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 dir = vec2(cos(fi * 1.3 + .4), sin(fi * 1.3 + .4));
    float k = floor(1. + fi * .7);            // turns per loop
    h += amp * sin(dot(dir, x) * fr - LA * k + fi * 2.1);
    amp *= .62; fr *= 1.75;
  }
  return h;
}

vec3 sky(vec3 d, vec3 sun) {
  float s = max(dot(d, sun), 0.);
  vec3 c = mix(vec3(1., .35, .12), vec3(.16, .08, .32), smoothstep(-.02, .4, d.y));
  c = mix(c, vec3(.03, .03, .12), smoothstep(.4, 1., d.y));
  c += vec3(1., .5, .2) * pow(s, 10.) * .6 + vec3(1., .85, .6) * pow(s, 900.) * 25.;
  // clouds drifting on a circle in noise space
  vec2 cuv = d.xz / max(d.y, .05) * .6 + vec2(cos(LA), sin(LA)) * .3;
  float cl = smoothstep(.45, .8, fbm(cuv * 1.4 + 4.)) * smoothstep(.0, .15, d.y);
  c = mix(c, mix(vec3(.9, .45, .35), vec3(.35, .2, .4), smoothstep(.0, .4, d.y)) + vec3(1., .5, .2) * pow(s, 4.) * .8, cl * .8);
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 2.2 + .15 * sin(LA), 0.);
  vec3 rd = lookAt(ro, vec3(0., 1.9, 10.), p, 1.5, .03 * sin(LA));
  vec3 sun = normalize(vec3(0., .08, 1.));
  vec3 col = sky(rd, sun);
  if (rd.y < 0.) {
    // march the water surface
    float t = 0., h = 0.;
    float tPlane = (ro.y - .6) / -rd.y;
    t = max(.0, (ro.y - 1.) / -rd.y);
    for (int i = 0; i < 80; i++) {
      vec3 q = ro + rd * t;
      float d = q.y - waves(q.xz);
      if (abs(d) < .002 * t || t > 120.) break;
      t += d * .6;
    }
    vec3 pos = ro + rd * t;
    vec2 e = vec2(.02, 0.);
    vec3 n = normalize(vec3(waves(pos.xz - e.xy) - waves(pos.xz + e.xy), 2. * e.x, waves(pos.xz - e.yx) - waves(pos.xz + e.yx)));
    // fade the detail in the distance (no shimmering)
    n = normalize(mix(n, vec3(0, 1, 0), smoothstep(10., 90., t)));
    vec3 r = reflect(rd, n);
    r.y = abs(r.y);
    float fres = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 water = vec3(.02, .05, .1) + vec3(.1, .05, .08) * max(pos.y + .3, 0.);
    col = mix(water, sky(r, sun), fres);
    col += vec3(1., .7, .4) * pow(max(dot(r, sun), 0.), 200.) * 6.;     // sparkles on the sun path
    col = mix(col, sky(rd, sun), smoothstep(40., 120., t));
  }
  outColor = finish(col);
}
