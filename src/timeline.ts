// timeline(): several motions in sequence, overlapping where asked, played,
// reversed, sought and scrubbed as one.
//
//   const tl = timeline({ defaults: { duration: 0.6, ease: 'out' } })
//     .add('.hero h1', { y: [40, 0], opacity: [0, 1] })
//     .add('.hero p', { opacity: [0, 1] }, {}, '-=0.3')
//     .label('cards')
//     .add('.card', { y: [24, 0], opacity: [0, 1] }, { stagger: 0.08 }, 'cards')
//     .call(() => console.log('done'));
//   scroll(timeline({ autoplay: false }).add(...), { target: '.story', start: 'top top', end: '+=2000' });
//
// Where a motion goes (`at`): seconds from the start; '+=0.2' or '-=0.2'
// after or before the end so far; '<' the start of the motion added before it,
// '>' its end, '<0.2' and '>-0.1' from those; a label, 'label+=0.3'. Unset is
// the end so far.
//
// Two motions moving the same thing on the same element hand over: the one
// that started last shows; before either has started, the first one's start
// shows (so a fade in later in the timeline is hidden from the beginning). A
// motion given only an end starts where the one before it on that element
// left off.

import { easeOf, type EaseInput } from './easing.js';
import { reducing } from './animate.js';
import { player, type Controls } from './player.js';
import { hold, letGo } from './style.js';
import { apply, giveTarget, holdTarget, isElement, kOf, lanesFor, resolveAny, setVals, valueOf, type Held, type Keyframes, type Lane, type Target, type Targets, type Timing } from './tween.js';

export type Position = number | string;

export interface TweenOptions {
  /** seconds; the timeline's default, or 0.6 */
  duration?: number;
  /** seconds, after its place */
  delay?: number;
  ease?: EaseInput;
  /** seconds between one target and the next */
  stagger?: number;
  /** times it plays again after the first (not for ever inside a timeline) */
  repeat?: number;
  yoyo?: boolean;
}

export interface TimelineOptions {
  /** what each motion takes unless it says otherwise */
  defaults?: Pick<TweenOptions, 'duration' | 'ease' | 'stagger'>;
  /** times the whole timeline plays again after the first; Infinity for ever */
  repeat?: number;
  yoyo?: boolean;
  /** start playing once built (true), or wait for play() or a scroll() driving it */
  autoplay?: boolean;
  /** as animate(): 'user' shows the end at once under prefers-reduced-motion */
  reducedMotion?: 'user' | 'always' | 'never';
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}

export interface Timeline extends Controls {
  /** a motion, at `at` (the end so far when unset) */
  add(targets: Targets, keyframes: Keyframes, options?: TweenOptions, at?: Position): Timeline;
  /** a function, called each time the playhead passes `at`, either way */
  call(fn: () => void, at?: Position): Timeline;
  /** a name for a moment, to place motions at */
  label(name: string, at?: Position): Timeline;
  /** seconds where a label is; undefined when there is none */
  labelAt(name: string): number | undefined;
}

interface Child {
  targets: Target[];
  lanes: Lane[][];
  m: Timing;
  /** ms */
  at: number;
  span: number;
  /** the order it was added in, which settles a tie */
  n: number;
}

/**
 * Where `at` places a motion, in seconds. `end` is the timeline's end so far;
 * `prev` the motion added before it, [start, end].
 */
export function place(at: Position | undefined, end: number, prev: [number, number], labels: ReadonlyMap<string, number>): number {
  if (typeof at === 'number') return Math.max(0, Number.isFinite(at) ? at : end);
  if (at === undefined || at === '') return end;
  const s = String(at).trim();
  const rel = /^([+-])=(-?[\d.]+)$/.exec(s);
  if (rel) return Math.max(0, end + (rel[1] === '-' ? -1 : 1) * parseFloat(rel[2]));
  const near = /^([<>])\s*([+-]?[\d.]+)?$/.exec(s);
  if (near) return Math.max(0, (near[1] === '<' ? prev[0] : prev[1]) + (near[2] ? parseFloat(near[2]) : 0));
  const lab = /^(.+?)(?:([+-])=(-?[\d.]+))?$/.exec(s);
  if (lab && labels.has(lab[1])) return Math.max(0, labels.get(lab[1])! + (lab[2] ? (lab[2] === '-' ? -1 : 1) * parseFloat(lab[3]) : 0));
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : end;
}

export function timeline(options: TimelineOptions = {}): Timeline {
  const d = options.defaults || {};
  const children: Child[] = [];
  const calls: Array<{ fn: () => void; at: number }> = [];
  const labels = new Map<string, number>();
  const held = new Map<Target, Held>();
  const reduce = reducing(options);
  const repeat = reduce ? 0 : Math.max(0, options.repeat ?? 0);
  const passes = Number.isFinite(repeat) ? repeat + 1 : Infinity;
  /** ms: one pass */
  let inner = 0;
  let prev: [number, number] = [0, 0];
  /** for each target, each key: the motions that move it, in order of their start on it */
  let plan: Array<{ h: Held; keys: Array<Array<{ c: Child; i: number; l: Lane; from: number }>> }> = [];
  let dirty = true;
  /** the inner time last painted, for calls */
  let was = 0;

  const rebuild = () => {
    dirty = false;
    const by = new Map<Target, Map<string, Array<{ c: Child; i: number; l: Lane; from: number }>>>();
    for (const c of children)
      c.targets.forEach((t, i) => {
        let keys = by.get(t);
        if (!keys) by.set(t, (keys = new Map()));
        const from = c.at + c.m.delay + c.m.stagger * i;
        for (const l of c.lanes[i]) {
          const list = keys.get(l.key) || [];
          list.push({ c, i, l, from });
          keys.set(l.key, list);
        }
      });
    plan = [];
    by.forEach((keys, t) => {
      const lists = Array.from(keys.values()).map((list) => list.sort((a, b) => a.from - b.from || a.c.n - b.c.n));
      // a motion given only an end starts where the one before it left off
      for (const list of lists)
        for (let j = 1; j < list.length; j++) {
          const e = list[j];
          if (!e.l.single) continue;
          const before = list[j - 1];
          const left = valueOf(before.l, kOf(before.c.m, before.i, Infinity));
          setVals(e.l, [left, e.l.vals[e.l.vals.length - 1]], isElement(t) ? t : undefined);
        }
      plan.push({ h: held.get(t)!, keys: lists });
    });
  };

  const paintAt = (time: number) => {
    if (dirty) rebuild();
    for (const { h, keys } of plan) {
      const values: Array<[Lane, number | string]> = [];
      for (const list of keys) {
        // the last to have started shows; before any has, the first one's start
        let e = list[0];
        for (const x of list) if (x.from <= time) e = x;
        values.push([e.l, valueOf(e.l, kOf(e.c.m, e.i, time - e.c.at))]);
      }
      apply(h, values);
    }
    // calls the playhead passed since the last paint, either way
    if (time !== was)
      for (const c of calls) {
        const passed = time > was ? (c.at > was || (c.at === 0 && was === 0)) && c.at <= time : c.at >= time && c.at < was;
        if (passed) c.fn();
      }
    was = time;
  };
  /** the time within the pass `t` (ms) falls in, played backwards on a yoyo's odd passes */
  const innerAt = (t: number) => {
    if (!inner) return 0;
    if (t <= 0) return 0;
    const pass = Math.min(passes - 1, Math.ceil(t / inner) - 1);
    const within = Math.min(inner, t - pass * inner);
    return options.yoyo && pass % 2 === 1 ? inner - within : within;
  };
  const total = () => (reduce ? 0 : Number.isFinite(passes) ? inner * passes : Infinity);
  const looks = () => Array.from(held.values()).filter((h) => h.base).map((h) => h.t as HTMLElement);

  const { controls, start } = player({
    total,
    one: () => inner,
    rest: () => 0,
    // under reduced motion the timeline is at its end at once
    render: (t) => paintAt(reduce ? inner : innerAt(t)),
    hold: () => looks().forEach(hold),
    letGo: () => looks().forEach(letGo),
    release: (holding) => held.forEach((h) => giveTarget(h, holding)),
    reduce,
    onUpdate: options.onUpdate,
    onComplete: options.onComplete,
  });

  let n = 0;
  /** ms where `at` places something now */
  const where = (at: Position | undefined) => place(at, inner / 1000, [prev[0] / 1000, prev[1] / 1000], new Map(Array.from(labels, ([k, v]) => [k, v / 1000]))) * 1000;
  // the controls, with the building added (their getters read the player)
  const tl = controls as Timeline;
  tl.add = (targets, keyframes, o = {}, at) => {
    const ts = resolveAny(targets);
    const lanes = ts.map((t) => lanesFor(t, keyframes));
    const r = Math.max(0, o.repeat ?? 0);
    const m: Timing = {
      delay: Math.max(0, (o.delay ?? 0) * 1000),
      stagger: Math.max(0, (o.stagger ?? d.stagger ?? 0) * 1000),
      duration: Math.max(0, (o.duration ?? d.duration ?? 0.6) * 1000),
      passes: Number.isFinite(r) ? r + 1 : 1,
      yoyo: !!o.yoyo,
      ease: easeOf(o.ease ?? d.ease),
    };
    const startAt = where(at);
    const span = m.delay + m.stagger * Math.max(0, ts.length - 1) + m.duration * m.passes;
    children.push({ targets: ts, lanes, m, at: startAt, span, n: n++ });
    ts.forEach((t, i) => held.set(t, holdTarget(t, lanes[i], held.get(t))));
    prev = [startAt, startAt + span];
    inner = Math.max(inner, startAt + span);
    dirty = true;
    return tl;
  };
  tl.call = (fn, at) => {
    const t = where(at);
    calls.push({ fn, at: t });
    inner = Math.max(inner, t);
    return tl;
  };
  tl.label = (name, at) => {
    labels.set(name, where(at));
    return tl;
  };
  tl.labelAt = (name) => (labels.has(name) ? labels.get(name)! / 1000 : undefined);

  // built in the same task (the chain of add()s), then painted and played
  queueMicrotask(() => start(options.autoplay !== false));
  return tl;
}
