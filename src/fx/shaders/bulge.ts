/*! Bulge after Codrops' 3D Bulge Text Effect, MIT, (c) Codrops: tympanus.net/codrops/?p=76625 */

// A bulge, after Codrops' 3D Bulge Text Effect (MIT, (c) Codrops; docs/THIRD-PARTY.md).
// The original lifts the vertices of a finely cut plane towards a lit camera
// around the pointer; here the same dome is a lens: each point inside it reads
// the picture nearer the dome's centre (magnified, falling off to nothing at
// its rim), and its slope is lit from the top left. u_lag is the dome's
// centre, the pointer eased (surface.ts); distances are in widths, so it is round.

export const BULGE = `
uniform vec2 u_lag;
uniform float u_reach;
uniform float u_strength;
uniform float u_shade;
void main() {
  vec2 asp = vec2(1.0, u_res.y / u_res.x);
  vec2 d = (v_uv - u_lag) * asp;
  float r = length(d);
  float x = clamp(r / max(u_reach, 0.0001), 0.0, 1.0);
  float s = 0.6 * u_strength * u_intensity * u_k;
  // a dome that is flat on top and meets the picture at its rim: (1 - x^2)^2, its slope 4x(1 - x^2)
  float q = 1.0 - x * x;
  vec4 c = pic(u_lag + d * (1.0 - s * q * q) / asp);
  vec2 dir = r > 0.00001 ? d / r : vec2(0.0);
  float lit = dot(dir, vec2(-0.6, -0.8)) * 4.0 * x * q * s * u_shade;
  c.rgb = min(c.rgb * clamp(1.0 + lit, 0.0, 2.0), vec3(c.a));
  o = c;
}`;
