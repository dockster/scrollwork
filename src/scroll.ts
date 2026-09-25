// scroll(): progress through the page, or through one element's passage,
// handed to a function or scrubbing an animation.
//
//   scroll((p) => bar.style.scale = `${p} 1`);                       // the page, 0 to 1
//   scroll(animate('.hero img', { y: [0, 120] }, { autoplay: false }), { target: '.hero' });

import type { Controls } from './animate.js';
import { resolveTargets, type Targets } from './animate.js';
import { clamp01 } from './easing.js';

export interface ScrollOptions {
  /** the element whose passage is measured; the whole page (or container) when unset */
  target?: Targets;
  /** the scrolling box; the window when unset */
  container?: HTMLElement | null;
  /**
   * With a target: 'through' from its top entering to its bottom leaving,
   * 'in' from entering until it is centred, 'out' from centred until it leaves.
   */
  range?: 'through' | 'in' | 'out';
}

export type ScrollHandler = ((progress: number) => void) | Controls;

const isControls = (h: ScrollHandler): h is Controls => typeof h === 'object' && h !== null && typeof (h as Controls).seek === 'function';

/**
 * Measure where a target is, as progress along its range. `top` and `h` are
 * the target's top and height in the view, `vh` the view's height.
 */
export function rangeProgress(range: 'through' | 'in' | 'out', top: number, h: number, vh: number): number {
  if (range === 'in') return clamp01((vh - top) / Math.max(1, vh / 2 + h / 2));
  if (range === 'out') return clamp01((vh / 2 - h / 2 - top) / Math.max(1, vh / 2 + h / 2));
  return clamp01((vh - top) / Math.max(1, vh + h));
}

/**
 * Returns a function that stops listening. An animation driven under reduced
 * motion is shown at its end instead of following the scroll; a function
 * always gets the progress (the page decides what it means).
 */
export function scroll(handler: ScrollHandler, options: ScrollOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const container = options.container ?? null;
  const target = options.target ? resolveTargets(options.target)[0] : undefined;
  const range = options.range ?? 'through';
  if (isControls(handler)) {
    handler.pause();
    // the animation's own setting decides (reducedMotion: 'never' keeps following)
    if (handler.reduced) {
      handler.finish();
      return () => {};
    }
  }

  const read = () => {
    const vh = container ? container.clientHeight : window.innerHeight;
    if (target) {
      const r = target.getBoundingClientRect();
      const top = container ? r.top - container.getBoundingClientRect().top - container.clientTop : r.top;
      return rangeProgress(range, top, r.height, vh);
    }
    const y = container ? container.scrollTop : window.scrollY;
    const max = container ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp01(y / max) : 0;
  };
  let raf = 0;
  const update = () => {
    raf = 0;
    const p = read();
    if (isControls(handler)) handler.seek(p);
    else handler(p);
  };
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  const surface: EventTarget = container || window;
  surface.addEventListener('scroll', soon, { passive: true });
  window.addEventListener('resize', soon);
  update();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    surface.removeEventListener('scroll', soon);
    window.removeEventListener('resize', soon);
  };
}
