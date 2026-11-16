// Plasma orb: a glass sphere full of electric arcs that crawl from the core to
// the glass, glowing violet and cyan, floating over a dark reflective floor.
void main() {
  vec2 p = screen();
  vec3 ro = vec3(2.8 * sin(LA * .0 + .3 * sin(LA)), .6, -2.8);
  vec3 rd = lookAt(ro, vec3(0., .3, 0.), p, 1.6, 0.);
  vec3 col = vec3(.01, .005, .02) + vec3(.1, .03, .2) * exp(-length(p) * 1.5);
  vec3 C = vec3(0., .4, 0.);
  float R = 1.;
  // floor
  if (rd.y < 0.) {
    float t = (ro.y + .7) / -rd.y;
    vec3 h = ro + rd * t;
    float glow = exp(-length(h.xz - C.xz) * 1.4);
    col = vec3(.01, .005, .02) + vec3(.5, .2, 1.) * glow * .3 * (.8 + .2 * sin(LA * 6.));
    col *= .6 + .4 * smoothstep(.0, .1, abs(fract(h.x) - .5)) * smoothstep(.0, .1, abs(fract(h.z) - .5));
  }
  vec3 oc = ro - C;
  float b = dot(oc, rd), c = dot(oc, oc) - R * R, disc = b * b - c;
  if (disc > 0.) {
    float t0 = -b - sqrt(disc), t1 = -b + sqrt(disc);
    vec3 h = ro + rd * t0, n = normalize(h - C);
    // the arcs, seen through the glass: wavy lines from the core to the glass
    vec3 f = normalize(C - ro), rt = normalize(cross(vec3(0., 1., 0.), f)), up = cross(f, rt);
    vec2 sp = vec2(dot(n, rt), dot(n, up));
    float r = length(sp), ang = atan(sp.y, sp.x);
    vec3 inner = vec3(0.);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float ai = fi * TAU / 7. + LA * (mod(fi, 2.) * 2. - 1.) + .6 * sin(LA * 2. + fi * 1.3);
      float wig = (.22 * sin(r * 13. + LA * 3. + fi * 2.) + .1 * sin(r * 31. - LA * 5. + fi)) * r;
      float dist = abs(mod(ang - ai - wig + PI, TAU) - PI) * r;
      vec3 ac = mix(vec3(.4, .9, 1.), vec3(.9, .35, 1.), smoothstep(.1, .9, r));
      inner += ac * (.0035 / (dist + .0025)) * smoothstep(.98, .85, r) * smoothstep(.0, .12, r);
      // where the arc touches the glass
      vec2 tip = vec2(cos(ai + .32 * sin(13. + LA * 3. + fi * 2.) * .9), sin(ai + .32 * sin(13. + LA * 3. + fi * 2.) * .9)) * .93;
      inner += vec3(1., .7, 1.) * .004 / (length(sp - tip) + .004);
    }
    inner += vec3(1., .85, 1.) * .03 / (r + .03);                             // the bright core
    inner += vec3(.4, .1, .7) * .1 * (1. - r);
    float fres = pow(1. - max(dot(n, -rd), 0.), 4.);
    vec3 refl = vec3(.6, .4, 1.) * fres * .6 + vec3(1.) * pow(max(dot(reflect(rd, n), normalize(vec3(-.5, 1., -.4))), 0.), 80.) * 2.;
    col = col * .15 + inner * .8 + refl;
  }
  outColor = finish(col);
}
