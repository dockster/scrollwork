// What the extras share: targets, the element's own translate and rotate (a
// motion is added to them), and reduced motion.

export type Targets = string | Element | Iterable<Element> | ArrayLike<Element>;

export function els(t: Targets): HTMLElement[] {
  if (typeof t === 'string') return typeof document === 'undefined' ? [] : Array.from(document.querySelectorAll<HTMLElement>(t));
  if (typeof Element !== 'undefined' && t instanceof Element) return [t as HTMLElement];
  return Array.from(t as ArrayLike<Element>) as HTMLElement[];
}
export const one = (t: Targets | SVGElement): HTMLElement | null => els(t as Targets)[0] || null;

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * An element's own translate and rotate, inline and computed: an offset is
 * written on top of them, and at rest the inline ones come back exactly.
 */
export interface Own {
  translate: string;
  rotate: string;
  tx: string;
  ty: string;
  rot: number;
}
export function ownOf(el: HTMLElement): Own {
  const cs = getComputedStyle(el);
  const t = cs.translate && cs.translate !== 'none' ? cs.translate.split(' ') : [];
  const r = cs.rotate && cs.rotate !== 'none' ? parseFloat(cs.rotate) : 0;
  return { translate: el.style.translate, rotate: el.style.rotate, tx: t[0] || '', ty: t[1] || '', rot: Number.isFinite(r) ? r : 0 };
}
/** write an offset of x, y px and r degrees on top of the element's own; nothing at all puts its own back */
export function offset(el: HTMLElement, own: Own, x: number, y: number, r = 0) {
  if (!x && !y) el.style.translate = own.translate;
  else el.style.translate = (own.tx ? 'calc(' + own.tx + ' + ' + x + 'px)' : x + 'px') + ' ' + (own.ty ? 'calc(' + own.ty + ' + ' + y + 'px)' : y + 'px');
  el.style.rotate = r ? own.rot + r + 'deg' : own.rotate;
}
