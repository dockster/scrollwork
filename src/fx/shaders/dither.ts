// Dither: a field of dots. The tone comes from the element's picture when it
// has one, or from a slow cloud of value noise drifting across it; each cell
// is then inked or not by an ordered (bayer) threshold, or drawn as a dot of a
// halftone screen. Around the pointer, and along the path it just took, the
// dots thin out and the paper takes the accent colour.

export const DITHER = `
uniform float u_mode;
uniform float u_size;
uniform float u_scale;
uniform float u_radius;
uniform float u_unit;
uniform float u_hasTex;
uniform float u_hover;
uniform vec2 u_lag;
uniform vec4 u_color;
uniform vec4 u_color2;
uniform vec4 u_accent;

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float cloud(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}
float bayer4(vec2 c) {
  vec2 m = mod(c, 4.0);
  int i = int(m.x) + int(m.y) * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[i]) + 0.5) / 16.0;
}
/** distance from p to the segment a-b */
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}

void main() {
  vec2 css = u_res / u_unit;
  vec2 px = v_uv * u_res;
  float t = u_time * u_speed;
  // one cell of dots, in bitmap pixels: whole pixels, so the pattern never smears
  float cell = max(1.0, floor(u_size * u_unit + 0.5));
  if (u_mode > 0.5) cell = max(2.0, floor(u_size * 3.0 * u_unit + 0.5));
  vec2 c = floor(px / cell);
  vec2 centre = (c + 0.5) * cell / u_res;
  vec2 at = centre * css;

  float tone;
  if (u_hasTex > 0.5) {
    vec4 s = pic(centre);
    tone = 1.0 - dot(s.rgb / max(s.a, 1e-3), vec3(0.299, 0.587, 0.114));
    tone *= s.a;
  } else {
    vec2 q = at / u_scale + vec2(u_seed * 13.7, u_seed * 7.3);
    float n = cloud(q + vec2(t * 0.045, t * 0.02) + 0.35 * vec2(cloud(q * 0.7 - t * 0.03), cloud(q * 0.7 + 4.1 + t * 0.025)));
    tone = smoothstep(0.22, 0.78, n);
  }
  tone *= u_intensity;

  // the trail: from where the pointer was a moment ago to where it is
  float d = seg(v_uv * css, u_lag * css, u_pointer * css);
  float near = (1.0 - smoothstep(0.0, max(u_radius, 1.0), d)) * u_hover;
  tone *= 1.0 - 0.65 * near;

  float on;
  if (u_mode > 0.5) {
    // halftone: a round dot in every cell, as large as the tone is dark
    vec2 f = (px - c * cell) / cell - 0.5;
    on = step(length(f), sqrt(tone) * 0.62);
  } else {
    on = step(bayer4(c), tone);
  }
  // mixed premultiplied, so a transparent paper takes the accent without going dark
  vec4 paper = mix(vec4(u_color2.rgb * u_color2.a, u_color2.a), vec4(u_accent.rgb, 1.0), near * u_accent.a);
  o = mix(paper, vec4(u_color.rgb * u_color.a, u_color.a), on);
}`;
