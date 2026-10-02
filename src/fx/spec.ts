// Reading an item's `fx` list: defaults for what is left out, clamps for what
// is out of range, and a note for a type this build does not know. The core
// hands the list over as written (types.ts FxSpec); this makes it playable.

import type { Fx, FxBase, FxOn, FxType } from './types.js';
import type { FxSpec } from '../types.js';

const ONS: readonly FxOn[] = ['hover', 'appear', 'always', 'scroll'];

/** What each effect is when nothing but its type is written. */
export const FX_DEFAULTS: { [T in FxType]: Omit<Extract<Fx, { type: T }>, 'type'> } = {
  glitch: { on: 'hover', intensity: 0.6, speed: 1, seed: 0, in: 0.12, out: 0.35, blocks: 24, split: 6 },
};

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown, fallback: number, lo: number, hi: number, note: (m: string) => void, what: string): number => {
  if (v === undefined || v === null) return fallback;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    note(`${what}: ${JSON.stringify(v)} is not a number, using ${fallback}`);
    return fallback;
  }
  if (n < lo || n > hi) {
    const c = Math.min(hi, Math.max(lo, n));
    note(`${what}: ${n} is outside ${lo} to ${hi}, using ${c}`);
    return c;
  }
  return n;
};

/** The ranges each numeric field is kept within. */
const RANGES: Record<string, [number, number]> = {
  intensity: [0, 1],
  speed: [0.1, 4],
  seed: [0, 1e6],
  in: [0, 10],
  out: [0, 10],
  blocks: [2, 128],
  split: [0, 64],
};

/** One effect, filled in and checked; null when its type is not one this build plays. */
export function readOneFx(v: unknown, note: (m: string) => void, what: string): Fx | null {
  if (!isObj(v) || typeof v.type !== 'string') {
    note(`${what}: expected an object with a "type"`);
    return null;
  }
  const type = v.type as FxType;
  const defaults = FX_DEFAULTS[type] as (FxBase & Record<string, unknown>) | undefined;
  if (!defaults) {
    note(`${what}: "${v.type}" is not an effect this build of scrollwork/fx plays (${Object.keys(FX_DEFAULTS).join(', ')})`);
    return null;
  }
  const out: Record<string, unknown> = { type };
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    if (key === 'on') {
      const on = v.on === undefined ? d : v.on;
      if (typeof on === 'string' && (ONS as readonly string[]).includes(on)) out.on = on;
      else {
        note(`${what}.on: ${JSON.stringify(v.on)} is not one of ${ONS.join(', ')}; using ${String(d)}`);
        out.on = d;
      }
    } else if (typeof d === 'number') {
      const [lo, hi] = RANGES[key] || [-Infinity, Infinity];
      out[key] = num(v[key], d, lo, hi, note, `${what}.${key}`);
    } else out[key] = v[key] === undefined ? d : v[key];
  }
  return out as unknown as Fx;
}

/** A whole list, in order; what cannot be read is left out and said. */
export function readFx(list: readonly FxSpec[] | undefined, note: (m: string) => void, what: string): Fx[] {
  const out: Fx[] = [];
  (list || []).forEach((f, i) => {
    const fx = readOneFx(f, note, `${what}.fx[${i}]`);
    if (fx) out.push(fx);
  });
  return out;
}
