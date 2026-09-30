// CSS variables in a spec: motion that follows a design's tokens.
//
// A design system keeps its durations and curves as custom properties
// (`--duration-slow: 600ms`, `--ease-brand: cubic-bezier(.2, 0, 0, 1)`), and a
// page that changes one should see its animations change with it. So wherever
// a spec takes a duration or a curve it also takes `"var(--name)"`, read from
// the element's computed style when the page is read. A fallback after a comma
// is used when the variable is missing or holds something Scrollwork cannot
// play: `"var(--ease-bounce, ease-out-bounce)"`.
//
// Durations: `600ms`, `0.6s`, or a bare number (seconds, as everywhere in a
// spec). Curves: a Scrollwork curve name, or `cubic-bezier(x1, y1, x2, y2)`,
// which an interaction plays as its custom curve. An appear plays named curves
// only, so a bezier there falls back.

import { EASES } from './easing.js';
import type { Notes } from './spec.js';

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);

/** Seconds-valued fields. */
const TIMES = new Set(['duration', 'delay', 'stagger']);
/** Curve-valued fields: an appear's `ease`, an interaction animation's `curve`. */
const CURVES = new Set(['ease', 'curve']);
const NAMES = new Set<string>(Object.keys(EASES));

const VAR = /^\s*var\(\s*(--[\w-]+)\s*(?:,\s*(.*?))?\s*\)\s*$/;

/** `"var(--x, fallback)"` as its name and fallback; null for anything else. */
export function varRef(v: unknown): { name: string; fallback: string | null } | null {
  if (typeof v !== 'string') return null;
  const m = VAR.exec(v);
  return m ? { name: m[1], fallback: m[2] !== undefined && m[2] !== '' ? m[2] : null } : null;
}

/** A CSS time, or a bare number, in seconds; null when it is not one. */
export function seconds(v: string): number | null {
  const m = /^\s*(-?\d*\.?\d+)\s*(ms|s)?\s*$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return m[2]?.toLowerCase() === 'ms' ? n / 1000 : n;
}

/** A curve Scrollwork plays: a name, or four bezier numbers; null otherwise. */
export function curveOf(v: string): { name: string } | { bezier: [number, number, number, number] } | null {
  const s = v.trim();
  if (NAMES.has(s)) return { name: s };
  const m = /^cubic-bezier\(\s*([^)]*)\)$/i.exec(s);
  if (!m) return null;
  const n = m[1].split(',').map((x) => Number(x.trim()));
  return n.length === 4 && n.every(Number.isFinite) ? { bezier: [n[0], n[1], n[2], n[3]] } : null;
}

/**
 * The spec with every `var()` in a duration or curve replaced by what it holds
 * (or its fallback), read through `lookup`. What cannot be read is left out, so
 * the field takes its default, and said in `notes`. The input is not changed.
 */
export function resolveVars(raw: unknown, lookup: (name: string) => string, notes: Notes, what: string): unknown {
  if (Array.isArray(raw)) return raw.map((v, i) => resolveVars(v, lookup, notes, `${what}[${i}]`));
  if (!isObj(raw)) return raw;
  const out: Loose = {};
  for (const [k, v] of Object.entries(raw)) {
    const ref = varRef(v);
    if (!ref || (!TIMES.has(k) && !CURVES.has(k))) {
      out[k] = isObj(v) || Array.isArray(v) ? resolveVars(v, lookup, notes, `${what}.${k}`) : v;
      continue;
    }
    const held = lookup(ref.name).trim();
    const tries = [held, ref.fallback].filter((x): x is string => !!x);
    if (TIMES.has(k)) {
      const s = tries.map(seconds).find((x) => x !== null);
      if (s !== undefined && s !== null) out[k] = s;
      else notes.add(`${what}.${k}: ${ref.name} ${held ? `holds "${held}", not a time` : 'is not set'}${ref.fallback ? ` and the fallback "${ref.fallback}" is not one either` : ''}; using the default`);
      continue;
    }
    // a curve: an appear takes names only, an interaction a bezier too
    const named = k === 'ease';
    let used = false;
    for (const t of tries) {
      const c = curveOf(t);
      if (!c) continue;
      if ('name' in c) {
        out[k] = c.name;
        used = true;
        break;
      }
      if (!named) {
        out[k] = 'custom';
        out.bezier = c.bezier;
        used = true;
        break;
      }
    }
    if (!used) notes.add(`${what}.${k}: ${ref.name} ${held ? `holds "${held}", which ${named ? 'an appear cannot play (a curve name only)' : 'is not a curve name or cubic-bezier()'}` : 'is not set'}${ref.fallback ? ` and the fallback "${ref.fallback}" is not one either` : ''}; using the default`);
  }
  return out;
}
