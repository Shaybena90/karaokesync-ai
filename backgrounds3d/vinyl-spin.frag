// Vinyl: a record spinning on a turntable seen from above at an angle, with
// grooves that catch a moving coloured light, the label, and the tone arm.
// Everything is found exactly (a ray against flat discs), so it stays sharp.
void main() {
  vec2 p = screen();
  float cam = LA;
  vec3 ro = vec3(2.2 * sin(.35 * sin(cam)), 1.75, -2.3);
  vec3 rd = lookAt(ro, vec3(.0, 0., .25), p, 1.55, 0.);
  vec3 col = vec3(.02, .015, .03) + vec3(.06, .02, .1) * (1. - abs(p.y));   // dark room
  // soft coloured lights far behind (bokeh)
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 c = vec2(hash11(fi * 3.1) * 4. - 2., .25 + hash11(fi * 7.3) * .8);
    c.x += .15 * sin(LA + fi);
    col += pal(hash11(fi), vec3(.5), vec3(.5), vec3(1.), vec3(0., .33, .67)) * .05 * smoothstep(.13, .09, length(p - c));
  }
  // the turntable plate: y = 0
  float t = -ro.y / rd.y;
  if (t > 0.) {
    vec3 h = ro + rd * t;
    float r = length(h.xz);
    vec3 n = vec3(0., 1., 0.);
    vec3 lightDir = normalize(vec3(cos(LA * 2.), 1.2, sin(LA * 2.)));
    vec3 lightCol = pal(PHASE, vec3(.6), vec3(.4), vec3(1.), vec3(0., .33, .67));
    // the deck around the record
    // brushed dark metal deck, with a soft shine from the moving light
    float brushed = .5 + .5 * sin(h.x * 300. + 4. * fbm(h.xz * 3.));
    vec3 deck = vec3(.016, .016, .02) * (.8 + .4 * brushed);
    deck += lightCol * .05 * pow(max(dot(reflect(rd, n), lightDir), 0.), 8.);
    deck *= smoothstep(3.2, 2.2, max(abs(h.x), abs(h.z)));
    // a glowing ring on the plate edge
    deck += lightCol * .5 * smoothstep(.03, .0, abs(r - 1.58)) ;
    col = deck;
    if (r < 1.5) {
      float spin = LA * 3.;                                  // 3 turns per loop
      vec2 q = rot(spin) * h.xz;
      float ang = atan(q.y, q.x);
      if (r < .45) {
        // the label
        vec3 lab = mix(vec3(.9, .2, .45), vec3(.5, .15, .9), .5 + .5 * sin(ang * 2.));
        lab *= .8 + .2 * smoothstep(.43, .4, r);
        lab = mix(lab, vec3(1.), smoothstep(.02, .0, abs(r - .32)) * .7);
        lab *= smoothstep(.02, .035, r);                     // the spindle hole
        col = lab * (.4 + .7 * max(dot(n, lightDir), 0.));
      } else {
        // grooves: an anisotropic shine that turns with the light
        float g = .5 + .5 * sin(r * 420.);
        vec2 tang = normalize(vec2(-h.z, h.x));
        vec3 hv = normalize(lightDir - rd);
        float aniso = pow(1. - abs(dot(normalize(hv.xz), tang)), 6.) * smoothstep(.0, .2, hv.y);
        float tracks = smoothstep(.006, .0, abs(fract(r * 6.) - .5) - .49);   // gaps between songs
        col = vec3(.015) + lightCol * aniso * (.6 + .4 * g) * 1.6 * (1. - tracks * .7);
        col += vec3(.25) * pow(max(dot(reflect(rd, n), lightDir), 0.), 60.);
      }
      col *= smoothstep(1.5, 1.48, r);
    }
    // the tone arm: a thin bar resting near the outer grooves
    vec2 a0 = vec2(1.9, 1.1), a1 = vec2(.95 + .05 * sin(LA), .55);
    vec2 pa = h.xz - a0, ba = a1 - a0;
    float k = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
    float dArm = length(pa - ba * k);
    col = mix(col, vec3(.75, .76, .8) * (.6 + .4 * k), smoothstep(.035, .02, dArm));
    col = mix(col, vec3(.9), smoothstep(.12, .1, length(h.xz - a0)) * .8);
    col *= exp(-.04 * t);
  }
  outColor = finish(col * 1.1);
}
