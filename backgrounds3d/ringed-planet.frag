// Ringed planet: a banded gas giant with rings, a thin glowing atmosphere and a
// sparkling star field. Everything is found exactly (ray vs sphere and plane).
vec3 stars(vec3 d) {
  vec3 c = vec3(0.);
  for (int l = 0; l < 3; l++) {
    vec2 uv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1., 1.))) * (80. + 60. * float(l));
    vec2 id = floor(uv);
    vec3 h = hash32(id + float(l) * 37.);
    float tw = .6 + .4 * sin(LA * floor(1. + 3. * h.z) + h.x * TAU);
    c += step(.965, h.x) * .8 * smoothstep(.3, .0, length(fract(uv) - .5 - (h.yz - .5) * .4)) * tw * mix(vec3(.7, .8, 1.), vec3(1., .85, .7), h.y);
  }
  // a faint nebula
  vec2 q = d.xy * 2. + d.z;
  c += vec3(.25, .05, .35) * .35 * fbm(q * 1.5) * smoothstep(-.3, .6, d.y + d.x * .3);
  c += vec3(.0, .15, .3) * .3 * fbm(q * 2. + 7.) * smoothstep(.3, -.6, d.y);
  return c;
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., .9, -7.);
  ro.xz *= rot(.18 * sin(LA));
  vec3 rd = lookAt(ro, vec3(.9, -.1, 0.), p, 1.6, .0);
  vec3 L = normalize(vec3(-1., .35, .25));
  mat2 tilt = rot(.38);
  // planet frame: tilt the rings
  vec3 o = ro, d = rd;
  o.xy *= tilt; d.xy *= tilt;
  float R = 2.;
  vec3 col = stars(rd);

  float b = dot(o, d), c = dot(o, o) - R * R, h = b * b - c;
  float tP = h > 0. ? -b - sqrt(h) : -1.;
  float tR = -o.y / d.y;
  vec3 rp = o + d * tR;
  float rr = length(rp.xz);
  bool ringHit = tR > 0. && rr > 2.6 && rr < 4.6;

  // atmosphere glow around the planet (closest distance of the ray to the centre)
  float closest = length(o - d * dot(o, d));
  col += vec3(.3, .55, 1.) * .6 * exp(-max(closest - R, 0.) * 7.) * step(R, closest);

  vec3 Lp = L; Lp.xy *= tilt;
  if (ringHit && (tP < 0. || tR < tP)) {
    float band = .55 + .45 * sin(rr * 23.) * sin(rr * 7.3 + 1.);
    float dens = band * smoothstep(2.6, 2.75, rr) * smoothstep(4.6, 4.3, rr) * (1. - .8 * smoothstep(3.55, 3.6, rr) * smoothstep(3.75, 3.7, rr));
    // planet shadow on the rings
    float sb = dot(rp, Lp), sh = sb * sb - (dot(rp, rp) - R * R);
    float shadow = (sh > 0. && sb < 0.) ? .15 : 1.;
    vec3 ringCol = mix(vec3(.9, .75, .55), vec3(.75, .6, .9), smoothstep(3., 4.3, rr));
    col = mix(col, ringCol * 1.4 * shadow * (.4 + .6 * abs(Lp.y) * 3.), dens * .9);
  }
  if (tP > 0. && (!ringHit || tP < tR)) {
    vec3 pos = o + d * tP, n = pos / R;
    // bands that turn with the planet (one full turn per loop)
    float lon = atan(n.z, n.x) + LA, lat = n.y;
    float w = fbm(vec2(lon * 1.5, lat * 9.)) ;
    float bands = sin(lat * 18. + w * 3.5 + .8 * sin(lon * 2.));
    vec3 base = mix(vec3(.85, .55, .35), vec3(.95, .85, .7), .5 + .5 * bands);
    base = mix(base, vec3(.6, .3, .45), smoothstep(.6, 1., fbm(vec2(lon * 3., lat * 20.))));
    float diff = max(dot(n, Lp), 0.);
    float rim = pow(1. - max(dot(-d, n), 0.), 3.);
    // ring shadow on the planet
    float tr = -pos.y / Lp.y, rs = length((pos + Lp * tr).xz);
    float ringShadow = (tr > 0. && rs > 2.6 && rs < 4.6) ? .45 : 1.;
    col = base * (diff * 1.5 * ringShadow + .03) + vec3(.3, .55, 1.) * rim * (.3 + diff);
    // the rings in front of the planet
    if (ringHit && tR < tP) col = mix(col, vec3(.9, .75, .6), .5);
  }
  outColor = finish(col);
}
