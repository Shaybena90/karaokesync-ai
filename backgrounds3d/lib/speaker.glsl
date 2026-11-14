// A loudspeaker cabinet whose woofer pumps to the beat (needs lib/logo.glsl for
// the logo on its front). Local space: front face towards -z, centre (0, 0, 0).
const vec3 SPK = vec3(.95, 1.45, .55);        // half size of the cabinet
const vec2 WOOFER = vec2(0., -.42);
const float WR = .72;
const vec2 TWEETER = vec2(0., .64);
const float TR = .24;
const vec2 SPK_LOGO = vec2(0., 1.13);
const float SPK_LOGO_SIZE = .17;

// 20 beats per loop (120 a minute): a hard hit that fades out
float beat() { return exp(-fract(PHASE * 20.) * 7.); }

// how far the front surface is pushed in at p (negative = out)
float speakerDepth(vec2 p, float pump) {
  float r = length(p - WOOFER);
  float d = 0.;
  if (r < WR) {
    d = .26 * (1. - r / WR);
    if (r < .2) d = .26 * (1. - .2 / WR) - .09 * sqrt(max(0., 1. - r * r / .04));   // dust cap
    d -= .045 * exp(-pow((r - WR * .9) / .05, 2.));                                    // rubber surround
    d -= pump * .08 * smoothstep(WR * .95, WR * .75, r);                               // the cone moves out
  }
  float r2 = length(p - TWEETER);
  if (r2 < TR) d -= .06 * sqrt(max(0., 1. - r2 * r2 / (TR * TR)));
  return d;
}

float sdSpeaker(vec3 p, float pump) {
  float w = smoothstep(.0, -SPK.z, p.z);
  vec3 q = p - vec3(0., 0., speakerDepth(p.xy, pump) * w);
  vec3 b = abs(q) - (SPK - .06);
  return (length(max(b, 0.)) + min(max(b.x, max(b.y, b.z)), 0.) - .06) * .75;
}

// colour of the speaker at local point p with local normal n, seen along rd,
// lit by `light`; `glow` is the colour of its neon ring and logo
vec3 shadeSpeaker(vec3 p, vec3 n, vec3 rd, vec3 light, vec3 glow, float pump, vec3 envTop) {
  vec3 r = reflect(rd, n);
  float dif = max(dot(n, light), 0.);
  float spec = pow(max(dot(r, light), 0.), 40.);
  float fres = pow(1. - max(dot(-rd, n), 0.), 4.);
  vec3 env = mix(vec3(.01), envTop, smoothstep(-.2, 1., r.y));
  vec3 col = vec3(.018) * (.3 + dif) + env * .08 + spec * .15 + fres * envTop * .15;   // black cabinet
  if (p.z < -SPK.z + .3 && abs(p.x) < SPK.x - .04 && abs(p.y) < SPK.y - .04) {         // the front
    float rw = length(p.xy - WOOFER), rt = length(p.xy - TWEETER);
    if (rw < WR) {
      float grooves = .5 + .5 * sin(rw * 120.);
      col = vec3(.03 + .012 * grooves) * (.4 + dif) + env * .12 + spec * .5;           // cone
      if (rw > WR * .82) col = vec3(.01) + env * .3 + spec * .9;                       // rubber surround
      if (rw < .2) col = vec3(.05) + env * .7 + spec * 1.5;                            // dust cap
    }
    float ring = smoothstep(.025, .0, abs(rw - WR - .03));
    col += glow * ring * (1.2 + 2.5 * pump);
    col += glow * .35 * exp(-max(rw - WR, 0.) * 18.) * step(WR, rw) * (.3 + pump);
    if (rt < TR) col = vec3(.25) * (.3 + dif) + env * .9 + spec * 2.;                   // metal tweeter
    col += glow * smoothstep(.02, .0, abs(rt - TR - .02)) * .9;
    vec4 logo = logoPicture((p.xy - SPK_LOGO) / SPK_LOGO_SIZE, .04);
    col = mix(col, logo.rgb * (1.1 + .6 * pump), logo.a);
  }
  return col;
}
