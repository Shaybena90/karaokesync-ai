// Liquid chrome: blobs of mirror-like metal that melt into each other,
// reflecting a colourful studio. Drawn by ray marching a smooth union of balls.
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }

float map(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    vec3 c = vec3(1.05 * sin(LA * (k < 3. ? 1. : 2.) + k * 1.7), .7 * sin(LA * 2. + k * 2.3), .8 * cos(LA + k * 1.1));
    d = smin(d, length(p - c) - (.6 + .18 * sin(k * 3.1 + LA)), 1.);
  }
  return d;
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.002, 0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

vec3 env(vec3 d) {
  float a = atan(d.z, d.x);
  vec3 c = mix(vec3(.02, .01, .05), vec3(.18, .05, .3), smoothstep(.6, -.6, d.y));
  c += pal(a / TAU + .1 * d.y, vec3(.5), vec3(.5), vec3(1.), vec3(.0, .33, .67)) * 3. * smoothstep(.3, .0, abs(d.y - .2 * sin(a * 3.)));
  c += vec3(1., .3, .7) * 1.5 * smoothstep(.4, .9, -d.y);
  c += vec3(.35, .55, 1.) * .9 * smoothstep(.25, 1., d.y);
  c += vec3(1.) * 5. * smoothstep(.25, .0, length(d - normalize(vec3(.4, .9, -.3))));
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .2, -4.3);
  ro.xz *= rot(.35 * sin(LA));
  vec3 rd = lookAt(ro, vec3(0.), p, 1.7, 0.);
  vec3 col = mix(vec3(.04, .01, .08), vec3(.0, .0, .01), length(p) * .7);
  col += vec3(.3, .05, .35) * .25 * exp(-2. * length(p));
  float t = 2.5;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < .001) break;
    t += d;
    if (t > 9.) break;
  }
  if (t < 9.) {
    vec3 pos = ro + rd * t, n = normal(pos), r = reflect(rd, n);
    float fres = pow(1. - max(dot(-rd, n), 0.), 3.);
    // a thin film tint at grazing angles (like oil on metal)
    vec3 film = pal(fres * 1.5 + pos.y * .2, vec3(.8), vec3(.2), vec3(1.), vec3(.0, .2, .5));
    col = env(r) * mix(vec3(.85, .88, .95), film, .5 * fres) * (.55 + .6 * fres);
  }
  outColor = finish(col);
}
