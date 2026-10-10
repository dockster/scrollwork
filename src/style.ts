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
  /** degrees in 3D, around the horizontal and the vertical axis; `pz` the perspective in px, 0 for the default */
  rx: number;
  ry: number;
  pz: number;
  opacity: number;
  /** px */
  blur: number;
  /** percent of the element hidden from the bottom */
  clip: number;
  /** one axis, on top of `scale` */
  sx: number;
  sy: number;
  /** a colour the element is moving to, and how far (0 its own, 1 the colour) */
  fill: Tint | null;
  ink: Tint | null;
  /** a picture to show instead of its own, shown from halfway (k >= 0.5) */
  image: Pic | null;
}
/** red, green, blue 0-255 and alpha 0-1 */
export type Rgba = [number, number, number, number];
export interface Tint {
  c: Rgba;
  k: number;
}
export interface Pic {
  url: string;
  k: number;
}

export const identity = (): State => ({ x: 0, y: 0, yp: 0, scale: 1, rotate: 0, rx: 0, ry: 0, pz: 0, opacity: 1, blur: 0, clip: 0, sx: 1, sy: 1, fill: null, ink: null, image: null });

const mixRgba = (a: Rgba, b: Rgba, k: number): Rgba => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
/** between two tints: the colour too when both have one, and how far along */
const mixTint = (a: Tint | null, b: Tint | null, k: number): Tint | null => {
  if (!a && !b) return null;
  const ka = a ? a.k : 0;
  const kb = b ? b.k : 0;
  const c = a && b ? mixRgba(a.c, b.c, k) : (b || a)!.c;
  return { c, k: ka + (kb - ka) * k };
};
const mixPic = (a: Pic | null, b: Pic | null, k: number): Pic | null => {
  if (!a && !b) return null;
  const ka = a ? a.k : 0;
  const kb = b ? b.k : 0;
  return { url: (k < 0.5 ? a || b : b || a)!.url, k: ka + (kb - ka) * k };
};

export const mix = (a: State, b: State, k: number): State => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  yp: a.yp + (b.yp - a.yp) * k,
  scale: a.scale + (b.scale - a.scale) * k,
  rotate: a.rotate + (b.rotate - a.rotate) * k,
  rx: a.rx + (b.rx - a.rx) * k,
  ry: a.ry + (b.ry - a.ry) * k,
  pz: a.pz && b.pz ? a.pz + (b.pz - a.pz) * k : a.pz || b.pz,
  opacity: a.opacity + (b.opacity - a.opacity) * k,
  blur: Math.max(0, a.blur + (b.blur - a.blur) * k),
  clip: a.clip + (b.clip - a.clip) * k,
  sx: a.sx + (b.sx - a.sx) * k,
  sy: a.sy + (b.sy - a.sy) * k,
  fill: mixTint(a.fill, b.fill, k),
  ink: mixTint(a.ink, b.ink, k),
  image: mixPic(a.image, b.image, k),
});

/** two motions on one element at once: moves add, scales and opacities multiply; of two colours, the one further along shows */
const further = <T extends { k: number }>(a: T | null, b: T | null): T | null => (b && (!a || b.k >= a.k) ? b : a);
export const combine = (a: State, b: State): State => ({
  x: a.x + b.x,
  y: a.y + b.y,
  yp: a.yp + b.yp,
  scale: a.scale * b.scale,
  rotate: a.rotate + b.rotate,
  rx: a.rx + b.rx,
  ry: a.ry + b.ry,
  pz: a.pz || b.pz,
  opacity: a.opacity * b.opacity,
  blur: a.blur + b.blur,
  clip: Math.max(a.clip, b.clip),
  sx: a.sx * b.sx,
  sy: a.sy * b.sy,
  fill: further(a.fill, b.fill),
  ink: further(a.ink, b.ink),
  image: further(a.image, b.image),
});

/** a computed colour (rgb(), rgba()) as numbers; transparent for anything else */
export const rgba = (v: string): Rgba => {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v || '');
  if (!m) return [0, 0, 0, 0];
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), Number.isFinite(a) ? a : 1];
};
const cssRgba = (c: Rgba) => 'rgba(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ', ' + Math.round(c[3] * 1000) / 1000 + ')';
const colours = new Map<string, Rgba>();
/** a colour as written, read the way the browser does (any CSS colour), through a probe element; remembered */
export function parseColour(doc: Document, text: string): Rgba {
  const known = colours.get(text);
  if (known) return known;
  const probe = doc.createElement('span');
  probe.style.color = text;
  const win = doc.defaultView || window;
  (doc.body || doc.documentElement).appendChild(probe);
  const c = rgba(win.getComputedStyle(probe).color);
  probe.remove();
  colours.set(text, c);
  return c;
}

/** what the author wrote on the element, inline, before any motion touched it */
export interface Inline {
  translate: string;
  scale: string;
  rotate: string;
  transform: string;
  opacity: string;
  filter: string;
  clipPath: string;
  backgroundColor: string;
  color: string;
  backgroundImage: string;
  /** an <img>'s src attribute; empty for any other element */
  src: string;
}

/** the element's own look, which motion is added to */
export interface Base {
  t: string[];
  s: number[];
  /** degrees; NaN for a 3D rotation of the author's, which motion leaves alone */
  rot: number;
  opacity: number;
  filter: string;
  /** the element's own background and text colours, for a state that moves to a colour */
  bg: Rgba;
  ink: Rgba;
  inline: Inline;
}

export const BLANK: Inline = { translate: '', scale: '', rotate: '', transform: '', opacity: '', filter: '', clipPath: '', backgroundColor: '', color: '', backgroundImage: '', src: '' };
/** an element of Scrollwork's own making (split text): nothing of the author's to keep */
export const NONE: Base = { t: [], s: [], rot: 0, opacity: 1, filter: '', bg: [0, 0, 0, 0], ink: [0, 0, 0, 1], inline: BLANK };

/**
 * On the element itself: the author's inline values (`__scrollwork`), and
 * what Scrollwork last wrote (`__scrollworkPaint`). A property whose inline
 * value no longer matches what was written was changed by the page since,
 * and that is the author's value from then on.
 */
type Held = HTMLElement & { __scrollwork?: Inline; __scrollworkPaint?: Inline; __scrollworkHolds?: number; __scrollworkBare?: boolean };
const KEYS = ['translate', 'scale', 'rotate', 'transform', 'opacity', 'filter', 'clipPath', 'backgroundColor', 'color', 'backgroundImage', 'src'] as const;
const isImg = (el: HTMLElement): el is HTMLImageElement => el.tagName === 'IMG';
const current = (el: HTMLElement): Inline => ({
  translate: el.style.translate,
  scale: el.style.scale,
  rotate: el.style.rotate,
  transform: el.style.transform,
  opacity: el.style.opacity,
  filter: el.style.filter,
  clipPath: el.style.clipPath,
  backgroundColor: el.style.backgroundColor,
  color: el.style.color,
  backgroundImage: el.style.backgroundImage,
  src: isImg(el) ? el.getAttribute('src') || '' : '',
});

export const putInline = (el: HTMLElement, v: Inline) => {
  el.style.translate = v.translate;
  el.style.scale = v.scale;
  el.style.rotate = v.rotate;
  el.style.transform = v.transform;
  el.style.opacity = v.opacity;
  el.style.filter = v.filter;
  el.style.clipPath = v.clipPath;
  el.style.backgroundColor = v.backgroundColor;
  el.style.color = v.color;
  el.style.backgroundImage = v.backgroundImage;
  if (isImg(el) && (el.getAttribute('src') || '') !== v.src) el.setAttribute('src', v.src);
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
  if (!held.__scrollwork) {
    inline = now;
    // no style attribute before any motion: none after it either, not an empty one
    held.__scrollworkBare = !el.hasAttribute('style');
  } else {
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
  return { t: tr, s: sc, rot: ro, opacity: Number.isFinite(op) ? op : 1, filter: cs.filter && cs.filter !== 'none' ? cs.filter : '', bg: rgba(cs.backgroundColor), ink: rgba(cs.color), inline };
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
  paintInk(el, null);
  if (holding) held.__scrollworkHolds = Math.max(0, (held.__scrollworkHolds || 0) - 1);
  if (!held.__scrollworkHolds) {
    if (held.__scrollworkBare && el.getAttribute('style') === '') el.removeAttribute('style');
    delete held.__scrollwork;
    delete held.__scrollworkPaint;
    delete held.__scrollworkHolds;
    delete held.__scrollworkBare;
  }
}

/**
 * A text colour reaches the words inside the element too: a card whose ink
 * moves to white takes its title and caption along, whatever colour their own
 * CSS gave them. Each descendant's inline colour from before is kept, and put
 * back when the ink is at rest again or the motion lets go.
 */
const INKED = new WeakMap<HTMLElement, Map<HTMLElement, string>>();
function paintInk(el: HTMLElement, value: string | null) {
  let kept = INKED.get(el);
  if (value === null) {
    if (!kept) return;
    kept.forEach((own, d) => (d.style.color = own));
    INKED.delete(el);
    return;
  }
  if (!kept) {
    kept = new Map();
    el.querySelectorAll('*').forEach((d) => kept!.set(d as HTMLElement, (d as HTMLElement).style.color));
    INKED.set(el, kept);
  }
  kept.forEach((_own, d) => (d.style.color = value));
}

/** Paint a state, added to the element's own look. */
export function paint(el: HTMLElement, s: State, b: Base) {
  if (s.x || s.y || s.yp) {
    const y = s.y + 'px' + (s.yp ? ' + ' + s.yp + '%' : '');
    const tx = b.t[0] ? 'calc(' + b.t[0] + ' + ' + s.x + 'px)' : s.x + 'px';
    const ty = b.t[1] ? 'calc(' + b.t[1] + ' + ' + y + ')' : s.yp ? 'calc(' + y + ')' : y;
    el.style.translate = tx + ' ' + ty + (b.t[2] ? ' ' + b.t[2] : '');
  } else el.style.translate = b.inline.translate;
  if (s.scale !== 1 || s.sx !== 1 || s.sy !== 1) {
    const sx = (b.s[0] ?? 1) * s.scale * s.sx;
    const sy = (b.s[1] ?? b.s[0] ?? 1) * s.scale * s.sy;
    el.style.scale = sx + ' ' + sy + (b.s[2] !== undefined ? ' ' + b.s[2] : '');
  } else el.style.scale = b.inline.scale;
  el.style.rotate = s.rotate && !Number.isNaN(b.rot) ? b.rot + s.rotate + 'deg' : b.inline.rotate;
  // 3D: a perspective and the tips, in front of whatever transform the element has of its own
  el.style.transform = s.rx || s.ry ? 'perspective(' + (s.pz || 1000) + 'px) rotateX(' + s.rx + 'deg) rotateY(' + s.ry + 'deg)' + (b.inline.transform ? ' ' + b.inline.transform : '') : b.inline.transform;
  el.style.opacity = s.opacity < 0.999 ? String(Math.max(0, b.opacity * s.opacity)) : b.inline.opacity;
  el.style.filter = s.blur > 0.01 ? 'blur(' + s.blur + 'px)' + (b.filter ? ' ' + b.filter : '') : b.inline.filter;
  el.style.clipPath = s.clip > 0.01 ? 'inset(0 0 ' + s.clip + '% 0)' : b.inline.clipPath;
  // a colour: part of the way from the element's own to the state's
  el.style.backgroundColor = s.fill && s.fill.k > 0.001 ? cssRgba(mixRgba(b.bg, s.fill.c, Math.min(1, s.fill.k))) : b.inline.backgroundColor;
  const ink = s.ink && s.ink.k > 0.001 ? cssRgba(mixRgba(b.ink, s.ink.c, Math.min(1, s.ink.k))) : null;
  el.style.color = ink ?? b.inline.color;
  paintInk(el, ink);
  // a picture: swapped at the halfway point, since a URL has no in-between
  const pic = s.image && s.image.k >= 0.5 ? s.image.url : null;
  if (isImg(el)) {
    const want = pic ?? b.inline.src;
    if ((el.getAttribute('src') || '') !== want) el.setAttribute('src', want);
  } else el.style.backgroundImage = pic ? 'url("' + pic.replace(/["\\]/g, '') + '")' : b.inline.backgroundImage;
  (el as Held).__scrollworkPaint = current(el);
}
