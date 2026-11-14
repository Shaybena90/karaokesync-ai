// Neon tunnel: flying through glowing rings. The tunnel wall is found exactly
// (a ray against a cylinder), so this one is cheap and razor sharp.
void main() {
  vec2 p = screen();
  float spacing = 1.6;
  float z0 = PHASE * spacing * 12.;          // 12 rings per loop
  vec3 ro = vec3(.35 * cos(LA), .25 * sin(2. * LA), z0);
  vec3 rd = lookAt(ro, ro + vec3(.2 * cos(LA + 1.), .15 * sin(2. * LA + 1.), 3.), p, 1.25, .25 * sin(LA));
  float R = 2.;
  // |ro.xy + t rd.xy| = R
  float a = dot(rd.xy, rd.xy), b = dot(ro.xy, rd.xy), c = dot(ro.xy, ro.xy) - R * R;
  float t = (-b + sqrt(b * b - a * c)) / a;
  vec3 h = ro + t * rd;
  float ang = atan(h.y, h.x);
  float z = h.z / spacing;
  float hue = h.z / (spacing * 12.);           // colour cycle = one loop of travel
  vec3 ringCol = pal(hue, vec3(.6), vec3(.5), vec3(1.), vec3(.0, .33, .67));
  vec3 lineCol = pal(hue + .5, vec3(.55), vec3(.45), vec3(1.), vec3(.1, .4, .7));
  float fz = abs(fract(z) - .5);
  float fw = fwidth(z);
  float ring = smoothstep(.06 + fw, .06 - fw, fz) + .5 * exp(-fz * 14.);
  float u = ang / TAU * 12.;
  float fu = fwidth(u);
  fu = fu > 1. ? 0.01 : fu;                    // the seam where the angle jumps from -pi to pi
  float seg = abs(fract(u) - .5);
  float lines = (smoothstep(.03 + fu, .03 - fu, seg) * .5 + .15 * exp(-seg * 25.)) * (.55 + .45 * sin(z * PI));
  // little lights running along the rings
  float dots = smoothstep(.08, .0, length(vec2(fract(ang / TAU * 32. + PHASE * 4.) - .5, (fract(z) - .5) * 4.)));
  float fog = exp(-.11 * t);
  // dark wall panels, lit a little by the rings
  vec3 wall = vec3(.012, .008, .03) * (1. + 3. * exp(-fz * 6.)) * (.7 + .3 * smoothstep(.0, .5, seg));
  vec3 col = wall * fog + (ringCol * ring * 2.2 + lineCol * lines * 1.2 + vec3(1.) * dots * 2.) * fog;
  // glow in the distance and a soft haze of the ring colours
  col += ringCol * .35 * exp(-3. * length(p - vec2(.0, .0))) * (1. - fog);
  col += .015 * ringCol * fog;
  outColor = finish(col);
}
