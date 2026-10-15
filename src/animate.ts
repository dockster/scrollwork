// animate(): move elements from code.
//
//   const a = animate('.card', { y: [40, 0], opacity: [0, 1] }, { duration: 0.6, stagger: 0.08 });
//   await a.finished;
//
// Motion values are relative to the element's own look: `y: 40` is 40px below
// where its CSS puts it, `scale: 1.1` is 10% larger than its own scale,
// `opacity: 0.5` is half its own opacity. A single number animates from rest
// to it; a list is keyframes, evenly spaced, the first being the start.
//
// Any other key is a CSS property or variable, from its value now to the one
// given (`width: '60%'`, `'--glow': 1`, `backgroundColor: '#111'`,
// `clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0% 0)']`); `draw` draws an SVG
// line (0 to 1); a plain object's numbers move too (`animate(counter, { value:
// 1200 })`, painted by onUpdate).

import { easeOf, type EaseInput } from './easing.js';
import { player, type Controls } from './player.js';
import { prefersReduced } from './ticker.js';
import { apply, giveTarget, holdTarget, kOf, lanesFor, resolveAny, valueOf, type Held, type Keyframes, type Targets } from './tween.js';
import { hold, letGo } from './style.js';

export { along, frames, resolveTargets, type CssValue, type Keyframes, type Targets, type Value } from './tween.js';
export type { Controls } from './player.js';

export interface AnimateOptions {
  /** seconds, 0.6 */
  duration?: number;
  /** seconds before it starts, 0 */
  delay?: number;
  /** a named curve, [x1, y1, x2, y2], or a function; `out` */
  ease?: EaseInput;
  /** times it plays again after the first; Infinity for ever */
  repeat?: number;
  /** every other repeat plays backwards */
  yoyo?: boolean;
  /** seconds between one target and the next */
  stagger?: number;
  /** start playing now (true), or wait for play() or a scroll() driving it */
  autoplay?: boolean;
  /**
   * 'user' follows prefers-reduced-motion: the end state at once, delays kept,
   * no repeats. 'always' does that for everyone; 'never' ignores the setting
   * (for motion that is the content, such as a progress bar).
   */
  reducedMotion?: 'user' | 'always' | 'never';
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}

/** Whether these options ask for reduced motion now. */
export const reducing = (o: { reducedMotion?: 'user' | 'always' | 'never' }) => o.reducedMotion === 'always' || (o.reducedMotion !== 'never' && prefersReduced());

export function animate(targets: Targets, keyframes: Keyframes, options: AnimateOptions = {}): Controls {
  const ts = resolveAny(targets);
  const lanes = ts.map((t) => lanesFor(t, keyframes));
  const reduce = reducing(options);
  const repeat = reduce ? 0 : Math.max(0, options.repeat ?? 0);
  const m = {
    delay: Math.max(0, (options.delay ?? 0) * 1000),
    stagger: Math.max(0, (options.stagger ?? 0) * 1000),
    duration: reduce ? 0 : Math.max(0, (options.duration ?? 0.6) * 1000),
    // a loop for ever is played, and seeks, one pass at a time
    passes: Number.isFinite(repeat) ? repeat + 1 : Infinity,
    yoyo: !!options.yoyo,
    ease: easeOf(options.ease),
  };
  const lead = m.delay + m.stagger * Math.max(0, ts.length - 1);
  const total = Number.isFinite(m.passes) ? lead + m.duration * m.passes : Infinity;
  const held: Held[] = ts.map((t, i) => holdTarget(t, lanes[i]));
  const looks = held.filter((h) => h.base).map((h) => h.t as HTMLElement);

  const { controls, start } = player({
    total: () => total,
    one: () => lead + m.duration,
    rest: () => m.delay,
    render: (t) => held.forEach((h, i) => {
      const e = kOf(m, i, t);
      apply(h, lanes[i].map((l) => [l, valueOf(l, e)]));
    }),
    hold: () => looks.forEach(hold),
    letGo: () => looks.forEach(letGo),
    release: (holding) => held.forEach((h) => giveTarget(h, holding)),
    reduce,
    onUpdate: options.onUpdate,
    onComplete: options.onComplete,
  });
  start(options.autoplay !== false);
  return controls;
}
