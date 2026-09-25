// animate(): move elements from code.
//
//   const a = animate('.card', { y: [40, 0], opacity: [0, 1] }, { duration: 0.6, stagger: 0.08 });
//   await a.finished;
//
// Values are relative to the element's own look: `y: 40` is 40px below where
// its CSS puts it, `scale: 1.1` is 10% larger than its own scale, `opacity:
// 0.5` is half its own opacity. A single number animates from rest to it; a
// list is keyframes, evenly spaced, the first being the start.

import { clamp01, easeOf, type EaseInput } from './easing.js';
import { hold, identity, letGo, paint, readBase, release, type Base, type State } from './style.js';
import { every, prefersReduced } from './ticker.js';

export type Value = number | number[];
export interface Keyframes {
  x?: Value;
  y?: Value;
  scale?: Value;
  rotate?: Value;
  opacity?: Value;
  blur?: Value;
}
export type Targets = string | Element | Iterable<Element> | ArrayLike<Element>;

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

export interface Controls {
  play(): void;
  pause(): void;
  /** play backwards from where it is (or forwards again) */
  reverse(): void;
  /** jump to a point, 0 to 1 of the whole animation */
  seek(progress: number): void;
  /** jump to the end */
  finish(): void;
  /** stop, and give the elements back as they were */
  cancel(): void;
  /** resolves when this play ends (finishes, or is cancelled); a new play gives a new promise */
  readonly finished: Promise<void>;
  /** it follows reduced motion: the end state at once, no repeats */
  readonly reduced: boolean;
  /** 0 to 1 */
  readonly progress: number;
  readonly playing: boolean;
}

const PROPS = ['x', 'y', 'scale', 'rotate', 'opacity', 'blur'] as const;
type Prop = (typeof PROPS)[number];

export function resolveTargets(t: Targets): HTMLElement[] {
  if (typeof t === 'string') return typeof document === 'undefined' ? [] : Array.from(document.querySelectorAll<HTMLElement>(t));
  if (typeof Element !== 'undefined' && t instanceof Element) return [t as HTMLElement];
  return Array.from(t as ArrayLike<Element>) as HTMLElement[];
}

/** The frames of each property, from rest where only an end was given. */
export function frames(kf: Keyframes): Array<[Prop, number[]]> {
  const rest = identity();
  const out: Array<[Prop, number[]]> = [];
  for (const p of PROPS) {
    const v = kf[p];
    if (v === undefined) continue;
    const list = (Array.isArray(v) ? v : [v]).filter((n) => typeof n === 'number' && Number.isFinite(n));
    if (!list.length) continue;
    out.push([p, list.length === 1 ? [rest[p], list[0]] : list]);
  }
  return out;
}

/** The value `k` (0 to 1) of the way along evenly spaced frames. */
export const along = (f: number[], k: number) => {
  if (f.length === 1) return f[0];
  const at = clamp01(k) * (f.length - 1);
  const i = Math.min(f.length - 2, Math.floor(at));
  return f[i] + (f[i + 1] - f[i]) * (at - i);
};

export function animate(targets: Targets, keyframes: Keyframes, options: AnimateOptions = {}): Controls {
  const els = resolveTargets(targets);
  const props = frames(keyframes);
  const reduce = options.reducedMotion === 'always' || (options.reducedMotion !== 'never' && prefersReduced());
  const ease = easeOf(options.ease);
  const duration = reduce ? 0 : Math.max(0, (options.duration ?? 0.6) * 1000);
  const delay = Math.max(0, (options.delay ?? 0) * 1000);
  const stagger = Math.max(0, (options.stagger ?? 0) * 1000);
  const repeat = reduce ? 0 : Math.max(0, options.repeat ?? 0);
  const yoyo = !!options.yoyo;
  // a loop for ever is played, and seeks, one pass at a time
  const passes = Number.isFinite(repeat) ? repeat + 1 : Infinity;
  const one = delay + stagger * Math.max(0, els.length - 1) + duration;
  const total = Number.isFinite(passes) ? delay + stagger * Math.max(0, els.length - 1) + duration * passes : Infinity;

  const bases: Base[] = els.map((el) => readBase(el));
  /** whether this animation holds its elements now (from creation, or a new play, until it ends) */
  let holding = true;
  /** the page did something with it right after creating it (see the end) */
  let touched = false;
  let t = 0;
  let dir = 1;
  let playing = false;
  let done = false;
  let cancelled = false;
  let last = 0;
  let stopTick: (() => void) | null = null;
  let resolve!: () => void;
  let finished = new Promise<void>((r) => (resolve = r));
  /** a new play, after an ending: a new promise to wait on */
  const renew = () => {
    finished = new Promise<void>((r) => (resolve = r));
  };

  /** the state of one target at time `time` */
  const stateAt = (i: number, time: number): State => {
    const local = time - delay - stagger * i;
    let k: number;
    if (duration === 0) k = local >= 0 ? 1 : 0;
    else if (local <= 0) k = 0;
    else {
      // the end of a pass belongs to that pass (a pass ends at 1, not at the next one's 0)
      const pass = Math.min(passes - 1, Math.ceil(local / duration) - 1);
      const within = clamp01((local - pass * duration) / duration);
      k = yoyo && pass % 2 === 1 ? 1 - within : within;
    }
    const e = ease(k);
    const s = identity();
    for (const [p, f] of props) s[p] = along(f, e);
    return s;
  };
  const render = () => {
    els.forEach((el, i) => paint(el, stateAt(i, t), bases[i]));
    if (options.onUpdate) options.onUpdate(progress());
  };
  // a loop for ever reports its progress through the pass it is in, ending at 1
  const progress = () => {
    if (Number.isFinite(total)) return total ? clamp01(t / total) : 1;
    if (t <= 0) return 0;
    const span = Math.max(1, one);
    return clamp01((t % span || span) / span);
  };

  const complete = () => {
    if (done) return;
    playing = false;
    done = true;
    stopTick?.();
    stopTick = null;
    if (holding) {
      holding = false;
      els.forEach((el) => letGo(el));
    }
    resolve();
    // last: it may play the animation again (a ping-pong), which is a new play
    if (options.onComplete) options.onComplete();
  };
  const tick = (now: number) => {
    if (!playing) return false;
    const dt = last ? now - last : 0;
    last = now;
    t += dt * dir;
    if (dir > 0 && t >= total) {
      t = total;
      render();
      complete();
      // an onComplete that played it again keeps it running
      return playing;
    }
    if (dir < 0 && t <= 0) {
      t = 0;
      render();
      complete();
      return playing;
    }
    render();
    return true;
  };

  const controls: Controls = {
    play() {
      touched = true;
      if (cancelled || playing) return;
      if (!holding) {
        holding = true;
        els.forEach((el) => hold(el));
      }
      if (done) {
        // played to an end: go again from the start of its direction
        if (dir > 0 ? t >= total : t <= 0) t = dir > 0 ? 0 : total;
        done = false;
        renew();
      }
      playing = true;
      last = 0;
      stopTick = every(tick);
    },
    pause() {
      touched = true;
      playing = false;
      stopTick?.();
      stopTick = null;
    },
    reverse() {
      dir = -dir;
      if (done) {
        done = false;
        renew();
      }
      if (!playing) controls.play();
    },
    seek(p: number) {
      touched = true;
      if (cancelled) return;
      t = Number.isFinite(total) ? clamp01(p) * total : clamp01(p) * one;
      render();
    },
    finish() {
      if (cancelled || done) return;
      t = dir > 0 ? (Number.isFinite(total) ? total : one) : 0;
      render();
      complete();
    },
    cancel() {
      touched = true;
      if (cancelled) return;
      cancelled = true;
      playing = false;
      stopTick?.();
      els.forEach((el, i) => release(el, bases[i].inline, holding));
      holding = false;
      resolve();
    },
    get finished() {
      return finished;
    },
    get reduced() {
      return reduce;
    },
    get progress() {
      return progress();
    },
    get playing() {
      return playing;
    },
  };

  render();
  if (options.autoplay !== false) {
    // Nothing to wait for (reduced motion, no duration): it ends at once, but
    // after animate() has returned, so an onComplete that refers to the
    // animation finds it there.
    // unless the page paused, sought or cancelled it first
    if (total === 0) {
      render();
      queueMicrotask(() => {
        if (!touched) controls.finish();
      });
    } else {
      controls.play();
      touched = false;
    }
  }
  return controls;
}
