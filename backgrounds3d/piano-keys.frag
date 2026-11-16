// Piano: a long glossy keyboard curving away into the dark, keys pressing in a
// running melody that lights them up, with reflections on the black lacquer.
// The keys are drawn on the plane where the ray meets them (exact, sharp).
void main() {
  vec2 p = screen();
  vec3 ro = vec3(-.4 + .2 * sin(LA), .62, -.85);
  vec3 rd = lookAt(ro, vec3(1.3, .0, .55), p, 1.45, -.1);
  vec3 col = mix(vec3(.04, .01, .07), vec3(.0), smoothstep(-.2, .6, rd.y));
  col += vec3(.5, .2, .8) * .15 * exp(-abs(rd.y - .05) * 10.);
  float t = (ro.y - 0.) / -rd.y;
  if (rd.y < 0.) {
    vec3 h = ro + rd * t;
    float along = h.x * 4.;                                 // white keys along x
    float key = floor(along);
    float k = fract(along);
    float across = h.z;
    float inKeyboard = step(0., across) * step(across, 1.2);
    // the melody: one key lit per step, 20 steps per loop
    float step20 = floor(PHASE * 20.);
    float playing = floor(hash11(step20 + 3.) * 14.) - 4.;
    float press = smoothstep(.0, .3, fract(PHASE * 20.)) * smoothstep(1., .6, fract(PHASE * 20.));
    float lit = key == playing ? press : 0.;
    float gap = smoothstep(.0, .03, k) * smoothstep(1., .97, k);
    vec3 white = vec3(.92, .9, .86) * gap;
    white = mix(white, vec3(1., .45, .9), lit * .8);
    // black keys on top (2-3 pattern)
    float m = mod(key, 7.);
    bool hasBlack = m != 2. && m != 6.;
    float bk = hasBlack ? step(.7, k) * step(across, .75) : 0.;
    float bk2 = (mod(key - 1., 7.) != 2. && mod(key - 1., 7.) != 6.) ? step(k, .3) * step(across, .75) : 0.;
    vec3 c = mix(white, vec3(.02), max(bk, bk2));
    // lacquered body in front and behind
    vec3 r = reflect(rd, vec3(0., 1., 0.));
    vec3 refl = vec3(.6, .3, 1.) * pow(max(dot(r, normalize(vec3(.3, .4, 1.))), 0.), 20.);
    vec3 body = vec3(.01) + refl * .8 + vec3(1., .45, .9) * .15 * exp(-abs(along - playing - .5) * 2.) * press;
    c = inKeyboard > .5 ? c * (.55 + .45 * smoothstep(1.2, .2, across)) + refl * .2 : body;
    c += vec3(1., .5, 1.) * lit * .4 * inKeyboard;
    col = mix(col, c, exp(-t * .12));
  }
  outColor = finish(col);
}
