// Reading a spec: fill what is missing with the defaults, keep what makes
// sense, and say what does not. A page written by hand is allowed to leave out
// everything but what it means; a typo says so in the console instead of
// silently doing something else.

import { SPEC_VERSION } from './types.js';
import type { AppearMotion, Interaction, InteractionAnimation, MotionEase, MotionItem, MotionKey, MotionSpec, MotionState, PinMotion, ScrollMotion } from './types.js';

export const EASES: readonly MotionEase[] = ['smooth', 'out', 'in-out', 'expo', 'back', 'linear', 'in', 'in-back', 'in-out-back'];
const EFFECTS = ['fade', 'slide-up', 'mask', 'blur', 'scale', 'custom'] as const;
const SPLITS = ['none', 'lines', 'words', 'chars'] as const;
const RANGES = ['through', 'in', 'out'] as const;
const TRIGGERS = ['none', 'click', 'drag', 'hover', 'press', 'key', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup', 'delay'] as const;
const ACTIONS = ['none', 'navigate', 'change', 'back', 'scroll', 'url', 'overlay', 'swap', 'close'] as const;

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

/** Collects what could not be read, and says it once. */
export class Notes {
  readonly list: string[] = [];
  constructor(private readonly where: string) {}
  add(msg: string) {
    this.list.push(msg);
  }
  flush(on: boolean) {
    if (on && this.list.length && typeof console !== 'undefined') {
      console.warn(`[scrollwork] ${this.where}:\n  ` + this.list.join('\n  '));
    }
  }
}

const num = (v: unknown, fallback: number, notes: Notes, what: string, lo = -Infinity, hi = Infinity): number => {
  if (v === undefined || v === null) return fallback;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    notes.add(`${what}: ${JSON.stringify(v)} is not a number, using ${fallback}`);
    return fallback;
  }
  if (n < lo || n > hi) {
    const c = Math.min(hi, Math.max(lo, n));
    notes.add(`${what}: ${n} is outside ${lo} to ${hi}, using ${c}`);
    return c;
  }
  return n;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, notes: Notes, what: string): T => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  notes.add(`${what}: ${JSON.stringify(v)} is not one of ${allowed.join(', ')}; using ${fallback}`);
  return fallback;
};

/** A state, from whatever parts were given; identity for the rest. */
export const state = (v: unknown, notes: Notes, what: string, base: Partial<MotionState> = {}): MotionState => {
  const s = isObj(v) ? v : {};
  if (v !== undefined && !isObj(v)) notes.add(`${what}: expected an object like {"y": 40, "opacity": 0}`);
  const b = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0, ...base };
  return {
    x: num(s.x, b.x, notes, what + '.x'),
    y: num(s.y, b.y, notes, what + '.y'),
    scale: num(s.scale, b.scale, notes, what + '.scale', 0),
    rotate: num(s.rotate, b.rotate, notes, what + '.rotate'),
    opacity: num(s.opacity, b.opacity, notes, what + '.opacity', 0, 1),
    blur: num(s.blur, b.blur, notes, what + '.blur', 0),
  };
};

const keys = (v: unknown, notes: Notes, what: string): MotionKey[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    notes.add(`${what}: expected a list of { at, state }`);
    return undefined;
  }
  return v.filter(isObj).map((k, i) => ({ at: num(k.at, 50, notes, `${what}[${i}].at`, 0, 100), state: state(k.state, notes, `${what}[${i}].state`) }));
};

export const APPEAR_DEFAULTS = { effect: 'slide-up', split: 'none', duration: 0.8, delay: 0, stagger: 0.08, ease: 'expo', offset: 15, replay: false } as const;

export function readAppear(v: unknown, notes: Notes, what: string): AppearMotion | undefined {
  if (v === undefined || v === false) return undefined;
  // "appear": "fade" is the effect alone; "appear": true is every default
  if (typeof v === 'string') v = { effect: v };
  else if (v !== true && !isObj(v)) notes.add(`${what}: expected an object like {"effect": "fade"}; using the defaults`);
  const a = isObj(v) ? v : {};
  // a start state given without an effect is a custom start, not slide-up
  const effect = a.effect === undefined && a.from !== undefined ? 'custom' : oneOf(a.effect, EFFECTS, APPEAR_DEFAULTS.effect, notes, what + '.effect');
  return {
    effect,
    split: oneOf(a.split, SPLITS, APPEAR_DEFAULTS.split, notes, what + '.split'),
    duration: num(a.duration, APPEAR_DEFAULTS.duration, notes, what + '.duration', 0),
    delay: num(a.delay, APPEAR_DEFAULTS.delay, notes, what + '.delay', 0),
    stagger: num(a.stagger, APPEAR_DEFAULTS.stagger, notes, what + '.stagger', 0),
    ease: oneOf(a.ease, EASES, APPEAR_DEFAULTS.ease, notes, what + '.ease'),
    offset: num(a.offset, APPEAR_DEFAULTS.offset, notes, what + '.offset', 0, 100),
    replay: a.replay === undefined ? APPEAR_DEFAULTS.replay : !!a.replay,
    // the custom effect's start; a bare `from` without an effect means custom
    from: state(a.from, notes, what + '.from', a.from === undefined ? { y: 40, opacity: 0 } : {}),
    keys: keys(a.keys, notes, what + '.keys'),
    trigger: typeof a.trigger === 'string' ? a.trigger : undefined,
  };
}

export function readScroll(v: unknown, notes: Notes, what: string): ScrollMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const s = isObj(v) ? v : {};
  return {
    speed: num(s.speed, 0, notes, what + '.speed', -100, 100),
    from: state(s.from, notes, what + '.from'),
    to: state(s.to, notes, what + '.to'),
    range: oneOf(s.range, RANGES, 'through', notes, what + '.range'),
    keys: keys(s.keys, notes, what + '.keys'),
    trigger: typeof s.trigger === 'string' ? s.trigger : undefined,
  };
}

export function readPin(v: unknown, notes: Notes, what: string): PinMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const p = isObj(v) ? v : {};
  return { distance: num(p.distance, 600, notes, what + '.distance', 0), top: num(p.top, 0, notes, what + '.top') };
}

export function readAnimation(v: unknown, notes: Notes, what: string, duration = 0.25): InteractionAnimation {
  const a = isObj(v) ? v : {};
  const curve = a.curve === 'custom' ? 'custom' : oneOf(a.curve, EASES, 'out', notes, what + '.curve');
  let bezier: InteractionAnimation['bezier'];
  if (curve === 'custom') {
    const b = a.bezier;
    if (Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number' && Number.isFinite(n))) bezier = [b[0], b[1], b[2], b[3]];
    else notes.add(`${what}.bezier: a custom curve needs [x1, y1, x2, y2]; using out`);
  }
  return {
    kind: a.kind === 'instant' ? 'instant' : 'animate',
    curve: curve === 'custom' && !bezier ? 'out' : curve,
    ...(bezier ? { bezier } : {}),
    duration: num(a.duration, duration, notes, what + '.duration', 0),
    ...(typeof a.transition === 'string' ? { transition: a.transition as InteractionAnimation['transition'] } : {}),
    ...(typeof a.direction === 'string' ? { direction: a.direction as InteractionAnimation['direction'] } : {}),
  };
}

export function readInteraction(v: unknown, notes: Notes, what: string, i: number): Interaction | null {
  if (!isObj(v)) {
    notes.add(`${what}: expected an object`);
    return null;
  }
  const trigger = oneOf(v.trigger, TRIGGERS, 'none', notes, what + '.trigger');
  const act = isObj(v.action) ? v.action : {};
  const type = oneOf(act.type, ACTIONS, 'none', notes, what + '.action.type');
  const str = (k: string) => (typeof act[k] === 'string' ? (act[k] as string) : '');
  let action: Interaction['action'];
  switch (type) {
    case 'change':
      action = { type, state: state(act.state, notes, what + '.action.state') };
      break;
    case 'navigate':
    case 'swap':
      action = { type, frameId: str('frameId') || str('target') };
      break;
    case 'overlay':
      action = { type, frameId: str('frameId') || str('target'), position: (str('position') || 'center') as never, closeOnOutside: act.closeOnOutside !== false, background: act.background !== false };
      break;
    case 'scroll':
      action = { type, targetId: str('targetId') || str('target') };
      break;
    case 'url':
      action = { type, url: str('url'), newTab: !!act.newTab };
      break;
    default:
      action = { type } as Interaction['action'];
  }
  return {
    id: typeof v.id === 'string' ? v.id : `ix${i}`,
    trigger,
    ...(typeof v.key === 'string' ? { key: v.key } : {}),
    delay: num(v.delay, 0, notes, what + '.delay', 0),
    action,
    animation: readAnimation(v.animation, notes, what + '.animation', trigger === 'press' ? 0.12 : 0.25),
  };
}

/** One item, filled in and checked. */
export function readItem(v: unknown, notes: Notes, i: number): MotionItem | null {
  const what = `items[${i}]`;
  if (!isObj(v)) {
    notes.add(`${what}: expected an object`);
    return null;
  }
  if (typeof v.id !== 'string' || !v.id) {
    notes.add(`${what}: needs an "id" (the value of the attribute that names its element)`);
    return null;
  }
  const item: MotionItem = { id: v.id, text: !!v.text };
  const a = readAppear(v.appear, notes, `${what}.appear`);
  if (a) item.appear = a;
  const s = readScroll(v.scroll, notes, `${what}.scroll`);
  if (s) item.scroll = s;
  const p = readPin(v.pin, notes, `${what}.pin`);
  if (p) item.pin = p;
  if (v.interactions !== undefined) {
    if (!Array.isArray(v.interactions)) notes.add(`${what}.interactions: expected a list`);
    else {
      const ixs = v.interactions.map((ix, n) => readInteraction(ix, notes, `${what}.interactions[${n}]`, n)).filter((x): x is Interaction => !!x);
      if (ixs.length) item.interactions = ixs;
    }
  }
  return item;
}

/** A whole spec, filled in and checked; `warn` says what could not be read. */
export function readSpec(v: unknown, warn = true): MotionSpec {
  const notes = new Notes('spec');
  const s = isObj(v) ? v : {};
  if (!isObj(v)) notes.add('expected { items: [...] }');
  const version = s.version === undefined ? SPEC_VERSION : num(s.version, SPEC_VERSION, notes, 'version');
  if (version > SPEC_VERSION) notes.add(`version ${version} was written for a newer Scrollwork than this one (reads version ${SPEC_VERSION}); what it knows still plays`);
  const raw = Array.isArray(s.items) ? s.items : [];
  if (s.items !== undefined && !Array.isArray(s.items)) notes.add('items: expected a list');
  const items = raw.map((it, i) => readItem(it, notes, i)).filter((x): x is MotionItem => !!x);
  notes.flush(warn);
  return { version: SPEC_VERSION, items, smooth: !!s.smooth };
}
