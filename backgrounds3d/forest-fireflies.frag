// Firefly forest: layers of pine trees at night under a big moon, mist between
// them, and fireflies drifting and blinking. The view drifts sideways a little
// (parallax: near trees move more than far ones).
float tree(vec2 q, float seed) {   // a pine tree silhouette in a cell: 1 inside
  float h = .55 + .45 * hash11(seed);
  float w = .22 + .1 * hash11(seed + 1.);
  float x = abs(q.x);
  float y = q.y;
  float layers = 0.;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float top = h - fi * h * .22, bottom = top - h * .4;
    float ww = w * (.55 + fi * .2);
    layers = max(layers, step(bottom, y) * step(y, top) * step(x, ww * (top - y) / (top - bottom)));
  }
  float trunk = step(x, .025) * step(-.1, y) * step(y, h * .2);
  return max(layers, trunk) * step(-.1, y);
}

void main() {
  vec2 p = screen();
  float drift = .25 * sin(LA);
  vec3 sky = mix(vec3(.06, .09, .2), vec3(.01, .015, .05), smoothstep(-.4, 1., p.y));
  vec2 mp = vec2(.75, .55);
  float md = length(p - mp - vec2(drift * .05, 0.));
  vec3 col = sky + vec3(.9, .95, 1.) * smoothstep(.17, .16, md) * (1. - .15 * fbm((p - mp) * 9.));
  col += vec3(.35, .45, .7) * .5 * exp(-md * 3.);
  // stars
  vec2 sg = p * 50.;
  col += step(.985, hash21(floor(sg))) * smoothstep(.2, .0, length(fract(sg) - .5)) * smoothstep(.0, .5, p.y) * (.6 + .4 * sin(LA * 2. + hash21(floor(sg)) * 6.));
  // 5 layers of trees, far to near
  for (int l = 0; l < 5; l++) {
    float fl = float(l);
    float depth = 1. - fl / 4.;                       // 1 far .. 0 near
    float scale = mix(1.2, 3.6, depth);
    float base = mix(-.95, -.15, depth);
    vec2 q = vec2((p.x + drift * (1.2 - depth)) * scale + fl * 3.3, (p.y - base) * scale);
    float id = floor(q.x / .5);
    float inTree = 0.;
    for (int s = -1; s <= 1; s++) {
      float cid = id + float(s);
      inTree = max(inTree, tree(vec2(q.x - (cid + .5) * .5 - (hash11(cid + fl * 9.) - .5) * .25, q.y), cid * 3.1 + fl * 17.));
    }
    inTree = max(inTree, step(q.y, .0));               // the ground
    vec3 treeCol = mix(vec3(.005, .015, .02), vec3(.08, .12, .22), depth * depth);
    col = mix(col, treeCol, inTree);
    // mist in front of this layer
    float mist = (.5 + .5 * fbm(vec2(p.x * 1.5 + cos(LA) * .3 + fl * 4., p.y * 3. + sin(LA) * .3))) * smoothstep(base + .5, base - .1, p.y);
    col = mix(col, vec3(.22, .3, .5), mist * .45 * depth);
  }
  // fireflies: points wandering on small loops, blinking
  for (int i = 0; i < 40; i++) {
    float k = float(i);
    vec3 h = vec3(hash11(k), hash11(k + 10.), hash11(k + 20.));
    vec2 c = vec2((h.x - .5) * 3.6, -.85 + h.y * 1.1) + .12 * vec2(cos(LA * floor(1. + 2. * h.z) + k), sin(LA * 2. + k * 1.3));
    c.x += drift * .9;
    float blink = pow(max(sin(LA * floor(1. + 3. * h.z) + h.x * TAU), 0.), 3.);
    float d = length(p - c);
    col += vec3(.75, 1., .35) * blink * (smoothstep(.014, .0, d) * 3. + .5 * exp(-d * 25.));
  }
  outColor = finish(col);
}
