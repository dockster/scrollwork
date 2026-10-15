// flip(): animate a change of layout. Capture where the elements are, change
// the page (reorder, filter, move into another container, resize), then flip:
// each element starts where it was and glides to where it is now.
//
//   const before = capture('.card');
//   grid.classList.toggle('list');
//   flip(before, { duration: 0.5, ease: 'expo', stagger: 0.02 });
//
// Elements that were not there before come in (a fade and a small scale by
// default); elements gone from the page are left alone.

import { timeline, type Keyframes, type Timeline, type TweenOptions } from '../index.js';
import { els, type Targets } from './util.js';

export interface FlipState {
  rects: Map<HTMLElement, DOMRect>;
  targets: Targets;
}

/** Where each element is now, for a flip after the page changes. */
export function capture(targets: Targets): FlipState {
  const rects = new Map<HTMLElement, DOMRect>();
  for (const el of els(targets)) rects.set(el, el.getBoundingClientRect());
  return { rects, targets };
}

export interface FlipOptions extends TweenOptions {
  /** the elements to flip now; the captured selector again by default (so new ones are found) */
  targets?: Targets;
  /** stretch from the old size to the new (true), or only move: text keeps its shape */
  scale?: boolean;
  /** how an element that was not there before comes in; false for not at all */
  enter?: Keyframes | false;
  autoplay?: boolean;
  onComplete?: () => void;
}

export function flip(state: FlipState, options: FlipOptions = {}): Timeline {
  const { targets, scale = true, enter = { opacity: [0, 1], scale: [0.96, 1] }, autoplay, onComplete, ...tween } = options;
  const now = els(targets ?? state.targets);
  const tl = timeline({ autoplay, onComplete, defaults: { duration: 0.5, ease: 'expo' } });
  const stagger = tween.stagger ?? 0;
  now.forEach((el, i) => {
    const at = i * stagger;
    const was = state.rects.get(el);
    const o = { ...tween, stagger: 0 };
    if (!was) {
      if (enter) tl.add(el, enter, o, at);
      return;
    }
    const r = el.getBoundingClientRect();
    const dx = was.left + was.width / 2 - (r.left + r.width / 2);
    const dy = was.top + was.height / 2 - (r.top + r.height / 2);
    const kf: Keyframes = { x: [dx, 0], y: [dy, 0] };
    if (scale && r.width && r.height) {
      kf.scaleX = [was.width / r.width, 1];
      kf.scaleY = [was.height / r.height, 1];
    }
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || (scale && (Math.abs(was.width - r.width) > 0.5 || Math.abs(was.height - r.height) > 0.5))) tl.add(el, kf, o, at);
  });
  return tl;
}
