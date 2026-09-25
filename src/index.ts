// Scrollwork: scroll, appear, pin and interaction motion, from a spec or from
// data-scrollwork attributes, plus animate(), inView() and scroll() for code.

import { autoWith, readPage, type AutoOptions } from './auto.js';
import { startEngine } from './engine.js';
import { readSpec } from './spec.js';
import type { MotionControl, MotionOptions, MotionSpec } from './types.js';

declare const __SCROLLWORK_VERSION__: string;
/** set at build time from package.json */
export const version: string = typeof __SCROLLWORK_VERSION__ === 'string' ? __SCROLLWORK_VERSION__ : 'dev';

/** Play a spec. It is read and checked first: missing fields take their defaults, and what cannot be read is said in the console. */
export function start(spec: MotionSpec | Record<string, unknown>, options: MotionOptions): MotionControl {
  return startEngine(readSpec(spec, options.warn !== false), options);
}

/** Play every element with a data-scrollwork attribute under `root` (the whole body by default). */
export function auto(root?: HTMLElement, options?: AutoOptions): MotionControl {
  return autoWith(startEngine, root || document.body, options);
}

export { readPage, readSpec };
export { animate, type AnimateOptions, type Controls, type Keyframes, type Targets, type Value } from './animate.js';
export { inView, type InViewOptions } from './inview.js';
export { scroll, type ScrollOptions, type ScrollHandler } from './scroll.js';
export { bezier, CURVES, EASES, easeOf, type EaseFn, type EaseInput } from './easing.js';
export type { AutoOptions } from './auto.js';
export * from './types.js';
