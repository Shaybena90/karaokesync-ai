// Star warp: flying fast through a field of stars that stretch into streaks,
// past a glowing coloured nebula. Stars sit on layers that move one layer
// spacing per loop step, so the flight repeats seamlessly.
void main() {
  vec2 p = screen();
  p *= rot(.15 * sin(LA));
  vec3 col = vec3(0.);
  // nebula: two clouds sampled on a circle in noise space (so it loops)
  vec2 c1 = vec2(cos(LA), sin(LA)) * .6;
  float n1 = fbm(p * 1.3 + c1 + 3.), n2 = fbm(p * 2.1 - c1 * .7 + 11.);
  col += vec3(.45, .1, .6) * pow(n1, 2.2) * 1.2 + vec3(.05, .35, .7) * pow(n2, 2.5) * 1.1;
  col *= smoothstep(1.6, .2, length(p));
  col += vec3(.6, .4, 1.) * .25 * exp(-length(p) * 2.5);   // light at the end of the tunnel
  const int L = 24;
  for (int i = 0; i < L; i++) {
    float fi = float(i);
    // depth goes 1 -> 0 as the layer comes towards us; 4 layers pass per loop... each layer recycles
    float z = fract(fi / float(L) - PHASE * 3.);
    float scale = mix(18., .6, z);           // far layers are dense and small
    vec2 off = vec2(fi * 7.31, fi * 3.17);
    vec2 uv = p * scale + off;
    vec2 id = floor(uv);
    vec3 h = hash32(id + fi * 13.);
    if (h.z < .9) continue;
    vec2 sp = id + .2 + .6 * h.xy;
    vec2 d = uv - sp;
    // streak along the direction from the centre
    vec2 dir = normalize((sp - off) / scale + 1e-4);   // away from the centre of the screen
    float along = dot(d, dir), across = dot(d, vec2(-dir.y, dir.x));
    float len = (.05 + 2.5 * (1. - z) * (1. - z)) * min(1., length((sp - off) / scale) * 1.5);
    float s = smoothstep(.07, .0, abs(across)) * smoothstep(len, .0, abs(along - len * .5) * 1.2);
    float fade = smoothstep(1., .7, z) * smoothstep(.0, .12, z);
    vec3 sc = mix(vec3(.7, .85, 1.), vec3(1., .75, .9), h.x);
    col += sc * s * fade * (1.5 - z);
  }
  outColor = finish(col);
}
