// Colour map: the picture's light read through a ramp of five colours, a heat camera's view of a room or a
// two-tone print. Driven by its `on` (a scroll's progress, a hover), it fades in over the picture or sweeps
// across it from the left. At k 0 it is the picture as it was.

export const COLORMAP = `
uniform vec4 u_color;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform vec4 u_color4;
uniform vec4 u_color5;
uniform float u_reveal;
uniform float u_curve;
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(u_color.rgb, u_color2.rgb, t);
  if (t < 2.0) return mix(u_color2.rgb, u_color3.rgb, t - 1.0);
  if (t < 3.0) return mix(u_color3.rgb, u_color4.rgb, t - 2.0);
  return mix(u_color4.rgb, u_color5.rgb, t - 3.0);
}
void main() {
  vec4 c = pic(v_uv);
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : c.rgb;
  float l = pow(dot(rgb, vec3(0.299, 0.587, 0.114)), u_curve);
  float amt = u_k * u_intensity;
  // swept: the mapped colours come in from the left, a soft edge running ahead of the progress
  float w = u_reveal > 0.5 ? 1.0 - smoothstep(amt * 1.1 - 0.05, amt * 1.1 + 0.05, v_uv.x) : amt;
  o = vec4(mix(rgb, ramp(l), w) * c.a, c.a);
}`;
