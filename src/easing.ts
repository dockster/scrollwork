// Curves: cubic-bezier timing functions solved by bisection, and the named
// ones Scrollwork speaks.

import type { MotionEase } from './types.js';

export type EaseFn = (t: number) => number;
/** a named curve, a cubic bezier [x1, y1, x2, y2], or a function of 0 to 1 */
export type EaseInput = MotionEase | [number, number, number, number] | EaseFn;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A CSS cubic-bezier(). x outside 0 to 1 is not a function of time (CSS
 * refuses it too), so it is clamped and the solver always lands; y may
 * overshoot, which is what "back" curves are.
 */
export function bezier(ax: number, y1: number, bx: number, y2: number): EaseFn {
  const x1 = clamp01(ax);
  const x2 = clamp01(bx);
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 24; i++) {
      u = (lo + hi) / 2;
      const x = 3 * x1 * u * (1 - u) * (1 - u) + 3 * x2 * u * u * (1 - u) + u * u * u;
      if (x < t) lo = u;
      else hi = u;
    }
    return 3 * y1 * u * (1 - u) * (1 - u) + 3 * y2 * u * u * (1 - u) + u * u * u;
  };
}

/** The named curves, with the points they are made of (the same as CSS would write them). */
export const CURVES: Record<Exclude<MotionEase, 'linear'>, [number, number, number, number]> = {
  smooth: [0.87, 0, 0.13, 1],
  out: [0.22, 1, 0.36, 1],
  'in-out': [0.65, 0, 0.35, 1],
  expo: [0.16, 1, 0.3, 1],
  back: [0.34, 1.56, 0.64, 1],
  in: [0.42, 0, 1, 1],
  'in-back': [0.3, -0.05, 0.7, -0.5],
  'in-out-back': [0.7, -0.4, 0.4, 1.4],
};

export const EASES: Record<MotionEase, EaseFn> = {
  ...(Object.fromEntries(Object.entries(CURVES).map(([k, p]) => [k, bezier(p[0], p[1], p[2], p[3])])) as Record<Exclude<MotionEase, 'linear'>, EaseFn>),
  linear: clamp01,
};

/**
 * A spring (Figma's Gentle, Quick, Bouncy, Slow, or its own stiffness,
 * damping and mass) from 0 to 1, starting at rest. Its time is its own: how
 * long it takes to settle within a thousandth of the end, capped at 10 s.
 * `ease` maps 0 to 1 of that time onto the spring's position, so a timeline
 * of `duration` seconds plays it exactly.
 */
const springs = new Map<string, { ease: EaseFn; duration: number }>();
export function spring(stiffness: number, damping: number, mass = 1): { ease: EaseFn; duration: number } {
  // asked for every frame a change plays: worked out once per spring
  const key = `${stiffness},${damping},${mass}`;
  const known = springs.get(key);
  if (known) return known;
  const made = solveSpring(stiffness, damping, mass);
  if (springs.size > 64) springs.clear();
  springs.set(key, made);
  return made;
}

function solveSpring(stiffness: number, damping: number, mass: number): { ease: EaseFn; duration: number } {
  const k = Math.max(1, stiffness);
  const c = Math.max(0.01, damping);
  const m = Math.max(0.01, mass);
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const at = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const r = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - r);
    const r2 = -w0 * (zeta + r);
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  };
  // settled: the last moment it was more than a thousandth away, in 1 ms steps
  let settle = 0;
  for (let t = 0; t <= 10; t += 0.001) if (Math.abs(at(t) - 1) > 0.001) settle = t;
  const duration = Math.min(10, Math.max(0.05, settle + 0.001));
  return { ease: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : at(t * duration)), duration };
}

/** Figma's spring presets, as stiffness, damping and mass. */
export const SPRINGS: Record<'gentle' | 'quick' | 'bouncy' | 'slow', [number, number, number]> = {
  gentle: [100, 15, 1],
  quick: [300, 20, 1],
  bouncy: [600, 15, 1],
  slow: [80, 20, 1],
};

/** Any accepted way of naming a curve, as a function; unknown names fall back to `out`. */
export function easeOf(e: EaseInput | undefined, fallback: MotionEase = 'out'): EaseFn {
  if (typeof e === 'function') return e;
  if (Array.isArray(e) && e.length === 4) return bezier(e[0], e[1], e[2], e[3]);
  return EASES[e as MotionEase] || EASES[fallback];
}
