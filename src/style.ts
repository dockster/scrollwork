// Painting a state onto an element, added to what the element already has.
//
// Motion writes the individual transform properties (translate, scale,
// rotate), opacity, a blur filter and a clip-path mask. Each is combined with
// the element's own value from CSS or its inline style, so a centred element
// (translate: -50% 0) or one faded by its author stays where and how it was,
// and at rest the author's inline values are put back rather than cleared.

export interface State {
  /** px */
  x: number;
  y: number;
  /** percent of the element's own height, added to y (the mask effect's lines) */
  yp: number;
  scale: number;
  /** degrees */
  rotate: number;
  opacity: number;
  /** px */
  blur: number;
  /** percent of the element hidden from the bottom */
  clip: number;
}

export const identity = (): State => ({ x: 0, y: 0, yp: 0, scale: 1, rotate: 0, opacity: 1, blur: 0, clip: 0 });

export const mix = (a: State, b: State, k: number): State => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  yp: a.yp + (b.yp - a.yp) * k,
  scale: a.scale + (b.scale - a.scale) * k,
  rotate: a.rotate + (b.rotate - a.rotate) * k,
  opacity: a.opacity + (b.opacity - a.opacity) * k,
  blur: Math.max(0, a.blur + (b.blur - a.blur) * k),
  clip: a.clip + (b.clip - a.clip) * k,
});

/** two motions on one element at once: moves add, scales and opacities multiply */
export const combine = (a: State, b: State): State => ({
  x: a.x + b.x,
  y: a.y + b.y,
  yp: a.yp + b.yp,
  scale: a.scale * b.scale,
  rotate: a.rotate + b.rotate,
  opacity: a.opacity * b.opacity,
  blur: a.blur + b.blur,
  clip: Math.max(a.clip, b.clip),
});

/** what the author wrote on the element, inline, before any motion touched it */
export interface Inline {
  translate: string;
  scale: string;
  rotate: string;
  opacity: string;
  filter: string;
  clipPath: string;
}

/** the element's own look, which motion is added to */
export interface Base {
  t: string[];
  s: number[];
  /** degrees; NaN for a 3D rotation of the author's, which motion leaves alone */
  rot: number;
  opacity: number;
  filter: string;
  inline: Inline;
}

export const BLANK: Inline = { translate: '', scale: '', rotate: '', opacity: '', filter: '', clipPath: '' };
/** an element of Scrollwork's own making (split text): nothing of the author's to keep */
export const NONE: Base = { t: [], s: [], rot: 0, opacity: 1, filter: '', inline: BLANK };

/**
 * On the element itself: the author's inline values (`__scrollwork`), and
 * what Scrollwork last wrote (`__scrollworkPaint`). A property whose inline
 * value no longer matches what was written was changed by the page since,
 * and that is the author's value from then on.
 */
type Held = HTMLElement & { __scrollwork?: Inline; __scrollworkPaint?: Inline; __scrollworkHolds?: number };
const KEYS = ['translate', 'scale', 'rotate', 'opacity', 'filter', 'clipPath'] as const;
const current = (el: HTMLElement): Inline => ({ translate: el.style.translate, scale: el.style.scale, rotate: el.style.rotate, opacity: el.style.opacity, filter: el.style.filter, clipPath: el.style.clipPath });

export const putInline = (el: HTMLElement, v: Inline) => {
  el.style.translate = v.translate;
  el.style.scale = v.scale;
  el.style.rotate = v.rotate;
  el.style.opacity = v.opacity;
  el.style.filter = v.filter;
  el.style.clipPath = v.clipPath;
};
/** write, and remember what was written (as the browser keeps it) */
const write = (el: HTMLElement, v: Inline) => {
  putInline(el, v);
  (el as Held).__scrollworkPaint = current(el);
};

/** an angle as degrees; NaN for anything that is not a plain angle (a rotation about another axis) */
export const degrees = (v: string) => {
  const m = /^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(v.trim());
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === 'rad' ? (n * 180) / Math.PI : m[2] === 'turn' ? n * 360 : m[2] === 'grad' ? n * 0.9 : n;
};

/**
 * The author's look, read before anything is painted. The inline values are
 * kept on the element itself, so a second motion on it (or a second start
 * before a stop) still finds the author's values, not the last frame's.
 */
export function readBase(el: HTMLElement): Base {
  const held = el as Held;
  const now = current(el);
  let inline: Inline;
  if (!held.__scrollwork) inline = now;
  else {
    // kept from before, except where the page has written since
    inline = { ...held.__scrollwork };
    const painted = held.__scrollworkPaint;
    for (const k of KEYS) if (!painted || now[k] !== painted[k]) inline[k] = now[k];
  }
  held.__scrollwork = inline;
  hold(el);
  write(el, inline);
  const win = el.ownerDocument.defaultView || window;
  const cs = win.getComputedStyle(el);
  const tr = cs.translate && cs.translate !== 'none' ? cs.translate.split(' ') : [];
  const sc = cs.scale && cs.scale !== 'none' ? cs.scale.split(' ').map(parseFloat) : [];
  const ro = cs.rotate && cs.rotate !== 'none' ? degrees(cs.rotate) : 0;
  const op = parseFloat(cs.opacity);
  return { t: tr, s: sc, rot: ro, opacity: Number.isFinite(op) ? op : 1, filter: cs.filter && cs.filter !== 'none' ? cs.filter : '', inline };
}

/**
 * How many motions are active on an element. The saved author values are
 * kept while any is (and after an animation has finished, since its last
 * frame is still painted and the next motion must find the author's values,
 * not those). They are forgotten when the last active one lets go.
 */
export function hold(el: HTMLElement) {
  const held = el as Held;
  held.__scrollworkHolds = (held.__scrollworkHolds || 0) + 1;
}
/** An animation reached its end: it stops holding the element, and leaves its last frame painted. */
export function letGo(el: HTMLElement) {
  const held = el as Held;
  held.__scrollworkHolds = Math.max(0, (held.__scrollworkHolds || 0) - 1);
}
/**
 * A motion is done with the element (stop, cancel): the author's inline values
 * as that motion read them come back, exactly, whatever other motions have
 * done. `holding` is whether it still held the element (a finished animation
 * has let go already).
 */
export function release(el: HTMLElement, inline: Inline, holding = true) {
  const held = el as Held;
  write(el, inline);
  if (holding) held.__scrollworkHolds = Math.max(0, (held.__scrollworkHolds || 0) - 1);
  if (!held.__scrollworkHolds) {
    delete held.__scrollwork;
    delete held.__scrollworkPaint;
    delete held.__scrollworkHolds;
  }
}

/** Paint a state, added to the element's own look. */
export function paint(el: HTMLElement, s: State, b: Base) {
  if (s.x || s.y || s.yp) {
    const y = s.y + 'px' + (s.yp ? ' + ' + s.yp + '%' : '');
    const tx = b.t[0] ? 'calc(' + b.t[0] + ' + ' + s.x + 'px)' : s.x + 'px';
    const ty = b.t[1] ? 'calc(' + b.t[1] + ' + ' + y + ')' : s.yp ? 'calc(' + y + ')' : y;
    el.style.translate = tx + ' ' + ty + (b.t[2] ? ' ' + b.t[2] : '');
  } else el.style.translate = b.inline.translate;
  if (s.scale !== 1) {
    const sx = (b.s[0] ?? 1) * s.scale;
    const sy = (b.s[1] ?? b.s[0] ?? 1) * s.scale;
    el.style.scale = sx + ' ' + sy + (b.s[2] !== undefined ? ' ' + b.s[2] : '');
  } else el.style.scale = b.inline.scale;
  el.style.rotate = s.rotate && !Number.isNaN(b.rot) ? b.rot + s.rotate + 'deg' : b.inline.rotate;
  el.style.opacity = s.opacity < 0.999 ? String(Math.max(0, b.opacity * s.opacity)) : b.inline.opacity;
  el.style.filter = s.blur > 0.01 ? 'blur(' + s.blur + 'px)' + (b.filter ? ' ' + b.filter : '') : b.inline.filter;
  el.style.clipPath = s.clip > 0.01 ? 'inset(0 0 ' + s.clip + '% 0)' : b.inline.clipPath;
  (el as Held).__scrollworkPaint = current(el);
}
