// scroll(): progress through the page, or through one element's passage,
// handed to a function or scrubbing an animation or a timeline.
//
//   scroll((p) => bar.style.scale = `${p} 1`);                       // the page, 0 to 1
//   scroll(animate('.hero img', { y: [0, 120] }, { autoplay: false }), { target: '.hero' });
//   scroll(tl, { target: '.story', start: 'top top', end: '+=2000', smooth: 0.4, snap: 0.25 });
//
// `start` and `end` say where the passage begins and ends: "<a place on the
// target> <a place on the view>", each top, center, bottom, a percent or px
// ("top 80%": the target's top reaches 80% down the view). `end` may be
// "+=600", 600px of scrolling after the start. A number is a scroll position.

import type { Controls } from './player.js';
import { resolveTargets, type Targets } from './tween.js';
import { clamp01 } from './easing.js';
import { every, prefersReduced } from './ticker.js';

export type ScrollRange = 'through' | 'in' | 'out';

export interface ScrollOptions {
  /** the element whose passage is measured; the whole page (or container) when unset */
  target?: Targets;
  /** the scrolling box; the window when unset */
  container?: HTMLElement | null;
  /**
   * With a target: 'through' from its top entering to its bottom leaving,
   * 'in' from entering until it is centred, 'out' from centred until it leaves.
   * `start` and `end` replace it.
   */
  range?: ScrollRange;
  /** where the passage starts: "top bottom" (the target's top at the view's bottom), "top 80%", "center center", or a scroll position in px */
  start?: string | number;
  /** where it ends: as `start`, or "+=600" for 600px of scrolling after the start */
  end?: string | number;
  /** seconds the progress takes to catch up with the scroll (a softer scrub); 0 follows it exactly. None under reduced motion */
  smooth?: number;
  /** once scrolling stops inside the passage, glide to the nearest of these progress points: every `snap` (0.25) or a list ([0, 0.4, 1]) */
  snap?: number | number[];
  /** scrolling down, the passage starts */
  onEnter?: () => void;
  /** scrolling down, it ends */
  onLeave?: () => void;
  /** scrolling up, back into it from below */
  onEnterBack?: () => void;
  /** scrolling up, out of it above its start */
  onLeaveBack?: () => void;
}

export type ScrollHandler = ((progress: number) => void) | Controls;

const isControls = (h: ScrollHandler): h is Controls => typeof h === 'object' && h !== null && typeof (h as Controls).seek === 'function';

/** the start and end each range stands for */
const EDGES: Record<ScrollRange, [string, string]> = { through: ['top bottom', 'bottom top'], in: ['top bottom', 'center center'], out: ['center center', 'bottom top'] };

/** A place along a length: top 0, center half, bottom all of it, N% of it, N px; "+=N" or "-=N" (px or %) after it. */
export function edge(word: string, size: number): number {
  const m = /^(top|center|bottom|left|right|-?[\d.]+%?(?:px)?)?\s*(?:([+-])=\s*(-?[\d.]+)(%|px)?)?$/.exec(word.trim());
  if (!m) return 0;
  const w = m[1] || 'top';
  let v = w === 'top' || w === 'left' ? 0 : w === 'center' ? size / 2 : w === 'bottom' || w === 'right' ? size : w.endsWith('%') ? (parseFloat(w) / 100) * size : parseFloat(w);
  if (m[2]) v += (m[2] === '-' ? -1 : 1) * (m[4] === '%' ? (parseFloat(m[3]) / 100) * size : parseFloat(m[3]));
  return Number.isFinite(v) ? v : 0;
}

/**
 * The scroll position where "<target place> <view place>" happens, for a
 * target whose top is at `absTop` when the scroll is 0 and `h` high, in a view
 * `vh` high. A number is a position as it is.
 */
export function positionOf(spec: string | number, absTop: number, h: number, vh: number): number {
  if (typeof spec === 'number') return spec;
  const [t, v] = spec.trim().split(/\s+(?![+-]=)/);
  return absTop + edge(t || 'top', h) - edge(v || 'top', vh);
}

/**
 * Measure where a target is, as progress along its range. `top` and `h` are
 * the target's top and height in the view, `vh` the view's height.
 */
export function rangeProgress(range: ScrollRange, top: number, h: number, vh: number): number {
  const [a, b] = EDGES[range] || EDGES.through;
  const y0 = positionOf(a, top, h, vh);
  const y1 = positionOf(b, top, h, vh);
  return y1 > y0 ? clamp01(-y0 / (y1 - y0)) : 0;
}

/** The nearest snap point to `p`: every `snap` (0, 0.25, ... 1), or the nearest of a list. */
export function snapTo(p: number, snap: number | number[]): number {
  const points = Array.isArray(snap) ? snap.filter((x) => Number.isFinite(x)) : snap > 0 ? Array.from({ length: Math.floor(1 / snap + 1e-9) + 1 }, (_, i) => i * snap).concat(1) : [];
  if (!points.length) return p;
  return points.reduce((best, x) => (Math.abs(x - p) < Math.abs(best - p) ? x : best), points[0]);
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
  const [s0, s1] = EDGES[options.range ?? 'through'] || EDGES.through;
  const startSpec = options.start ?? (target ? s0 : 0);
  const endSpec = options.end;
  if (isControls(handler)) {
    handler.pause();
    // the animation's own setting decides (reducedMotion: 'never' keeps following)
    if (handler.reduced) {
      handler.finish();
      return () => {};
    }
  }

  /** the scroll positions of the passage's start and end, and where the scroll is */
  const measure = () => {
    const vh = container ? container.clientHeight : window.innerHeight;
    const y = container ? container.scrollTop : window.scrollY;
    const max = container ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
    let absTop = 0;
    let h = 0;
    if (target) {
      const r = target.getBoundingClientRect();
      absTop = (container ? r.top - container.getBoundingClientRect().top - container.clientTop : r.top) + y;
      h = r.height;
    }
    const y0 = positionOf(startSpec, absTop, h, vh);
    let y1: number;
    if (typeof endSpec === 'string' && /^\s*\+=/.test(endSpec)) y1 = y0 + edge(endSpec.trim(), vh);
    else if (endSpec !== undefined) y1 = positionOf(endSpec, absTop, h, vh);
    else y1 = target ? positionOf(s1, absTop, h, vh) : max;
    return { y, y0, y1 };
  };
  const read = () => {
    const { y, y0, y1 } = measure();
    return y1 > y0 ? clamp01((y - y0) / (y1 - y0)) : y >= y0 ? 1 : 0;
  };

  const reduced = prefersReduced();
  const lag = reduced ? 0 : Math.max(0, options.smooth ?? 0) * 1000;
  /** what the handler was last given (-1 before the first), and the progress the scroll is at */
  let shown = -1;
  let goal = 0;
  let prev = 0;
  let stopSmooth: (() => void) | null = null;
  const give = (p: number) => {
    shown = p;
    if (isControls(handler)) handler.seek(p);
    else handler(p);
  };
  // a softer scrub: the progress closes on the scroll's, a share of the way each frame
  let lastNow = 0;
  const glide = (now: number) => {
    const dt = lastNow ? Math.min(100, now - lastNow) : 16;
    lastNow = now;
    const next = shown + (goal - shown) * (1 - Math.exp(-dt / Math.max(1, lag / 3)));
    if (Math.abs(goal - next) < 0.0005) {
      give(goal);
      stopSmooth = null;
      lastNow = 0;
      return false;
    }
    give(next);
    return true;
  };
  const cross = (p: number) => {
    if (prev <= 0 && p > 0) options.onEnter?.();
    if (prev < 1 && p >= 1) options.onLeave?.();
    if (prev >= 1 && p < 1) options.onEnterBack?.();
    if (prev > 0 && p <= 0) options.onLeaveBack?.();
    prev = p;
  };

  let raf = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    raf = 0;
    goal = read();
    cross(goal);
    if (!lag || shown < 0) give(goal);
    else if (!stopSmooth) stopSmooth = every(glide);
  };
  // snapping: once scrolling has stopped for a moment inside the passage
  const settle = () => {
    idle = undefined;
    if (options.snap === undefined) return;
    const { y, y0, y1 } = measure();
    if (y1 <= y0 || y < y0 || y > y1) return;
    const to = y0 + snapTo((y - y0) / (y1 - y0), options.snap) * (y1 - y0);
    if (Math.abs(to - y) < 1) return;
    (container || window).scrollTo({ top: to, behavior: reduced ? 'auto' : 'smooth' });
  };
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(update);
    if (options.snap !== undefined) {
      if (idle) clearTimeout(idle);
      idle = setTimeout(settle, 150);
    }
  };
  const surface: EventTarget = container || window;
  surface.addEventListener('scroll', soon, { passive: true });
  window.addEventListener('resize', soon);
  update();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (idle) clearTimeout(idle);
    stopSmooth?.();
    surface.removeEventListener('scroll', soon);
    window.removeEventListener('resize', soon);
  };
}
