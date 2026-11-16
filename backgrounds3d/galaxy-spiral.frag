// Spiral galaxy: a glowing galaxy turning slowly in deep space, seen at an
// angle, with a bright core, dusty arms full of young blue stars and a field
// of stars behind. The disc is drawn where the ray crosses its plane (exact).
float starField(vec2 p, float scale) {
  vec2 g = p * scale, id = floor(g), f = fract(g) - .5;
  float r = hash21(id);
  vec2 off = (hash32(id).xy - .5) * .6;
  return step(.93, r) * smoothstep(.08, .0, length(f - off)) * (.5 + .5 * sin(LA * floor(1. + r * 3.) + r * 50.));
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 1.4 + .2 * sin(LA), -3.4);
  vec3 rd = lookAt(ro, vec3(0.), p, 1.5, .25 + .05 * sin(LA));
  vec3 col = vec3(.004, .004, .012);
  col += vec3(.7, .8, 1.) * (starField(p, 60.) + starField(p + 3., 140.) * .6);
  col += vec3(.06, .02, .1) * fbm(p * 1.5 + vec2(cos(LA), sin(LA)) * .2) * .2;      // far nebula
  // the galaxy plane, slightly tilted
  vec3 n = normalize(vec3(.12, 1., .05));
  float t = -dot(ro, n) / dot(rd, n);
  if (t > 0.) {
    vec3 h = ro + rd * t;
    vec2 q = vec2(h.x, h.z - h.y * .1);
    float r = length(q);
    float ang = atan(q.y, q.x) + LA;             // one turn per loop
    float arms = 2.;
    float spiral = ang * arms - log(r + .05) * 3.2;
    float arm = pow(.5 + .5 * cos(spiral), 5.);
    vec2 noisePos = vec2(cos(ang), sin(ang)) * r * 4.;
    float dust = fbm(noisePos * 1.8 + 7.);
    float disc = exp(-r * 1.6);
    vec3 young = vec3(.4, .6, 1.) * arm * (.5 + dust) * disc * 2.2;
    vec3 old = vec3(1., .78, .5) * disc * disc * .9;
    vec3 pink = vec3(1., .3, .6) * pow(arm, 4.) * smoothstep(.5, .8, dust) * disc * 2.5;   // star forming regions
    vec3 dark = vec3(1.) - vec3(.6) * smoothstep(.55, .8, dust) * (1. - arm) * smoothstep(.15, .5, r);
    float sparkle = starField(noisePos, 6.) * arm * disc * 6.;
    col += (young + old + pink + vec3(.8, .9, 1.) * sparkle) * dark * smoothstep(2.8, 1.5, r);
    col += vec3(1., .85, .6) * exp(-r * 9.) * 3.;                                  // the core
  }
  col += vec3(1., .8, .6) * .25 * exp(-length(p - vec2(.0, -.05)) * 3.);
  outColor = finish(col);
}
