// The KaraokeSync logo as a neon sign on a brick wall at night: glowing glass
// tubes a little in front of the wall, their light and shadow on the bricks,
// and a short flicker now and then.
#include "lib/logo.glsl"

vec3 bricks(vec2 uv, out vec3 n) {
  vec2 b = uv * vec2(2.2, 4.4);
  b.x += .5 * mod(floor(b.y), 2.);
  vec2 f = fract(b), id = floor(b);
  float h = hash21(id);
  vec2 m = smoothstep(.0, .06, f) * smoothstep(1., .94, f);   // mortar lines
  float brick = m.x * m.y;
  float grain = noise(uv * 40.) * .5 + noise(uv * 90.) * .25;
  n = normalize(vec3((m.y * (1. - m.x)) * sign(f.x - .5) * .6 + (grain - .37) * .5, (m.x * (1. - m.y)) * sign(f.y - .5) * .6, -1.));
  vec3 c = mix(vec3(.16, .06, .05), vec3(.26, .1, .08), h) * (.75 + .5 * grain);
  return mix(vec3(.08, .07, .07), c, brick);
}

void main() {
  vec2 p = screen();
  vec3 ro = vec3(.45 * sin(LA), .05 * cos(LA), -3.3);
  vec3 rd = lookAt(ro, vec3(0., 0., 0.), p, 1.5, 0.);
  // flicker: on most of the time, two quick blinks per loop (fixed moments)
  float ph = PHASE;
  float flick = 1. - .85 * (step(.42, ph) * step(ph, .44) + step(.47, ph) * step(ph, .48) + step(.86, ph) * step(ph, .87));
  float hum = .93 + .07 * sin(LA * 30.);
  // the wall at z = 0
  float tw = -ro.z / rd.z;
  vec3 wp = ro + rd * tw;
  vec3 n;
  vec3 wall = bricks(wp.xy, n);
  vec2 lp = wp.xy / 1.05;
  // tubes sit 0.12 in front of the wall: where the eye ray crosses that plane
  float tt = (-.12 - ro.z) / rd.z;
  vec2 tp = (ro + rd * tt).xy / 1.05;
  float frame = abs(logoTile(tp) + .08);
  float mic = logoMicLines(tp);
  vec3 frameCol = logoGradient(tp) * 1.6;
  vec3 micCol = vec3(1., .85, 1.) * 1.3;
  // light on the wall from the tubes (distance in the wall plane)
  float fw = abs(logoTile(lp) + .08), mw = logoMicLines(lp);
  vec3 light = (logoGradient(lp) * exp(-fw * 5.) * .9 + vec3(1., .7, 1.) * exp(-mw * 6.) * .6 * flick) * hum;
  // the tube's shadow, a little below and to the side
  float sh = min(abs(logoTile(lp + vec2(.04, .07)) + .08), logoMicLines(lp + vec2(.04, .07)));
  float shadow = 1. - .5 * smoothstep(.04, .0, sh);
  float dif = max(dot(n, normalize(vec3(.0, .0, -1.))), 0.);
  vec3 col = wall * (.06 + light * 1.4 * dif) * shadow;
  col += vec3(.06, .03, .1) * smoothstep(1.4, -1., p.y) * .3;   // a little street light from below
  // the glass tubes: bright core and soft glow
  col += frameCol * (smoothstep(.028, .012, frame) * 1.8 + exp(-frame * 22.) * .35) * hum;
  col += micCol * (smoothstep(.026, .01, mic) * 1.8 + exp(-mic * 24.) * .35) * flick * hum;
  // tube holders
  for (int i = 0; i < 4; i++) {
    vec2 c = vec2(i < 2 ? -.6 : .6, mod(float(i), 2.) < 1. ? .92 : -.92) * 1.05;
    col = mix(col, vec3(.12), smoothstep(.025, .015, length(wp.xy - c)));
  }
  outColor = finish(col);
}
