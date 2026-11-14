// Party confetti: colourful paper pieces tumbling down through coloured
// spotlights. Each piece flips as it falls (its width follows the turn and the
// back side is darker), on layers at different depths.
void main() {
  vec2 p = screen();
  vec3 col = vec3(.02, .01, .04);
  // sweeping spotlights behind
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    vec2 o = vec2(-1.5 + k, 1.3);
    float a = -1.57 + .5 * sin(LA * (1. + mod(k, 2.)) + k * 1.7);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 v = p - o;
    float along = dot(v, dir), across = abs(dot(v, vec2(-dir.y, dir.x)));
    vec3 c = pal(k / 4., vec3(.6), vec3(.4), vec3(1.), vec3(.0, .33, .67));
    col += c * .35 * smoothstep(.12 + along * .25, .0, across) * smoothstep(.0, .3, along) * exp(-along * .5);
  }
  const int L = 6;
  for (int l = 0; l < L; l++) {
    float fl = float(l);
    float scale = mix(9., 2.6, fl / float(L - 1));      // far layers: small pieces
    float speed = mix(1., 2., fl / float(L - 1));
    float shift = floor(scale * 2.) * floor(speed);       // cells fallen per loop
    vec2 q = p * scale + vec2(fl * 17.3, PHASE * shift);
    vec2 id = floor(q);
    vec3 h = hash32(vec2(id.x, mod(id.y, shift)) + fl * 11.);   // the pieces repeat after one loop's fall
    if (h.z > .38) continue;
    vec2 f = fract(q) - .5 - (h.xy - .5) * .5;
    // the piece turns in the plane and flips over
    f *= rot(h.x * TAU + LA * (h.y < .5 ? 1. : -1.));
    float flip = cos(LA * floor(1. + 3. * h.y) + h.z * TAU);
    vec2 size = vec2(.16 * max(abs(flip), .08), .09);
    vec2 d = abs(f) - size;
    float box = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
    float aa = 1.5 * scale / uRes.y * 2.;
    float blur = fl < 1.5 ? .05 : 0.;                       // far pieces out of focus
    float m = smoothstep(aa + blur, -aa, box);
    vec3 c = pal(h.x * 1.7, vec3(.6), vec3(.45), vec3(1.), vec3(.0, .33, .67));
    c *= flip > 0. ? 1.1 : .55;                             // the back side is darker
    c += vec3(1.) * .6 * pow(abs(flip), 30.);               // a flash when it faces the light
    col = mix(col, c * mix(.5, 1.2, fl / float(L - 1)), m);
  }
  outColor = finish(col);
}
