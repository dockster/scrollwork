// morph(): one SVG shape becomes another, whatever their points and commands.
// Both outlines are walked at the same number of points, a closed shape is
// lined up with the other where they are nearest, and each point travels to
// its partner. At rest each shape is its own path, exactly as written.
//
//   morph('#blob', '#star', { duration: 0.8, ease: 'in-out' });
//   tl.add(shape('#icon', 'M0 0 L10 10 ...'), { progress: 1 });   // in a timeline
//
// One outline per path: a shape with a hole (a letter O) morphs its outer
// line only.

import { animate, type AnimateOptions, type Controls } from '../index.js';

type Pt = [number, number];
const SVGNS = 'http://www.w3.org/2000/svg';

const pathOf = (p: string | Element): SVGPathElement | null => (typeof p === 'string' ? (document.querySelector(p) as SVGPathElement | null) : (p as SVGPathElement));
/** a `d` written as is, or the `d` of a path found by selector */
const dOf = (to: string | Element): string => {
  if (typeof to !== 'string') return (to as SVGPathElement).getAttribute('d') || '';
  return /^\s*[mM]/.test(to) ? to : pathOf(to)?.getAttribute('d') || '';
};
const closed = (d: string) => /[zZ]\s*$/.test(d);

/** `n` points evenly along a `d`, measured on a hidden path beside `near` */
export function sample(d: string, n: number, near: SVGPathElement): Pt[] {
  const host = near.ownerSVGElement || near.parentNode || document.body;
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('visibility', 'hidden');
  host.appendChild(p);
  const out: Pt[] = [];
  try {
    const len = p.getTotalLength();
    const c = closed(d);
    for (let i = 0; i < n; i++) {
      const q = p.getPointAtLength((len * i) / (c ? n : n - 1));
      out.push([q.x, q.y]);
    }
  } finally {
    p.remove();
  }
  return out;
}

/** `b` turned (and, if nearer, run the other way) to line up with `a`: a closed shape can start anywhere along itself */
export function lineUp(a: Pt[], b: Pt[]): Pt[] {
  const n = a.length;
  let best = b;
  let bestCost = Infinity;
  for (const list of [b, b.slice().reverse()])
    for (let s = 0; s < n; s++) {
      let cost = 0;
      for (let i = 0; i < n && cost < bestCost; i++) {
        const q = list[(i + s) % n];
        cost += (a[i][0] - q[0]) ** 2 + (a[i][1] - q[1]) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = list.slice(s).concat(list.slice(0, s));
      }
    }
  return best;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
export const written = (pts: Pt[], close: boolean) => 'M' + pts.map((p) => r2(p[0]) + ' ' + r2(p[1])).join('L') + (close ? 'Z' : '');

/**
 * A shape on its way to another: set `progress` (0 to 1) and the path is drawn
 * that far along. Animate it, or add it to a timeline, with `{ progress: 1 }`.
 */
export function shape(path: string | Element, to: string | Element, options: { points?: number } = {}): { progress: number } {
  const el = pathOf(path);
  const from = el?.getAttribute('d') || '';
  const end = dOf(to);
  let k = 0;
  let a: Pt[] = [];
  let b: Pt[] = [];
  let close = false;
  const ready = () => {
    if (a.length || !el) return;
    const n = Math.max(8, Math.min(1000, options.points ?? 120));
    close = closed(from) && closed(end);
    a = sample(from, n, el);
    b = sample(end, n, el);
    if (close) b = lineUp(a, b);
  };
  return {
    get progress() {
      return k;
    },
    set progress(v: number) {
      k = v;
      if (!el || !from || !end) return;
      if (v <= 0) el.setAttribute('d', from);
      else if (v >= 1) el.setAttribute('d', end);
      else {
        ready();
        el.setAttribute('d', written(a.map((p, i) => [p[0] + (b[i][0] - p[0]) * v, p[1] + (b[i][1] - p[1]) * v]), close));
      }
    },
  };
}

/** Morph a path into another shape now: an animation like any other. */
export function morph(path: string | Element, to: string | Element, options: AnimateOptions & { points?: number } = {}): Controls {
  return animate(shape(path, to, options), { progress: [0, 1] }, options);
}
