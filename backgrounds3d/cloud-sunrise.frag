// Above the clouds at sunrise: flying slowly over a sea of soft clouds lit
// pink and gold by the rising sun. The cloud sea is noise that repeats in the
// flying direction, so the flight loops seamlessly.
float clouds(vec2 x) {
  vec2 period = vec2(8., 8.);
  return tfbm(x * .5, period * .5);
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 1., 0.);
  vec3 rd = lookAt(ro, ro + vec3(.2 * sin(LA), -.12, 1.), p, 1.4, .02 * sin(LA));
  vec3 sun = normalize(vec3(0., .1, 1.));
  float s = max(dot(rd, sun), 0.);
  vec3 col = mix(vec3(1., .5, .35), vec3(.25, .3, .6), smoothstep(.0, .4, rd.y));
  col = mix(col, vec3(.05, .08, .25), smoothstep(.5, 1., rd.y));
  col += vec3(1., .7, .4) * pow(s, 8.) * .8 + vec3(1., .9, .7) * smoothstep(.998, .9993, s) * 4.;
  vec3 skyCol = col;
  if (rd.y < 0.) {
    // layers of the cloud sea: the top surface at several heights
    float travel = PHASE * 16.;                                // 16 = one period of the noise (exact loop)
    vec3 acc = vec3(0.);
    float trans = 1.;
    for (int i = 0; i < 10; i++) {
      float h = .4 - float(i) * .05;
      float t = (ro.y - h) / -rd.y;
      vec2 q = (ro + rd * t).xz + vec2(0., travel);
      float dens = smoothstep(.5 - float(i) * .012, .68, clouds(q)) * .45;
      float light = .6 + .4 * clouds(q + sun.xz * .8);
      float lit = smoothstep(.35, .8, clouds(q + sun.xz * .25 + vec2(0., .2)) - clouds(q) + .5);
      vec3 c = mix(vec3(.3, .22, .42), vec3(1., .72, .55), lit) * (1. - float(i) * .06);
      c += vec3(1., .6, .4) * pow(s, 4.) * .5;
      float fog = exp(-t * .08);
      acc += trans * dens * mix(skyCol, c, fog);
      trans *= 1. - dens;
    }
    col = col * trans + acc * .9;
  }
  outColor = finish(col);
}
