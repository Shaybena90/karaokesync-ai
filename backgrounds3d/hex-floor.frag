// Hexagon floor: an endless glossy floor of hexagon tiles that light up in
// waves of colour, under a deep sky with a glowing horizon. Ray vs plane.
vec4 hexCoords(vec2 uv) {
  vec2 r = vec2(1., 1.7320508);
  vec2 h = r * .5;
  vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);    // position inside the cell, cell centre
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(0., 1.6, 0.);
  // glide over the floor: exactly 12 rows of hexagons per loop (a row is 1.732 / 1.6 units deep)
  ro.z = PHASE * 1.7320508 * 12. / 1.6;
  ro.x = .5 * sin(LA);
  vec3 rd = lookAt(ro, ro + vec3(.25 * sin(LA + 1.), -.45, 1.), p, 1.3, .06 * sin(LA));
  vec3 horizon = vec3(.28, .05, .38);
  vec3 col = mix(horizon, vec3(.01, .0, .04), smoothstep(-.02, .45, rd.y));
  col += vec3(1., .3, .7) * .6 * exp(-abs(rd.y) * 30.);
  if (rd.y < 0.) {
    float t = -ro.y / rd.y;
    vec3 pos = ro + rd * t;
    vec4 hx = hexCoords(pos.xz * 1.6);
    vec2 gv = hx.xy, id = hx.zw;
    // distance to the hexagon edge
    vec2 q = abs(gv);
    float edge = .5 - max(dot(q, normalize(vec2(1., 1.7320508))), q.x);
    float fw = fwidth(edge) * 1.5;
    float line = smoothstep(.04 + fw, .04 - fw * .5, edge);
    vec2 key = floor(id / vec2(.5, .8660254) + .5);          // whole numbers for each cell
    key.y = mod(key.y, 24.);                                  // the pattern repeats after one loop of travel
    float rnd = hash21(key + 1.);
    // waves of light running across the floor (whole turns per loop)
    float wave = .5 + .5 * sin(length(id - vec2(0., ro.z * 1.6)) * .5 - LA * 3. + rnd * 1.5);
    float lit = pow(wave, 8.) * step(.55, rnd);
    vec3 cellCol = pal(rnd * .4 + id.x * .02, vec3(.55), vec3(.45), vec3(1.), vec3(.55, .25, .05));
    float fade = exp(-.035 * t);
    vec3 floorCol = vec3(.006, .003, .012) + cellCol * lit * 1.8 + mix(vec3(.2, .6, 1.), vec3(1., .3, .8), wave) * line * (.12 + 1.2 * lit);
    // the sky reflected in the glossy tiles
    float fres = .02 + .4 * pow(1. - max(-rd.y, 0.), 5.);
    floorCol += horizon * fres * .5;
    col = mix(horizon * .45, floorCol, fade);
  }
  outColor = finish(col);
}
