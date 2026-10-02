// Glitch: blocks of the picture shift sideways in steps, a few at a time, and
// the red and blue channels drift apart. Stronger near the pointer. At k 0 it
// is the picture as it was.

export const GLITCH = `
uniform float u_blocks;
uniform float u_split;
void main() {
  vec2 uv = v_uv;
  float amt = u_k * u_intensity;
  // the pattern changes in steps, not every frame: a signal breaking up, not noise
  float step_ = floor(u_time * u_speed * 14.0);
  vec2 grid = vec2(u_blocks, max(2.0, floor(u_blocks * u_res.y / u_res.x)));
  vec2 cell = floor(uv * grid);
  // a few rows break: each row decides once per step, each block within it a little differently
  float row = hash(vec2(cell.y, step_ + u_seed));
  float on = step(1.0 - amt * 0.55, row);
  float dir = hash(cell + step_ * 0.37 + u_seed) - 0.5;
  float near = 1.0 - smoothstep(0.0, 0.6, distance(uv, u_pointer));
  vec2 shift = vec2(on * dir * 0.18 * amt * (1.0 + near * 1.5), 0.0);
  // a thin band now and then slips vertically too
  float band = step(0.985 - amt * 0.01, hash(vec2(cell.y * 3.1, step_ * 1.3 + u_seed)));
  shift.y += band * (hash(vec2(step_, cell.y)) - 0.5) * 0.08 * amt;
  vec2 s = vec2(u_split * amt * (0.6 + near) / u_res.x, 0.0);
  vec4 c = pic(uv + shift);
  o = vec4(pic(uv + shift + s).r, c.g, pic(uv + shift - s).b, c.a);
}`;
