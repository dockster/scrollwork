/*! Pixel distortion after Codrops' Distorted Pixels, MIT, (c) Codrops: github.com/akella/DistortedPixels */

// Pixel distortion, after Codrops' Distorted Pixels (MIT, (c) Codrops,
// github.com/akella/DistortedPixels; docs/THIRD-PARTY.md): the picture is
// drawn shifted by an offset grid the surface keeps (surface.ts, u_offsets,
// nearest-sampled so each cell moves as one block). Rows of the grid count up
// from the bottom, as in the original; the picture's uv counts down.

export const DISTORT = `
uniform sampler2D u_offsets;
void main() {
  vec2 off = texture(u_offsets, vec2(v_uv.x, 1.0 - v_uv.y)).rg;
  o = pic(v_uv - 0.02 * vec2(off.x, -off.y));
}`;
