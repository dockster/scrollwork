// The effects scrollwork/fx plays, as read from an item's `fx` list. Every
// field has a default (spec.ts); a page writes only what it means.

/** What drives an effect: hovering (and keyboard focus), its appear, every frame, or the scroll speed */
export type FxOn = 'hover' | 'appear' | 'always' | 'scroll';

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

export type Fx = GlitchFx | DitherFx;
export type FxType = Fx['type'];

/** The picture an effect reads: the host's own, found at mount */
export type TexState = 'none' | 'loading' | 'ready' | 'failed';
