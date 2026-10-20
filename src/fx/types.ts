// The effects scrollwork/fx plays, as read from an item's `fx` list. Every
// field has a default (spec.ts); a page writes only what it means.

/** What drives an effect: hovering (and keyboard focus), its appear, every frame, the scroll speed, or (1.18) how far through its scroll range the element is */
export type FxOn = 'hover' | 'appear' | 'always' | 'scroll' | 'progress';

export interface FxBase {
  on: FxOn;
  /** how strong, 0 to 1 */
  intensity: number;
  /** how fast its own movement runs, a multiple of its natural speed */
  speed: number;
  /** the random pattern's seed, so two hosts can differ or match */
  seed: number;
  /** seconds to come in and go out, for hover */
  in: number;
  out: number;
}

/** Pixel blocks shift about and the colours split, as a broken signal */
export interface GlitchFx extends FxBase {
  type: 'glitch';
  /** blocks across the width */
  blocks: number;
  /** px the red and blue channels move apart at full strength */
  split: number;
}

/**
 * A field of dots: ordered dithering (bayer) or a halftone screen of a slow
 * drifting cloud, or of the element's own picture when it has one. The pointer
 * leaves a trail that thins the dots and tints the paper. Drawn at one bitmap
 * pixel per CSS pixel and scaled without smoothing, so the dots stay crisp.
 */
export interface DitherFx extends FxBase {
  type: 'dither';
  mode: 'bayer' | 'halftone';
  /** px: a bayer cell, or a halftone dot's spacing */
  size: number;
  /** px: how large the cloud's shapes are */
  scale: number;
  /** the dots, any CSS hex or rgb() colour */
  color: string;
  /** between the dots; transparent lets the element's own fill show */
  color2: string;
  /** the trail's tint on the paper */
  accent: string;
  /** px: the trail's reach around the pointer */
  radius: number;
  /** seconds the trail takes to catch up with the pointer */
  trail: number;
}

/**
 * Pixel distortion (after Codrops' Distorted Pixels, MIT): the picture is cut
 * into a grid of cells, and the pointer moving over it pushes the cells near
 * it along its own direction; each cell then eases back to its place. Big
 * cells read as blocks (grid 50), many small ones as a liquid smear (grid 607).
 */
export interface DistortFx extends FxBase {
  type: 'distort';
  /** cells across the picture, and down: 2 to 1000 */
  grid: number;
  /** the pointer's reach, as a fraction of the grid, 0 to 1 */
  mouse: number;
  /** how far a push moves the cells, 0 to 1 (times intensity) */
  strength: number;
  /** what each cell keeps of its offset every frame (at 60 per second): 0.9 settles fast, 0.96 slowly */
  relaxation: number;
}

/**
 * A bulge (after Codrops' 3D Bulge Text Effect, MIT): the picture, or the
 * element's text, swells towards the eye around the pointer, magnified under
 * a dome that is lit from the top left. The dome follows the pointer a little
 * behind. On a text element its words are drawn into the picture it bulges.
 */
export interface BulgeFx extends FxBase {
  type: 'bulge';
  /** the dome's radius, as a fraction of the element's width: 0.02 to 1 */
  reach: number;
  /** how far it magnifies, 0 to 1 (times intensity) */
  strength: number;
  /** how much the dome's slopes are lit and shaded, 0 to 1 */
  shade: number;
  /** seconds the dome takes to catch up with the pointer */
  trail: number;
}

/**
 * (1.18) A colour map: the picture's light read through five colours, dark to light (a heat camera's view: deep
 * violet, magenta, orange, a near white). It fades in over the picture or sweeps across it from the left, as far
 * as its drive: on `progress`, with the element's scroll.
 */
export interface ColormapFx extends FxBase {
  type: 'colormap';
  /** the ramp, darkest to lightest, any CSS hex or rgb() colour */
  color: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  /** fade: the whole picture at once; sweep: from the left edge across */
  reveal: 'fade' | 'sweep';
  /** how the light is read before the ramp: above 1 keeps more of it dark, below 1 lifts it */
  curve: number;
}

export type Fx = GlitchFx | DitherFx | DistortFx | BulgeFx | ColormapFx;
export type FxType = Fx['type'];

/** The picture an effect reads: the host's own, found at mount */
export type TexState = 'none' | 'loading' | 'ready' | 'failed';
