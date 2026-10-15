// drag(): an element the pointer (or the arrow keys) moves, held inside
// bounds, thrown on release and gliding to rest, landing on snap points.
//
//   const card = drag('.card', { axis: 'x', bounds: '.rail', snap: 320, inertia: true });
//   card.to(640);
//
// Touch scrolls the page along the axis the element does not move on. A drag
// does not click what it was dropped on. Under reduced motion nothing is
// thrown: it stops where it is let go, on its nearest snap point.

import { animate, type Controls } from '../index.js';
import { one, ownOf, offset, reduced, type Own, type Targets } from './util.js';

export type Snap = number | number[] | ((value: number) => number);
export interface Bounds {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}
export interface DragOptions {
  /** 'x', 'y' or 'both' (the default) */
  axis?: 'x' | 'y' | 'both';
  /** keep the element inside another (a selector or an element), or offsets in px from where it starts */
  bounds?: string | Element | Bounds;
  /** thrown on release, gliding to rest (true) */
  inertia?: boolean;
  /** 0 to 1: how far past its bounds it follows the pointer before springing back (0.35) */
  overshoot?: number;
  /** where it may rest: every N px, a list of offsets, or a function; one for both axes or one each */
  snap?: Snap | { x?: Snap; y?: Snap };
  /** px an arrow key moves it when it has keyboard focus (to the next snap point when it snaps); 0 for none */
  step?: number;
  onStart?: (x: number, y: number) => void;
  onDrag?: (x: number, y: number) => void;
  onRelease?: (x: number, y: number) => void;
  /** at rest, after a throw or a glide */
  onRest?: (x: number, y: number) => void;
}
export interface Draggable {
  readonly x: number;
  readonly y: number;
  readonly dragging: boolean;
  /** move to an offset, gliding unless `glide` is false */
  to(x: number, y?: number, glide?: boolean): void;
  enable(): void;
  disable(): void;
  /** stop listening and put the element back as it was */
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** the nearest allowed resting place */
export function snapValue(v: number, snap: Snap | undefined): number {
  if (snap === undefined) return v;
  if (typeof snap === 'function') return snap(v);
  if (Array.isArray(snap)) return snap.length ? snap.reduce((b, s) => (Math.abs(s - v) < Math.abs(b - v) ? s : b), snap[0]) : v;
  return snap > 0 ? Math.round(v / snap) * snap : v;
}
/** the next allowed place from `v` in direction `dir` */
export function nextSnap(v: number, dir: number, snap: Snap | undefined, step: number): number {
  if (Array.isArray(snap) && snap.length) {
    const sorted = snap.slice().sort((a, b) => a - b);
    const found = dir > 0 ? sorted.find((s) => s > v + 0.5) : sorted.reverse().find((s) => s < v - 0.5);
    return found ?? v;
  }
  if (typeof snap === 'number' && snap > 0) return snapValue(v, snap) + dir * snap;
  return v + dir * step;
}
/** where a throw at `v` px/ms from `x` comes to rest, with no bounds: the glide's time constant is 325 ms */
export const restOf = (x: number, v: number) => x + v * 325;

export function drag(target: Targets, options: DragOptions = {}): Draggable {
  const el = one(target);
  const axis = options.axis ?? 'both';
  const mx = axis !== 'y';
  const my = axis !== 'x';
  const over = clamp(options.overshoot ?? 0.35, 0, 1);
  const snapX = options.snap !== undefined && typeof options.snap === 'object' && !Array.isArray(options.snap) ? options.snap.x : (options.snap as Snap | undefined);
  const snapY = options.snap !== undefined && typeof options.snap === 'object' && !Array.isArray(options.snap) ? options.snap.y : (options.snap as Snap | undefined);
  let x = 0;
  let y = 0;
  let on = true;
  let dragging = false;
  let glide: Controls | null = null;
  let own: Own | null = null;
  const before = el ? { touchAction: el.style.touchAction, userSelect: el.style.userSelect, cursor: el.style.cursor } : null;

  const paint = () => {
    if (!el) return;
    if (!own) own = ownOf(el);
    offset(el, own, x, y);
  };
  /** the offsets allowed now */
  const limits = () => {
    const b = options.bounds;
    if (!b || !el) return { l: -Infinity, r: Infinity, t: -Infinity, d: Infinity };
    if (typeof b === 'object' && !(b instanceof Element)) return { l: b.left ?? -Infinity, r: b.right ?? Infinity, t: b.top ?? -Infinity, d: b.bottom ?? Infinity };
    const box = typeof b === 'string' ? document.querySelector(b) : b;
    if (!box) return { l: -Infinity, r: Infinity, t: -Infinity, d: Infinity };
    const o = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // where the element is with no offset
    const left = r.left - x;
    const top = r.top - y;
    const l = o.left - left;
    const rr = o.right - (left + r.width);
    const t = o.top - top;
    const d = o.bottom - (top + r.height);
    // a box smaller than the element: it may slide across it, edges outside
    return { l: Math.min(l, rr), r: Math.max(l, rr), t: Math.min(t, d), d: Math.max(t, d) };
  };
  /** past a bound, the element follows only part of the way */
  const resist = (v: number, lo: number, hi: number) => (v < lo ? lo - (lo - v) * over : v > hi ? hi + (v - hi) * over : v);

  const settle = (tx: number, ty: number, duration: number) => {
    glide?.cancel();
    glide = null;
    if (Math.abs(tx - x) < 0.5 && Math.abs(ty - y) < 0.5) {
      x = tx;
      y = ty;
      paint();
      options.onRest?.(x, y);
      return;
    }
    const s = { x, y };
    glide = animate(s, { x: tx, y: ty }, {
      duration,
      ease: 'out',
      onUpdate: () => {
        x = s.x;
        y = s.y;
        paint();
        options.onDrag?.(x, y);
      },
      onComplete: () => {
        glide = null;
        options.onRest?.(x, y);
      },
    });
  };
  const restAt = (wantX: number, wantY: number) => {
    const L = limits();
    return [mx ? clamp(snapValue(clamp(wantX, L.l, L.r), snapX), L.l, L.r) : x, my ? clamp(snapValue(clamp(wantY, L.t, L.d), snapY), L.t, L.d) : y];
  };

  // ── the pointer ──
  let sx = 0;
  let sy = 0;
  let px = 0;
  let py = 0;
  let moved = false;
  let id = -1;
  let L = limits();
  const trail: Array<[number, number, number]> = [];
  const down = (e: PointerEvent) => {
    if (!on || !el || e.button !== 0 || id !== -1) return;
    const t = e.target as HTMLElement;
    if (t !== el && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    glide?.cancel();
    glide = null;
    id = e.pointerId;
    el.setPointerCapture?.(e.pointerId);
    sx = x;
    sy = y;
    px = e.clientX;
    py = e.clientY;
    moved = false;
    L = limits();
    trail.length = 0;
    trail.push([e.timeStamp, x, y]);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id || !el) return;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (!moved) {
      if (Math.hypot(dx, dy) < 3) return;
      moved = true;
      dragging = true;
      el.style.userSelect = 'none';
      options.onStart?.(x, y);
    }
    if (mx) x = resist(sx + dx, L.l, L.r);
    if (my) y = resist(sy + dy, L.t, L.d);
    paint();
    trail.push([e.timeStamp, x, y]);
    while (trail.length > 2 && e.timeStamp - trail[0][0] > 100) trail.shift();
    options.onDrag?.(x, y);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id || !el) return;
    id = -1;
    if (!moved) return;
    dragging = false;
    el.style.userSelect = before!.userSelect;
    // the speed over the last tenth of a second, px per ms
    const first = trail[0];
    const dt = Math.max(1, e.timeStamp - first[0]);
    const still = e.timeStamp - trail[trail.length - 1][0] > 80;
    const vx = still ? 0 : (x - first[1]) / dt;
    const vy = still ? 0 : (y - first[2]) / dt;
    options.onRelease?.(x, y);
    const throwing = options.inertia !== false && !reduced();
    const [tx, ty] = restAt(throwing ? restOf(x, vx) : x, throwing ? restOf(y, vy) : y);
    settle(tx, ty, reduced() ? 0 : throwing ? clamp(Math.hypot(tx - x, ty - y) / 900, 0.25, 1.2) : 0.3);
    // a drag is not a click on what it was let go over
    el.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', swallow, true), 0);
  };
  const swallow = (c: Event) => {
    c.stopPropagation();
    c.preventDefault();
  };
  // ── the keys, when it has focus ──
  const key = (e: KeyboardEvent) => {
    if (!on || !el || e.target !== el) return;
    const step = options.step ?? 10;
    if (!step) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (!dir || (horizontal && !mx) || (!horizontal && !my)) return;
    e.preventDefault();
    const Lk = limits();
    const tx = horizontal ? clamp(nextSnap(x, dir, snapX, step), Lk.l, Lk.r) : x;
    const ty = horizontal ? y : clamp(nextSnap(y, dir, snapY, step), Lk.t, Lk.d);
    settle(tx, ty, reduced() ? 0 : 0.25);
  };

  const listen = () => {
    if (!el) return;
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', key);
    // touch scrolls the page along the other axis only
    el.style.touchAction = axis === 'x' ? 'pan-y' : axis === 'y' ? 'pan-x' : 'none';
    el.style.cursor = 'grab';
  };
  const quiet = () => {
    if (!el || !before) return;
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('keydown', key);
    el.style.touchAction = before.touchAction;
    el.style.cursor = before.cursor;
    el.style.userSelect = before.userSelect;
  };
  listen();

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get dragging() {
      return dragging;
    },
    to(tx: number, ty = y, smooth = true) {
      const [rx, ry] = restAt(tx, ty);
      settle(rx, ry, smooth && !reduced() ? 0.4 : 0);
    },
    enable() {
      if (on) return;
      on = true;
      listen();
    },
    disable() {
      if (!on) return;
      on = false;
      quiet();
    },
    destroy() {
      on = false;
      glide?.cancel();
      quiet();
      x = 0;
      y = 0;
      paint();
    },
  };
}
