// Playing something in time, for animate() and timeline(): play, pause,
// reverse, seek, finish and cancel on one shared frame loop (ticker.ts), a
// promise for each play's end, and reduced motion.

import { clamp01 } from './easing.js';
import { every } from './ticker.js';

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
  /** seconds, start to end, every repeat included; Infinity for ever */
  readonly duration: number;
}

export interface Playable {
  /** ms, start to end; Infinity for ever */
  total(): number;
  /** ms of one pass with its lead-in, for the progress of a loop for ever */
  one(): number;
  /** ms where playing backwards ends: the lead-in is waiting, not motion */
  rest(): number;
  /** paint the time `t` (ms) */
  render(t: number): void;
  /** take hold of the targets again (a new play after an ending) */
  hold(): void;
  /** an end: leave the last frame, stop holding */
  letGo(): void;
  /** cancel: give the targets back; `holding` whether they were still held */
  release(holding: boolean): void;
  reduce: boolean;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}

export function player(s: Playable): { controls: Controls; start(autoplay: boolean): void } {
  /** whether this holds its targets now (from creation, or a new play, until it ends) */
  let holding = true;
  /** the page did something with it right after creating it (see start) */
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

  // a loop for ever reports its progress through the pass it is in, ending at 1
  const progress = () => {
    const total = s.total();
    if (Number.isFinite(total)) return total ? clamp01(t / total) : 1;
    if (t <= 0) return 0;
    const span = Math.max(1, s.one());
    return clamp01((t % span || span) / span);
  };
  const render = () => {
    s.render(t);
    if (s.onUpdate) s.onUpdate(progress());
  };

  const complete = () => {
    if (done) return;
    playing = false;
    done = true;
    stopTick?.();
    stopTick = null;
    if (holding) {
      holding = false;
      s.letGo();
    }
    resolve();
    // last: it may play again (a ping-pong), which is a new play
    if (s.onComplete) s.onComplete();
  };
  const tick = (now: number) => {
    if (!playing) return false;
    const dt = last ? now - last : 0;
    last = now;
    t += dt * dir;
    const total = s.total();
    if (dir > 0 && t >= total) {
      t = total;
      render();
      complete();
      // an onComplete that played it again keeps it running
      return playing;
    }
    // Backwards, it has ended once every target is back at its start, at the
    // lead-in: waiting is not played backwards.
    if (dir < 0 && t <= s.rest()) {
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
        s.hold();
      }
      if (done) {
        // played to an end: go again from the start of its direction
        const total = s.total();
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
      const total = s.total();
      t = Number.isFinite(total) ? clamp01(p) * total : clamp01(p) * s.one();
      render();
    },
    finish() {
      if (cancelled || done) return;
      const total = s.total();
      t = dir > 0 ? (Number.isFinite(total) ? total : s.one()) : 0;
      render();
      complete();
    },
    cancel() {
      touched = true;
      if (cancelled) return;
      cancelled = true;
      playing = false;
      stopTick?.();
      s.release(holding);
      holding = false;
      resolve();
    },
    get finished() {
      return finished;
    },
    get reduced() {
      return s.reduce;
    },
    get progress() {
      return progress();
    },
    get playing() {
      return playing;
    },
    get duration() {
      return s.total() / 1000;
    },
  };
  /** paint the start, then play unless told not to (or end at once when there is nothing to wait for) */
  const start = (autoplay: boolean) => {
      render();
      // a timeline starts after it is built: the page may have paused or sought it meanwhile
      if (!autoplay || touched) return;
      // Nothing to wait for (reduced motion, no duration): it ends at once, but
      // after it has been returned, so an onComplete that refers to it finds
      // it there; unless the page paused, sought or cancelled it first.
      if (s.total() === 0) {
        queueMicrotask(() => {
          if (!touched) controls.finish();
        });
      } else {
        controls.play();
        touched = false;
      }
  };
  return { controls, start };
}
