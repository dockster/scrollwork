// Any property, for animate() and timeline(): a CSS property or variable on an
// element, a number on a plain object, or `draw` (how much of an SVG line is
// drawn). The six motion values (x, y, scale, rotate, opacity, blur and their
// one-axis and 3D kin) stay with style.ts, which adds them to the element's
// own look; everything here moves from the element's computed value to the
// one given.
//
// A value is a number or a CSS string. Two strings move number by number when
// they are written the same way around their numbers ("inset(0 0 40% 0)" to
// "inset(0 0 0% 0)", "0 4px 12px rgba(0, 0, 0, 0.2)"); colours (hex, rgb(),
// named) move through rgba; a bare number takes the other end's unit; anything
// else switches halfway.

import { clamp01 } from './easing.js';
import { rgba, type Rgba } from './style.js';

export type Mixer = (k: number) => string;

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
/** a number as CSS writes it: no exponent, four decimals at most */
export const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);
const cssRgba = (c: Rgba) => 'rgba(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ', ' + fmt(c[3]) + ')';

/** #rgb, #rgba, #rrggbb, #rrggbbaa as numbers; null for anything else */
export function hex(v: string): Rgba | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(v.trim());
  if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
  const h = m[1].length < 5 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

/** every colour written as hex or rgb() in a value, as rgba(r, g, b, a), so two values compare number for number */
export function normalise(v: string): string {
  return v
    .replace(/#[0-9a-f]{3,8}\b/gi, (h) => {
      const c = hex(h);
      return c ? cssRgba(c) : h;
    })
    .replace(/rgba?\([^)]*\)/gi, (c) => cssRgba(rgba(c)));
}

/** the text around a value's numbers, and the numbers */
const split = (v: string): [string[], number[]] => [v.split(NUM), (v.match(NUM) || []).map(Number)];

/**
 * How a value moves from `a` to `b`. `colour` reads a colour the way the
 * browser does (named colours); without it only hex and rgb() are known.
 */
export function mixer(a: string, b: string, colour?: (v: string) => Rgba | null): Mixer {
  a = normalise(String(a).trim());
  b = normalise(String(b).trim());
  let [pa, na] = split(a);
  let [pb, nb] = split(b);
  // an empty start (a variable not set yet) is the end with its numbers at 0
  if (!a && nb.length) {
    pa = pb;
    na = nb.map(() => 0);
  }
  // a bare number takes the other end's unit
  if (na.length === 1 && nb.length === 1 && pa.join('') === '' && pb.join('') !== '') pa = pb;
  if (na.length === 1 && nb.length === 1 && pb.join('') === '' && pa.join('') !== '') pb = pa;
  if (na.length === nb.length && pa.join('\u0000') === pb.join('\u0000')) {
    if (!na.length) return () => b;
    return (k) => {
      let out = pa[0];
      for (let i = 0; i < na.length; i++) out += fmt(na[i] + (nb[i] - na[i]) * k) + pa[i + 1];
      return out;
    };
  }
  // two colours written differently (a name and a hex)
  const ca = colour ? colour(a) : null;
  const cb = colour ? colour(b) : null;
  if (ca && cb) return (k) => cssRgba([0, 1, 2, 3].map((i) => ca[i] + (cb[i] - ca[i]) * k) as Rgba);
  return (k) => (k < 0.5 ? a : b);
}

/** Values evenly spaced, `k` (0 to 1) of the way along: the mixer of the segment it falls in. */
export function mixAlong(values: string[], colour?: (v: string) => Rgba | null): Mixer {
  if (values.length === 1) return () => values[0];
  const parts: Mixer[] = [];
  for (let i = 0; i < values.length - 1; i++) parts.push(mixer(values[i], values[i + 1], colour));
  return (k) => {
    const at = clamp01(k) * parts.length;
    const i = Math.min(parts.length - 1, Math.floor(at));
    return parts[i](at - i);
  };
}

/** `backgroundColor` and `background-color` are both background-color; a variable is kept as written */
export const cssName = (key: string) => (key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));

/**
 * The CSS properties an animation wrote to, with the element's own inline
 * value from before: put back when the animation is cancelled or stopped.
 */
const OWN = new WeakMap<HTMLElement, Map<string, [string, string]>>();
/** elements that had no style attribute before: none after either */
const BARE = new WeakSet<HTMLElement>();
export function keepOwn(el: HTMLElement, name: string) {
  let m = OWN.get(el);
  if (!m) {
    OWN.set(el, (m = new Map()));
    if (!el.hasAttribute('style')) BARE.add(el);
  }
  if (!m.has(name)) m.set(name, [el.style.getPropertyValue(name), el.style.getPropertyPriority(name)]);
}
export function giveBack(el: HTMLElement, names: Iterable<string>) {
  const m = OWN.get(el);
  if (!m) return;
  for (const n of names) {
    const own = m.get(n);
    if (!own) continue;
    if (own[0]) el.style.setProperty(n, own[0], own[1]);
    else el.style.removeProperty(n);
    m.delete(n);
  }
  if (!m.size) {
    OWN.delete(el);
    if (BARE.has(el) && el.getAttribute('style') === '') el.removeAttribute('style');
    BARE.delete(el);
  }
}

/** An SVG line's length, for drawing it; 0 for anything that has none. */
export function lineLength(el: Element): number {
  const g = el as SVGGeometryElement;
  if (typeof g.getTotalLength !== 'function') return 0;
  try {
    return g.getTotalLength();
  } catch {
    return 0;
  }
}
/** `v` (0 to 1) of the line drawn, from its start */
export function paintDraw(el: HTMLElement, len: number, v: number) {
  el.style.strokeDasharray = fmt(len) + ' ' + fmt(len);
  el.style.strokeDashoffset = fmt(len * (1 - v));
}
