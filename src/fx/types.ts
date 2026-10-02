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

export type Fx = GlitchFx;
export type FxType = Fx['type'];

/** The picture an effect reads: the host's own, found at mount */
export type TexState = 'none' | 'loading' | 'ready' | 'failed';
