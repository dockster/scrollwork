// Reading a spec: fill what is missing with the defaults, keep what makes
// sense, and say what does not. A page written by hand is allowed to leave out
// everything but what it means; a typo says so in the console instead of
// silently doing something else.

import { SPEC_VERSION } from './types.js';
import { EASINGS } from './easing.js';
import { resolveVars } from './vars.js';
import type { AppearMotion, FxSpec, LoopMotion, Interaction, InteractionAnimation, MotionEase, MotionItem, MotionKey, MotionSpec, MotionState, PinMotion, ScrollMotion, CursorMotion, LoaderMotion, RolloverMotion, EdgeFade } from './types.js';

export const EASES: readonly MotionEase[] = ['smooth', 'out', 'in-out', 'expo', 'back', 'linear', 'in', 'in-back', 'in-out-back', ...EASINGS];
const EFFECTS = ['fade', 'slide-up', 'mask', 'blur', 'scale', 'custom', 'roll'] as const;
const SPLITS = ['none', 'lines', 'words', 'chars'] as const;
const SCROLL_SPLITS = [...SPLITS, 'children', 'slices'] as const;
const ORDERS = ['start', 'end', 'center', 'edges', 'random'] as const;
const ORIGINS = ['center', 'top', 'bottom', 'left', 'right', 'behind'] as const;
const MASKS = ['top', 'bottom', 'left', 'right'] as const;
const RANGES = ['through', 'in', 'out', 'hold'] as const;
const TRIGGERS = ['none', 'click', 'drag', 'hover', 'press', 'key', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup', 'delay', 'media-end', 'media-time'] as const;
const ACTIONS = ['none', 'navigate', 'change', 'back', 'scroll', 'url', 'overlay', 'swap', 'close', 'custom'] as const;
/** the point an element's motions turn and grow around (MotionItem.origin) */
const PIVOTS = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

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
  const b = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, blur: 0, ...base };
  const out: MotionState = {
    x: num(s.x, b.x, notes, what + '.x'),
    y: num(s.y, b.y, notes, what + '.y'),
    scale: num(s.scale, b.scale, notes, what + '.scale', 0),
    rotate: num(s.rotate, b.rotate, notes, what + '.rotate'),
    opacity: num(s.opacity, b.opacity, notes, what + '.opacity', 0, 1),
    blur: num(s.blur, b.blur, notes, what + '.blur', 0),
  };
  // one axis, a colour or a picture: only when given, so a state reads back as it was written
  if (s.rotateX !== undefined) out.rotateX = num(s.rotateX, 0, notes, what + '.rotateX');
  if (s.rotateY !== undefined) out.rotateY = num(s.rotateY, 0, notes, what + '.rotateY');
  if (s.perspective !== undefined) out.perspective = num(s.perspective, 1000, notes, what + '.perspective', 1);
  if (s.scaleX !== undefined || b.scaleX !== 1) out.scaleX = num(s.scaleX, b.scaleX, notes, what + '.scaleX', 0);
  if (s.scaleY !== undefined || b.scaleY !== 1) out.scaleY = num(s.scaleY, b.scaleY, notes, what + '.scaleY', 0);
  const fill = colour(s.fill ?? b.fill, notes, what + '.fill');
  if (fill) out.fill = fill;
  const ink = colour(s.ink ?? b.ink, notes, what + '.ink');
  if (ink) out.ink = ink;
  const image = picture(s.image ?? b.image, notes, what + '.image');
  if (image) out.image = image;
  if (isObj(s.clip) || isObj(b.clip)) {
    const c = (isObj(s.clip) ? s.clip : b.clip) as Record<string, unknown>;
    const side = (k: string) => (c[k] === undefined ? undefined : num(c[k], 0, notes, what + '.clip.' + k, 0, 100));
    const clip: NonNullable<MotionState['clip']> = {};
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      const v = side(k);
      if (v) clip[k] = v;
    }
    if (Object.keys(clip).length) out.clip = clip;
  } else if (s.clip !== undefined) notes.add(`${what}.clip: expected an object like {"top": 100, "right": 100}`);
  return out;
};
/** a CSS colour as written (a name, hex, rgb(), oklch()…): letters, digits, # ( ) , . % and spaces, nothing that could end a declaration */
const colour = (v: unknown, notes: Notes, what: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === 'string' && v.length <= 80 && /^[\w#(),.%\s/-]+$/.test(v)) return v.trim();
  notes.add(`${what}: expected a CSS colour like "#A1FFCB"`);
  return undefined;
};
/** a picture's address: http(s), a data: image, or a path; no quotes, spaces or newlines */
const picture = (v: unknown, notes: Notes, what: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === 'string' && v.length <= 20_000_000 && /^(https?:\/\/|data:image\/|\/|\.{0,2}\/|[\w-])[^\s"'<>\\]*$/.test(v) && !/^javascript:/i.test(v)) return v;
  notes.add(`${what}: expected a picture's URL`);
  return undefined;
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
  // a roll turns each digit on its own: always by letter
  const split = effect === 'roll' ? 'chars' : oneOf(a.split, SPLITS, APPEAR_DEFAULTS.split, notes, what + '.split');
  return {
    effect,
    split,
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
    ...(effect === 'roll' ? { turns: Math.round(num(a.turns, 1, notes, what + '.turns', 0, 10)) } : {}),
  };
}

export const LOOP_DEFAULTS = { duration: 4, ease: 'linear', yoyo: false, delay: 0, fade: 0, upright: false, flipbook: 0 } as const;

export function readLoop(v: unknown, notes: Notes, what: string): LoopMotion | undefined {
  if (v === undefined || v === false) return undefined;
  if (!isObj(v)) {
    notes.add(`${what}: expected an object like {"to": {"rotate": 360}, "duration": 8}`);
    return undefined;
  }
  return {
    from: state(v.from, notes, what + '.from'),
    to: state(v.to, notes, what + '.to'),
    duration: num(v.duration, LOOP_DEFAULTS.duration, notes, what + '.duration', 0.05),
    ease: oneOf(v.ease, EASES, LOOP_DEFAULTS.ease, notes, what + '.ease'),
    yoyo: v.yoyo === undefined ? LOOP_DEFAULTS.yoyo : !!v.yoyo,
    delay: num(v.delay, LOOP_DEFAULTS.delay, notes, what + '.delay', 0),
    fade: num(v.fade, LOOP_DEFAULTS.fade, notes, what + '.fade', 0),
    upright: v.upright === true,
    flipbook: num(v.flipbook, LOOP_DEFAULTS.flipbook, notes, what + '.flipbook', 0, 60),
    keys: keys(v.keys, notes, what + '.keys'),
  };
}

export function readScroll(v: unknown, notes: Notes, what: string): ScrollMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const s = isObj(v) ? v : {};
  return {
    speed: num(s.speed, 0, notes, what + '.speed', -100, 100),
    ...(s.cover === true ? { cover: true } : {}),
    from: state(s.from, notes, what + '.from'),
    to: state(s.to, notes, what + '.to'),
    range: oneOf(s.range, RANGES, 'through', notes, what + '.range'),
    keys: keys(s.keys, notes, what + '.keys'),
    trigger: typeof s.trigger === 'string' ? s.trigger : undefined,
    // only when given, so a scroll reads back as it was written
    ...(s.ease !== undefined ? { ease: oneOf(s.ease, EASES, 'linear', notes, what + '.ease') } : {}),
    ...(s.split !== undefined && s.split !== 'none' ? { split: oneOf(s.split, SCROLL_SPLITS, 'none', notes, what + '.split') } : {}),
    ...(s.spread !== undefined ? { spread: num(s.spread, 0.3, notes, what + '.spread', 0.05, 1) } : {}),
    ...(s.order !== undefined ? { order: oneOf(s.order, ORDERS, 'start', notes, what + '.order') } : {}),
    ...(s.outward === true ? { outward: true } : {}),
    ...(s.vary !== undefined ? { vary: num(s.vary, 0, notes, what + '.vary', 0, 1) } : {}),
    ...(s.origin !== undefined ? { origin: oneOf(s.origin, ORIGINS, 'center', notes, what + '.origin') } : {}),
    ...(s.slices !== undefined ? { slices: Math.round(num(s.slices, 4, notes, what + '.slices', 2, 12)) } : {}),
    ...(s.whole === true ? { whole: true } : {}),
    ...(s.mask !== undefined ? { mask: oneOf(s.mask, MASKS, 'bottom', notes, what + '.mask') } : {}),
  };
}

export function readPin(v: unknown, notes: Notes, what: string): PinMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const p = isObj(v) ? v : {};
  return { distance: num(p.distance, 600, notes, what + '.distance', 0), top: num(p.top, 0, notes, what + '.top') };
}

export const LOADER_DEFAULTS = { hold: 2.5, leave: 0.6, effect: 'fade', once: false } as const;

export function readLoader(v: unknown, notes: Notes, what: string): LoaderMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const l = isObj(v) ? v : {};
  if ((v as unknown) !== true && !isObj(v)) notes.add(`${what}: expected true or an object like {"hold": 2.5, "leave": 0.6}`);
  return {
    hold: num(l.hold, LOADER_DEFAULTS.hold, notes, what + '.hold', 0, 60),
    leave: num(l.leave, LOADER_DEFAULTS.leave, notes, what + '.leave', 0, 10),
    effect: oneOf(l.effect, ['fade', 'blur'] as const, LOADER_DEFAULTS.effect, notes, what + '.effect'),
    once: l.once === true,
  };
}

export const CURSOR_DEFAULTS = { lag: 0.12, hide: true, blend: 'normal' } as const;

export function readCursor(v: unknown, notes: Notes, what: string): CursorMotion | undefined {
  if (v === undefined || v === false) return undefined;
  const c = isObj(v) ? v : {};
  if ((v as unknown) !== true && !isObj(v)) notes.add(`${what}: expected true or an object like {"lag": 0.12, "links": {"scale": 2.5}}`);
  const out: CursorMotion = {
    lag: num(c.lag, CURSOR_DEFAULTS.lag, notes, what + '.lag', 0, 2),
    hide: c.hide === undefined ? CURSOR_DEFAULTS.hide : !!c.hide,
    blend: oneOf(c.blend, ['normal', 'difference'] as const, CURSOR_DEFAULTS.blend, notes, what + '.blend'),
  };
  if (c.links !== undefined) out.links = state(c.links, notes, what + '.links');
  return out;
}

export function readAnimation(v: unknown, notes: Notes, what: string, duration = 0.25): InteractionAnimation {
  const a = isObj(v) ? v : {};
  const curve = a.curve === 'custom' || a.curve === 'spring' ? a.curve : oneOf(a.curve, EASES, 'out', notes, what + '.curve');
  let bezier: InteractionAnimation['bezier'];
  let springOf: InteractionAnimation['spring'];
  if (curve === 'spring') {
    const s = a.spring;
    if (Array.isArray(s) && s.length === 3 && s.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) springOf = [s[0], s[1], s[2]];
    else notes.add(`${what}.spring: a spring needs [stiffness, damping, mass]; using out`);
  }
  if (curve === 'custom') {
    const b = a.bezier;
    if (Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number' && Number.isFinite(n))) bezier = [b[0], b[1], b[2], b[3]];
    else notes.add(`${what}.bezier: a custom curve needs [x1, y1, x2, y2]; using out`);
  }
  return {
    kind: a.kind === 'instant' ? 'instant' : 'animate',
    curve: (curve === 'custom' && !bezier) || (curve === 'spring' && !springOf) ? 'out' : curve,
    ...(bezier ? { bezier } : {}),
    ...(springOf ? { spring: springOf } : {}),
    duration: num(a.duration, duration, notes, what + '.duration', 0),
    ...(typeof a.transition === 'string' ? { transition: a.transition as InteractionAnimation['transition'] } : {}),
    ...(typeof a.direction === 'string' ? { direction: a.direction as InteractionAnimation['direction'] } : {}),
    // a curtain's colour goes into a CSS variable: a plain hex colour or nothing
    ...(typeof a.cover === 'string' && /^#[0-9a-f]{6}$/i.test(a.cover) ? { cover: a.cover } : {}),
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
      action = { type, frameId: str('frameId') || str('target'), ...(act.preserveScroll === true ? { preserveScroll: true } : {}) };
      break;
    case 'swap':
      action = { type, frameId: str('frameId') || str('target') };
      break;
    case 'overlay':
      action = {
        type,
        frameId: str('frameId') || str('target'),
        position: (str('position') || 'center') as never,
        closeOnOutside: act.closeOnOutside !== false,
        background: act.background !== false,
        ...(isObj(act.offset) && typeof act.offset.x === 'number' && typeof act.offset.y === 'number' ? { offset: { x: act.offset.x, y: act.offset.y } } : {}),
        ...(typeof act.backdrop === 'string' ? { backdrop: act.backdrop } : {}),
      };
      break;
    case 'scroll':
      action = { type, targetId: str('targetId') || str('target'), ...(typeof act.offset === 'number' && Number.isFinite(act.offset) ? { offset: act.offset } : {}) };
      break;
    case 'url':
      action = { type, url: str('url'), newTab: !!act.newTab };
      break;
    case 'custom':
      // the page's own action: its name, and whatever it carries, passed through as written
      action = { type, name: str('name'), ...(act.data !== undefined ? { data: act.data } : {}) };
      break;
    default:
      action = { type } as Interaction['action'];
  }
  return {
    id: typeof v.id === 'string' ? v.id : `ix${i}`,
    trigger,
    ...(typeof v.key === 'string' ? { key: v.key } : {}),
    ...(typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0 ? { at: v.at } : {}),
    delay: num(v.delay, 0, notes, what + '.delay', 0),
    action,
    animation: readAnimation(v.animation, notes, what + '.animation', trigger === 'press' ? 0.12 : 0.25),
    ...(typeof v.source === 'string' && v.source ? { source: v.source } : {}),
  };
}

/** One item, filled in and checked. */
export const ROLLOVER_DEFAULTS = {
  roll: { direction: 'up', duration: 0.2, stagger: 0.02, ease: 'ease-in-out-quad' },
  wipe: { direction: 'right', duration: 0.8, stagger: 0, ease: 'out' },
  // each letter flickers for a quarter of a second, the next one 0.05 s after (Codrops' Line Text Hover Animations)
  scramble: { direction: 'right', duration: 0.25, stagger: 0.05, ease: 'linear' },
} as const;

export function readRollover(v: unknown, notes: Notes, what: string): RolloverMotion | undefined {
  if (v === undefined || v === false) return undefined;
  if (!isObj(v)) {
    notes.add(`${what}: expected an object like {"effect": "roll"} or {"effect": "wipe", "color": "#A6F4C5"}`);
    return undefined;
  }
  const effect = oneOf(v.effect, ['roll', 'wipe', 'scramble'] as const, 'roll', notes, what + '.effect');
  const d = ROLLOVER_DEFAULTS[effect];
  const dirs = effect === 'roll' ? (['up', 'down'] as const) : effect === 'wipe' ? (['left', 'right', 'up', 'down', 'center', 'pointer'] as const) : (['left', 'right', 'up', 'down', 'center'] as const);
  const out: RolloverMotion = {
    effect,
    direction: oneOf(v.direction, dirs as readonly RolloverMotion['direction'][], d.direction, notes, what + '.direction'),
    duration: num(v.duration, d.duration, notes, what + '.duration', 0, 5),
    stagger: effect !== 'wipe' ? num(v.stagger, d.stagger, notes, what + '.stagger', 0, 0.5) : 0,
    ease: oneOf(v.ease, EASES, d.ease as MotionEase, notes, what + '.ease'),
  };
  if (effect === 'wipe') {
    if (typeof v.color === 'string' && v.color.trim()) out.color = v.color.trim();
    else notes.add(`${what}.color: a wipe needs the colour that sweeps across`);
    if (typeof v.ink === 'string' && v.ink.trim()) out.ink = v.ink.trim();
  }
  if (effect === 'scramble') {
    out.turns = Math.round(num(v.turns, 3, notes, what + '.turns', 1, 10));
    // the characters, as written: a few dozen at most, no line breaks (they are only ever text)
    if (typeof v.glyphs === 'string') {
      const g = Array.from(v.glyphs.replace(/[\u0000-\u001f\u007f\s]/g, '')).slice(0, 80).join('');
      if (g) out.glyphs = g;
      else notes.add(`${what}.glyphs: expected some characters to draw from`);
    }
    if (v.cursor === true) out.cursor = true;
    if (Array.isArray(v.colors)) {
      const cs = v.colors.slice(0, 6).map((c, n) => colour(c, notes, `${what}.colors[${n}]`)).filter((c): c is string => !!c);
      if (cs.length) out.colors = cs;
    }
    out.on = oneOf(v.on, ['hover', 'appear', 'both'] as const, 'hover', notes, what + '.on');
  }
  if (typeof v.trigger === 'string' && v.trigger) out.trigger = v.trigger;
  return out;
}

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
  const l = readLoop(v.loop, notes, `${what}.loop`);
  if (l) item.loop = l;
  const c = readCursor(v.cursor, notes, `${what}.cursor`);
  if (c) item.cursor = c;
  const ld = readLoader(v.loader, notes, `${what}.loader`);
  if (ld) item.loader = ld;
  // one effect, or a list of them (a roll and a wipe on the same button); one of each kind
  if (v.rollover !== undefined && v.rollover !== false) {
    const list = Array.isArray(v.rollover) ? v.rollover : [v.rollover];
    const ros: RolloverMotion[] = [];
    list.forEach((r, n) => {
      const ro = readRollover(r, notes, Array.isArray(v.rollover) ? `${what}.rollover[${n}]` : `${what}.rollover`);
      if (!ro) return;
      if (ros.some((x) => x.effect === ro.effect)) notes.add(`${what}.rollover: a second ${ro.effect}, left out (one of each)`);
      // a roll and a scramble both take the letters: the first one written keeps them
      else if ((ro.effect === 'roll' && ros.some((x) => x.effect === 'scramble')) || (ro.effect === 'scramble' && ros.some((x) => x.effect === 'roll'))) notes.add(`${what}.rollover: a ${ro.effect} with a ${ro.effect === 'roll' ? 'scramble' : 'roll'}, left out (both move the letters)`);
      else ros.push(ro);
    });
    if (ros.length) item.rollover = ros;
  }
  if (v.interactions !== undefined) {
    if (!Array.isArray(v.interactions)) notes.add(`${what}.interactions: expected a list`);
    else {
      const ixs = v.interactions.map((ix, n) => readInteraction(ix, notes, `${what}.interactions[${n}]`, n)).filter((x): x is Interaction => !!x);
      if (ixs.length) item.interactions = ixs;
    }
  }
  // effects are a plugin's to read (scrollwork/fx); the core keeps them as written, each with a type
  if (v.fx !== undefined) {
    if (!Array.isArray(v.fx)) notes.add(`${what}.fx: expected a list of effects`);
    else {
      const fx = v.fx.filter((f, n) => {
        const ok = isObj(f) && typeof f.type === 'string' && !!f.type;
        if (!ok) notes.add(`${what}.fx[${n}]: expected an object with a "type"`);
        return ok;
      }) as FxSpec[];
      if (fx.length) item.fx = fx;
    }
  }
  if (v.origin !== undefined) item.origin = oneOf(v.origin, PIVOTS, 'center', notes, what + '.origin');
  if (v.fade !== undefined) {
    if (!isObj(v.fade)) notes.add(`${what}.fade: expected px for each edge, like {"top": 40, "bottom": 40}`);
    else {
      const f: EdgeFade = {};
      for (const k of ['top', 'right', 'bottom', 'left'] as const) if (v.fade[k] !== undefined) f[k] = num(v.fade[k], 0, notes, `${what}.fade.${k}`, 0, 2000);
      if (Object.values(f).some((x) => x > 0)) item.fade = f;
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
  let raw: unknown[] = Array.isArray(s.items) ? s.items : [];
  // a spec from code: "var(--name)" read from the page's root, where tokens live (vars.ts)
  if (typeof document !== 'undefined' && document.documentElement && JSON.stringify(raw).includes('var(')) {
    const style = getComputedStyle(document.documentElement);
    raw = resolveVars(raw, (name) => style.getPropertyValue(name), notes, 'items') as unknown[];
  }
  if (s.items !== undefined && !Array.isArray(s.items)) notes.add('items: expected a list');
  const items = raw.map((it, i) => readItem(it, notes, i)).filter((x): x is MotionItem => !!x);
  notes.flush(warn);
  return { version: SPEC_VERSION, items, smooth: !!s.smooth };
}
