// What animate() and timeline() share: the targets, what moves on each (its
// lanes), where each target is in time, and painting the values found.
//
// A lane is one key of the keyframes on one target:
// - a motion value (x, y, scale, scaleX, scaleY, rotate, rotateX, rotateY,
//   opacity, blur), added to the element's own look by style.ts;
// - `draw`, how much of an SVG line is drawn, 0 to 1 (1 at rest);
// - any other key: a CSS property or variable on an element, or a property of
//   a plain object, from its value now to the one given.

import { clamp01, type EaseFn } from './easing.js';
import { cssName, giveBack, keepOwn, lineLength, mixAlong, paintDraw, type Mixer } from './props.js';
import { identity, paint, parseColour, readBase, release, remember, type Base, type State } from './style.js';

export type Value = number | number[];
/** a CSS value, or keyframes of them */
export type CssValue = number | string | Array<number | string>;
export interface Keyframes {
  /** px */
  x?: Value;
  y?: Value;
  scale?: Value;
  scaleX?: Value;
  scaleY?: Value;
  /** degrees */
  rotate?: Value;
  rotateX?: Value;
  rotateY?: Value;
  /** multiplies the element's own */
  opacity?: Value;
  /** px */
  blur?: Value;
  /** an SVG line (path, line, circle...) drawn from its start: 0 none of it, 1 all of it */
  draw?: Value;
  /** any other CSS property (camelCase or kebab-case), a CSS variable (`--size`), or a plain object's property */
  [property: string]: CssValue | undefined;
}
/** a selector, an element, a list of them, or a plain object (or a list of objects) whose numbers move */
export type Targets = string | Element | Iterable<Element> | ArrayLike<Element> | object;
export type Target = HTMLElement | Record<string, unknown>;

/** the motion values: their key in style.ts's State */
const MOTION: Record<string, keyof State> = { x: 'x', y: 'y', scale: 'scale', scaleX: 'sx', scaleY: 'sy', rotate: 'rotate', rotateX: 'rx', rotateY: 'ry', opacity: 'opacity', blur: 'blur' };
const isMotion = (k: string) => Object.prototype.hasOwnProperty.call(MOTION, k);

export const isElement = (t: unknown): t is HTMLElement => typeof Element !== 'undefined' && t instanceof Element;

export function resolveTargets(t: Targets): HTMLElement[] {
  return resolveAny(t).filter(isElement);
}
/** elements and plain objects alike */
export function resolveAny(t: Targets): Target[] {
  if (typeof t === 'string') return typeof document === 'undefined' ? [] : Array.from(document.querySelectorAll<HTMLElement>(t));
  if (isElement(t)) return [t];
  if (t && (typeof (t as ArrayLike<unknown>).length === 'number' || typeof (t as Iterable<unknown>)[Symbol.iterator] === 'function')) return Array.from(t as ArrayLike<Target>).filter((x) => x && typeof x === 'object');
  return t && typeof t === 'object' ? [t as Target] : [];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** the values written for a key, as a list; empty when none can be used */
const listOf = (v: CssValue | undefined): Array<number | string> => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter((x) => num(x) || (typeof x === 'string' && x !== ''));

/** The frames of each motion value, from rest where only an end was given. */
export function frames(kf: Keyframes): Array<[string, number[]]> {
  const rest = identity();
  const out: Array<[string, number[]]> = [];
  for (const p of Object.keys(MOTION)) {
    const list = listOf(kf[p]).filter(num);
    if (!list.length) continue;
    out.push([p, list.length === 1 ? [rest[MOTION[p]] as number, list[0]] : list]);
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

/** m a motion value, c a CSS property or variable, d draw, p a plain object's property */
export type Kind = 'm' | 'c' | 'd' | 'p';
export interface Lane {
  key: string;
  kind: Kind;
  /** only an end was given: the start is the value now (a timeline starts it where the motion before it left off) */
  single: boolean;
  /** numbers (motion, draw, a number on an object) */
  f?: number[];
  /** strings (a CSS value, or an object's string) */
  mix?: Mixer;
  /** the values as given, the start included, for a timeline to start it elsewhere */
  vals: Array<number | string>;
  /** the CSS name, for a CSS lane */
  name?: string;
  /** an SVG line's length, for draw */
  len?: number;
}

const colourOf = (doc: Document) => (v: string) => (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', v) ? parseColour(doc, v) : null);

/** Build a lane's interpolation from its values. */
export function setVals(lane: Lane, vals: Array<number | string>, el?: HTMLElement) {
  lane.vals = vals;
  if (vals.every(num)) {
    lane.f = vals as number[];
    lane.mix = undefined;
  } else {
    lane.f = undefined;
    lane.mix = mixAlong(vals.map(String), el ? colourOf(el.ownerDocument) : undefined);
  }
}

/** The lanes of one target: what each key of the keyframes moves on it. */
export function lanesFor(t: Target, kf: Keyframes): Lane[] {
  const lanes: Lane[] = [];
  const el = isElement(t) ? t : null;
  // on a plain object every key is its own property
  if (el) for (const [key, f] of frames(kf)) lanes.push({ key, kind: 'm', single: listOf(kf[key]).length === 1, f, vals: f });
  for (const key of Object.keys(kf)) {
    if (el && isMotion(key)) continue;
    // never an object's prototype
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const given = listOf(kf[key]);
    if (!given.length) continue;
    const single = given.length === 1;
    let lane: Lane;
    if (el && key === 'draw') {
      const len = lineLength(el);
      if (!len) continue;
      const f = given.filter(num);
      if (!f.length) continue;
      lane = { key, kind: 'd', single, len, vals: [] };
      setVals(lane, single ? [1, f[0]] : f);
      keepOwn(el, 'stroke-dasharray');
      keepOwn(el, 'stroke-dashoffset');
    } else if (el) {
      const name = cssName(key);
      lane = { key, kind: 'c', single, name, vals: [] };
      const now = (el.ownerDocument.defaultView || window).getComputedStyle(el).getPropertyValue(name).trim();
      setVals(lane, (single ? [now, given[0]] : given).map(String), el);
      keepOwn(el, name);
    } else {
      const own = (t as Record<string, unknown>)[key];
      const start = num(own) ? own : typeof own === 'string' ? own : 0;
      lane = { key, kind: 'p', single, vals: [] };
      setVals(lane, single ? [start, given[0]] : given);
    }
    lanes.push(lane);
  }
  return lanes;
}

/** A lane's value `e` (eased, 0 to 1) of the way along. */
export const valueOf = (lane: Lane, e: number): number | string => (lane.f ? along(lane.f, e) : lane.mix!(e));

export interface Timing {
  /** ms */
  delay: number;
  stagger: number;
  duration: number;
  passes: number;
  yoyo: boolean;
  ease: EaseFn;
}
/** One target's eased progress at `time` (ms) of its motion: the delay and its stagger first, then each pass. */
export function kOf(m: Timing, i: number, time: number): number {
  const local = time - m.delay - m.stagger * i;
  let k: number;
  if (m.duration === 0) k = local >= 0 ? 1 : 0;
  else if (local <= 0) k = 0;
  else {
    // the end of a pass belongs to that pass (a pass ends at 1, not at the next one's 0)
    const pass = Math.min(m.passes - 1, Math.ceil(local / m.duration) - 1);
    const within = clamp01((local - pass * m.duration) / m.duration);
    k = m.yoyo && pass % 2 === 1 ? 1 - within : within;
  }
  return m.ease(k);
}

/** One target as a motion found it: the element's own look (when a motion value moves), what to give back. */
export interface Held {
  t: Target;
  base: Base | null;
  /** CSS names written */
  css: Set<string>;
  /** an object's values before */
  own: Record<string, unknown>;
}
/** Hold a target for these lanes (adding to `h`, for a timeline's later motion on it). */
export function holdTarget(t: Target, lanes: Lane[], h: Held = { t, base: null, css: new Set(), own: {} }): Held {
  for (const l of lanes) {
    if (l.kind === 'm' && isElement(t) && !h.base) h.base = readBase(t);
    if (l.kind === 'c') h.css.add(l.name!);
    if (l.kind === 'd') h.css.add('stroke-dasharray').add('stroke-dashoffset');
    if (l.kind === 'p' && !(l.key in h.own)) h.own[l.key] = (t as Record<string, unknown>)[l.key];
  }
  return h;
}

/** Paint the values found for one target. */
export function apply(h: Held, values: Array<[Lane, number | string]>) {
  const t = h.t;
  if (!isElement(t)) {
    for (const [l, v] of values) (t as Record<string, unknown>)[l.key] = v;
    return;
  }
  if (h.base) {
    const s = identity();
    for (const [l, v] of values) if (l.kind === 'm') (s as unknown as Record<string, number>)[MOTION[l.key]] = v as number;
    paint(t, s, h.base);
  }
  for (const [l, v] of values) {
    if (l.kind === 'c') t.style.setProperty(l.name!, String(v));
    else if (l.kind === 'd') paintDraw(t, l.len!, v as number);
  }
  if (h.css.size) remember(t);
}

/** Give a target back as it was before the motion. `holding`: whether the motion still held the element's look. */
export function giveTarget(h: Held, holding: boolean) {
  const t = h.t;
  if (!isElement(t)) {
    Object.assign(t, h.own);
    return;
  }
  if (h.base) release(t, h.base.inline, holding);
  giveBack(t, h.css);
}
