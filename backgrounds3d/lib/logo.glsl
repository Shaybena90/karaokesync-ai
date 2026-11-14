// The KaraokeSync AI logo (web/src/components/Logo.tsx, a 64x64 drawing):
// a rounded square in a purple-to-blue gradient with a white microphone.
// Here 1 unit = half the square (the drawing's 32 px), y up, centre (0, 0).
const vec3 LOGO_PURPLE = vec3(.659, .333, .969);   // #a855f7
const vec3 LOGO_BLUE = vec3(.231, .51, .965);      // #3b82f6

float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }

// centre lines of the microphone's strokes (for neon tubes); the capsule is its outline
float logoMicLines(vec2 p) {
  float cap = abs(sdSeg(p, vec2(0., .0625), vec2(0., .406)) - .25);
  vec2 c = vec2(0., .031);
  float arc = p.y < c.y ? abs(length(p - c) - .469) : min(length(p - c - vec2(.469, 0.)), length(p - c + vec2(.469, 0.)));
  float stem = sdSeg(p, vec2(0., -.4375), vec2(0., -.656));
  float base = sdSeg(p, vec2(-.25, -.656), vec2(.25, -.656));
  return min(min(cap, arc), min(stem, base));
}

// the filled microphone (capsule + strokes 4 px wide)
float logoMic(vec2 p) {
  float cap = sdSeg(p, vec2(0., .0625), vec2(0., .406)) - .25;
  vec2 c = vec2(0., .031);
  float arc = (p.y < c.y ? abs(length(p - c) - .469) : min(length(p - c - vec2(.469, 0.)), length(p - c + vec2(.469, 0.)))) - .0625;
  float stem = sdSeg(p, vec2(0., -.4375), vec2(0., -.656)) - .0625;
  float base = sdSeg(p, vec2(-.25, -.656), vec2(.25, -.656)) - .0625;
  return min(min(cap, arc), min(stem, base));
}

float logoTile(vec2 p) { return sdRoundRect(p, vec2(1.), .5); }

// gradient of the square: purple at the top left, blue at the bottom right
vec3 logoGradient(vec2 p) { return mix(LOGO_PURPLE, LOGO_BLUE, clamp(.5 + .35 * (p.x - p.y), 0., 1.)); }

// The logo as a 3D object: a thick rounded tile with the microphone standing
// out on both faces. Returns (distance, material): 1 = tile, 2 = microphone.
vec2 sdLogo(vec3 p) {
  float d2 = logoTile(p.xy);
  vec2 w = vec2(d2 + .06, abs(p.z) - .14);
  float tile = min(max(w.x, w.y), 0.) + length(max(w, 0.)) - .06;
  vec2 m = vec2(logoMic(p.xy) + .02, abs(p.z) - .22);
  float mic = min(max(m.x, m.y), 0.) + length(max(m, 0.)) - .02;
  return mic < tile ? vec2(mic, 2.) : vec2(tile, 1.);
}

// Flat logo picture (for decals and screens): colour and coverage at p.
vec4 logoPicture(vec2 p, float aa) {
  float tile = smoothstep(aa, -aa, logoTile(p));
  float mic = smoothstep(aa, -aa, logoMic(p));
  vec3 col = mix(logoGradient(p), vec3(1.), mic);
  return vec4(col, tile);
}
