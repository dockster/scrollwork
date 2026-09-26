// The engine: appear, scroll-linked motion, parallax, pin, interactions and
// smooth scrolling, played on real DOM from a spec (types.ts). One function
// with its state in a closure; start() in index.ts reads and checks the spec
// first, then hands it here.
//
// Motion uses the individual transform properties (translate, scale, rotate),
// added to whatever the element already has from CSS or its inline style,
// plus opacity, a blur filter and a clip-path mask. stop() gives every element
// back exactly as it was.

import { bezier, clamp01, EASES } from './easing.js';
import { combine, identity, mix, NONE, paint, putInline, BLANK, readBase, release, type Base, type State } from './style.js';
import type { AppearMotion, Interaction, InteractionAnimation, MotionControl, MotionItem, MotionKey, MotionOptions, MotionSpec, MotionState } from './types.js';

export function startEngine(spec: MotionSpec, opts: MotionOptions): MotionControl {
  type Unit = { el: HTMLElement; index: number };
  type Entry = {
    item: MotionItem;
    el: HTMLElement;
    units: Unit[];
    base: Base;
    /** split by lines: the words are regrouped when the width changes */
    lines: boolean;
    top: number;
    height: number;
    played: boolean;
    t0: number;
    pinOffset: number;
    /** Change to, one per interaction: how far along (p) and where it is heading (to) */
    changes: Array<{ ix: Interaction; p: number; to: number; timer: number }>;
  };

  const root = opts.root;
  const scroller = opts.scroller;
  const win = root.ownerDocument.defaultView || window;
  // read live where the page asked for it: a reader who turns reduced motion on mid-visit gets it at once
  let reduced = opts.reduced;
  const find = (id: string | undefined) => (id ? (root.querySelector('[' + opts.attr + '="' + id.replace(/["\\]/g, '') + '"]') as HTMLElement | null) : null);

  const asState = (m: MotionState): State => ({ ...identity(), ...m, yp: 0, clip: 0 });
  /** a timeline of stops at 0-100%: the state `k` (0-1) of the way along, each step eased on its own */
  const timeline = (first: State, keys: MotionKey[] | undefined, last: State, k: number, ease: (t: number) => number): State => {
    const stops = [{ at: 0, s: first }, ...(keys || []).slice().sort((a, b) => a.at - b.at).map((key) => ({ at: key.at, s: asState(key.state) })), { at: 100, s: last }];
    const at = Math.min(100, Math.max(0, k * 100));
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (at <= b.at || i === stops.length - 2) return mix(a.s, b.s, ease(clamp01((at - a.at) / Math.max(0.0001, b.at - a.at))));
    }
    return last;
  };

  /** where an appear starts from, for the whole block or for each unit */
  const appearFrom = (a: AppearMotion, unit: boolean): State => {
    const s = identity();
    if (a.effect === 'fade') s.opacity = 0;
    else if (a.effect === 'slide-up') {
      s.y = unit ? 24 : 40;
      s.opacity = 0;
    } else if (a.effect === 'blur') {
      s.blur = 16;
      s.opacity = 0;
    } else if (a.effect === 'scale') {
      s.scale = 0.85;
      s.opacity = 0;
    } else if (a.effect === 'mask') {
      if (unit) s.yp = 110;
      else {
        s.clip = 100;
        s.y = 24;
      }
    } else {
      s.x = a.from.x;
      s.y = a.from.y;
      s.scale = a.from.scale;
      s.rotate = a.from.rotate;
      s.opacity = a.from.opacity;
      s.blur = a.from.blur;
    }
    return s;
  };

  // ── text split: every text node becomes spans, and goes back on stop ──
  const restores: Array<() => void> = [];
  const split = (el: HTMLElement, by: 'lines' | 'words' | 'chars', mask: boolean): Unit[] => {
    const doc = el.ownerDocument;
    // A screen reader reads the pieces one by one ("H, e, l, l, o"). The
    // pieces are hidden from it and the words are said once, whole, by a copy
    // only it reads. Not when the text holds a link or a button: hiding their
    // words would leave them nameless, so the pieces stay readable there.
    const said = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const focusable = !!el.querySelector('a[href], button, input, select, textarea, [tabindex]');
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    const units: Unit[] = [];
    const inline = (cls: string) => {
      const s = doc.createElement('span');
      s.className = cls;
      s.style.display = 'inline-block';
      return s;
    };
    for (const t of texts) {
      const parts = (t.textContent || '').split(/(\s+)/);
      const made: Node[] = [];
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          made.push(doc.createTextNode(part));
          continue;
        }
        const word = inline('ux-motion-word');
        word.style.whiteSpace = 'nowrap';
        if (!focusable) word.setAttribute('aria-hidden', 'true');
        let holder: HTMLElement = word;
        if (mask) {
          // clip where it exists (Safari 16, Firefox 81); hidden before that, which masks the same
          word.style.overflow = 'hidden';
          word.style.overflow = 'clip';
          word.style.verticalAlign = 'top';
          word.style.paddingBottom = '0.12em';
          word.style.marginBottom = '-0.12em';
          holder = inline('ux-motion-inner');
          word.appendChild(holder);
        }
        if (by === 'chars') {
          for (const ch of Array.from(part)) {
            const c = inline('ux-motion-char');
            c.textContent = ch;
            holder.appendChild(c);
            units.push({ el: c, index: units.length });
          }
        } else {
          holder.textContent = part;
          units.push({ el: holder, index: units.length });
        }
        made.push(word);
      }
      const parent = t.parentNode;
      if (!parent) continue;
      for (const m of made) parent.insertBefore(m, t);
      parent.removeChild(t);
      restores.push(() => {
        const first = made.find((m) => m.parentNode === parent);
        if (first) parent.insertBefore(t, first);
        for (const m of made) if (m.parentNode) m.parentNode.removeChild(m);
      });
    }
    if (!focusable && said && units.length) {
      const copy = doc.createElement('span');
      copy.className = 'ux-motion-said';
      copy.textContent = said;
      // visually hidden, the usual way: there for assistive technology only
      copy.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
      el.appendChild(copy);
      restores.push(() => copy.remove());
    }
    if (by === 'lines') group(units);
    return units;
  };
  /**
   * Words on the same line move together: their line is their place in the
   * stagger. Read from layout (offsetTop), not from the screen, so a word
   * already moving is grouped where it sits, and done again on every resize,
   * where the lines wrap differently.
   */
  const group = (units: Unit[]) => {
    let line = -1;
    let lastTop = -Infinity;
    for (const u of units) {
      const holder = (u.el.parentElement && u.el.parentElement.className === 'ux-motion-word' ? u.el.parentElement : u.el) as HTMLElement;
      const top = holder.offsetTop;
      if (top > lastTop + 2) {
        line += 1;
        lastTop = top;
      }
      u.index = line;
    }
  };

  // ── layout: offsetTop ignores transforms, so motion never feeds back into it ──
  const stopAt = opts.seekOnly ? root : scroller;
  const pageTop = (el: HTMLElement) => {
    let t = 0;
    for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) t += e.offsetTop;
    return t;
  };
  /** elements pinned with position: sticky; their offsetTop includes the hold, their place in the track is 0 */
  const stuck = new Set<HTMLElement>();
  const layoutTop = (el: HTMLElement) => {
    let t = 0;
    let e: HTMLElement | null = el;
    while (e && e !== stopAt) {
      t += stuck.has(e) ? 0 : e.offsetTop;
      e = e.offsetParent as HTMLElement | null;
    }
    // A scroller that is not positioned is never anyone's offsetParent: the
    // walk ran past it to the page. Measured from its padding edge instead.
    if (!e && stopAt) t -= pageTop(stopAt) + stopAt.clientTop;
    return t;
  };

  // A page can hide what is about to appear until now, so it does not flash
  // visible while the script loads (README, "Avoid a flash"). The class goes
  // before anything is measured: an element read while hidden would take 0 as
  // its own opacity. The first frame paints the start states before the
  // browser paints again, so nothing shows in between.
  if (!opts.seekOnly) root.ownerDocument.documentElement.classList.remove('sw-pending');
  const entries: Entry[] = [];
  const byEl = new Map<HTMLElement, Entry>();
  for (const item of spec.items) {
    const el = find(item.id);
    if (!el) continue;
    const base = readBase(el);
    const a = item.appear;
    const splitBy = a && item.text && opts.split && a.split !== 'none' ? a.split : null;
    const entry: Entry = {
      item,
      el,
      units: splitBy ? split(el, splitBy, a!.effect === 'mask') : [],
      base,
      lines: splitBy === 'lines',
      top: 0,
      height: 0,
      played: false,
      t0: 0,
      pinOffset: 0,
      changes: (item.interactions || []).filter((ix) => ix.action.type === 'change').map((ix) => ({ ix, p: 0, to: 0, timer: 0 })),
    };
    entries.push(entry);
    byEl.set(el, entry);
  }
  const triggerOf = (e: Entry, id: string | undefined) => find(id) || e.el;
  /**
   * Triggers that are not motion layers themselves, measured with everyone
   * else in measure(), never inside a frame: a read between two style writes
   * would make the browser lay the page out again, every frame.
   */
  const others = new Map<HTMLElement, { top: number; height: number }>();
  for (const e of entries) {
    for (const id of [e.item.appear && e.item.appear.trigger, e.item.scroll && e.item.scroll.trigger]) {
      const t = find(id || undefined);
      if (t && !byEl.has(t)) others.set(t, { top: 0, height: 0 });
    }
  }


  // ── pin with position: sticky, where the page allows it ──
  // iOS scrolls on a thread of its own and runs the page's code after it, so
  // a pin moved by script trails a fling by up to ~185px (tests/ios); a sticky
  // element is moved by the browser, with the scroll. It needs a containing
  // block as tall as itself plus the hold, so the element goes into a track of
  // that height, and the track takes its place: in the flow, a footprint of
  // its size and margins holds it; positioned absolutely, the track sits where
  // it was. The pin must not change how the page looks, so the layout and the
  // computed style of the element, everything in it and everything beside it
  // are read before and after, and anything different puts the element back
  // and pins it with the transform, as before.
  interface StickyPin {
    e: Entry;
    track: HTMLElement;
    /** in the flow: the box that keeps the element's place; positioned: null */
    foot: HTMLElement | null;
    /** the element's inline values for what the pin writes, to put back */
    saved: Array<[string, string, string]>;
    /** its style attribute as written, to write back word for word when it means the same again */
    attr: string | null;
  }
  const stickies = new Map<Entry, StickyPin>();
  /** watches the page for changes (set up with the loop); declared here, since measure() reads it first */
  let mo: MutationObserver | null = null;
  const PIN_PROPS = ['position', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'pointer-events'];
  /** what the pin writes on the element, left out when comparing its style */
  const PINNED_OWN = /^(position|top|right|bottom|left|inset|margin|pointer-events)/;
  const FLOWING = /^(block|flow-root|flex|grid|list-item|table)$/;
  const BLOCK_PARENT = /^(block|flow-root|list-item)$/;
  const doc = root.ownerDocument;
  const cssOf = (n: Element) => win.getComputedStyle(n);
  const styleKey = (n: Element, own: boolean) => {
    const cs = cssOf(n);
    let out = '';
    for (let i = 0; i < cs.length; i++) {
      const k = cs[i];
      if (own && PINNED_OWN.test(k)) continue;
      out += k + ':' + cs.getPropertyValue(k) + ';';
    }
    return out;
  };
  const box = (n: Element) => {
    const r = n.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2).join(',');
  };
  /** how the page looks around a pinned element: compared before and after it goes into its track */
  const look = (el: HTMLElement, parent: HTMLElement, host: Element | null) => {
    const scrolling = scroller || doc.documentElement;
    const parts = [box(el), box(parent), `${scrolling.scrollWidth}x${scrolling.scrollHeight}`];
    const inside = el.getElementsByTagName('*');
    parts.push(styleKey(el, true));
    for (let i = 0; i < inside.length; i++) parts.push(box(inside[i]), styleKey(inside[i], false));
    for (const c of Array.from(parent.children)) {
      if (c === el || c === host) continue;
      parts.push(box(c), styleKey(c, false));
    }
    return parts.join('|');
  };
  /**
   * A box that scrolls (overflow hidden, auto or scroll) would be what sticky
   * holds against. overflow: clip scrolls nothing: sticky still holds against
   * the scroller, and the box clips the element as it did before.
   */
  const SCROLLS = /^(hidden|auto|scroll)$/;
  const scrolls = (n: Element) => {
    const cs = cssOf(n);
    return SCROLLS.test(cs.overflowX) || SCROLLS.test(cs.overflowY);
  };
  const canStick = (e: Entry) => {
    const el = e.el;
    if (!opts.sticky || opts.seekOnly || !e.item.pin || !el.parentElement) return false;
    const cs = cssOf(el);
    const abs = cs.position === 'absolute';
    if (!abs && cs.position !== 'static' && cs.position !== 'relative') return false;
    if (!FLOWING.test(cs.display) || cs.float !== 'none') return false;
    if (!abs && !BLOCK_PARENT.test(cssOf(el.parentElement).display)) return false;
    // a frame, a video or a sound would reload or stop when moved into the track
    if (el.querySelector('iframe, video, audio, object, embed')) return false;
    // the comparison reads every computed style inside: kept to what a pinned block usually holds
    if (el.getElementsByTagName('*').length > 300) return false;
    // a pinned ancestor moves it by transform, which sticky knows nothing of
    for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) {
      const pe = byEl.get(p);
      if (pe && pe.item.pin) return false;
    }
    // sticky holds against the nearest box that scrolls: it must be the scroller
    const html = doc.documentElement;
    for (let p: HTMLElement | null = el.parentElement; p && p !== scroller; p = p.parentElement) {
      if (p === html) return !scroller;
      // the body's overflow belongs to the page when the root's is visible
      if (p === doc.body && !scrolls(html)) continue;
      if (scrolls(p)) return false;
    }
    return true;
  };
  const putBack = (el: HTMLElement, saved: StickyPin['saved']) => {
    for (const [k, v, pr] of saved) {
      if (v) el.style.setProperty(k, v, pr);
      else el.style.removeProperty(k);
    }
  };
  /** the track's size and place, from the element as the page lays it out */
  const fit = (p: StickyPin) => {
    const el = p.e.el;
    const hold = p.e.item.pin!.distance;
    const ts = p.track.style;
    if (p.foot) {
      // the page's own margins, read with the pin's zeros taken off for a moment
      putBack(el, p.saved.filter(([k]) => k === 'margin-top' || k === 'margin-bottom'));
      const cs = cssOf(el);
      const mt = cs.marginTop;
      const mb = cs.marginBottom;
      el.style.marginTop = '0px';
      el.style.marginBottom = '0px';
      const fs = p.foot.style;
      fs.marginTop = mt;
      fs.marginBottom = mb;
      fs.height = el.offsetHeight + 'px';
      ts.height = el.offsetHeight + hold + 'px';
      return;
    }
    // positioned: laid out by its own rules again, against its containing block, which the track fills for a moment
    ts.left = ts.top = ts.right = ts.bottom = '0px';
    ts.width = ts.height = 'auto';
    putBack(el, p.saved);
    el.style.position = 'absolute';
    const x = el.offsetLeft;
    const y = el.offsetTop;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    ts.right = ts.bottom = 'auto';
    ts.left = x + 'px';
    ts.top = y + 'px';
    ts.width = w + 'px';
    ts.height = h + hold + 'px';
    const es = el.style;
    es.position = 'sticky';
    es.top = stickyTop(p.e);
    es.left = es.right = es.bottom = 'auto';
    es.margin = '0px';
  };
  /**
   * Sticky's top counts from inside the scroller's padding; the transform's
   * from its edge (layoutTop measures from the padding edge), so the padding
   * comes off to hold at the same place.
   */
  const stickyTop = (e: Entry) => e.item.pin!.top - (scroller ? parseFloat(cssOf(scroller).paddingTop) || 0 : 0) + 'px';
  const unstick = (p: StickyPin) => {
    const el = p.e.el;
    const host = p.foot || p.track;
    if (host.parentNode) host.parentNode.insertBefore(el, host);
    host.remove();
    putBack(el, p.saved);
    // the same declarations can be written differently (margin as one or as four):
    // when what is there now means what was there, what was there comes back as it was
    const now = el.getAttribute('style');
    if (now !== p.attr) {
      const was = doc.createElement('div');
      was.setAttribute('style', p.attr || '');
      if (was.style.cssText === el.style.cssText) {
        if (p.attr === null) el.removeAttribute('style');
        else el.setAttribute('style', p.attr);
      }
    }
    stuck.delete(el);
  };
  const stick = (e: Entry): StickyPin | null => {
    const el = e.el;
    const parent = el.parentElement!;
    const cs = cssOf(el);
    const abs = cs.position === 'absolute';
    const attr = el.getAttribute('style');
    const before = look(el, parent, null);
    const saved = PIN_PROPS.map((k): [string, string, string] => [k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]);
    const pointer = cs.pointerEvents;
    const track = doc.createElement('div');
    track.className = 'ux-motion-track';
    const ts = track.style;
    ts.position = 'absolute';
    ts.margin = ts.padding = '0px';
    ts.border = '0';
    // the tall track must not catch the clicks meant for what is under it
    ts.pointerEvents = 'none';
    let foot: HTMLElement | null = null;
    if (abs) {
      if (cs.zIndex !== 'auto') ts.zIndex = cs.zIndex;
      ts.left = el.offsetLeft + 'px';
      ts.top = el.offsetTop + 'px';
      ts.width = el.offsetWidth + 'px';
      ts.height = el.offsetHeight + e.item.pin!.distance + 'px';
      parent.insertBefore(track, el);
    } else {
      foot = doc.createElement('div');
      foot.className = 'ux-motion-pin';
      const fs = foot.style;
      fs.display = 'block';
      fs.position = 'relative';
      fs.padding = '0px';
      fs.border = '0';
      fs.clear = cs.clear;
      fs.marginTop = cs.marginTop;
      fs.marginBottom = cs.marginBottom;
      fs.height = el.offsetHeight + 'px';
      ts.left = ts.right = ts.top = '0px';
      ts.height = el.offsetHeight + e.item.pin!.distance + 'px';
      parent.insertBefore(foot, el);
      foot.appendChild(track);
    }
    track.appendChild(el);
    const es = el.style;
    es.position = 'relative';
    es.top = es.left = es.right = es.bottom = 'auto';
    if (abs) es.margin = '0px';
    else {
      es.marginTop = '0px';
      es.marginBottom = '0px';
    }
    es.pointerEvents = pointer;
    const p: StickyPin = { e, track, foot, saved, attr };
    // at rest, in the track, it must look exactly as it did
    if (look(el, parent, foot || track) !== before) {
      unstick(p);
      return null;
    }
    es.position = 'sticky';
    es.top = stickyTop(e);
    stuck.add(el);
    return p;
  };
  let pinned = false;
  /**
   * Pins go into their tracks once; after that the page's rules may have moved
   * or resized them (a media query), so the track is fitted to them again. The
   * element is never moved in the page again: moving it would restart its CSS
   * animations and take the focus from a field being typed in.
   */
  const placePins = () => {
    // fitting moves the element for a moment: the browser must not scroll to follow it
    const scrolling = scroller || doc.documentElement;
    const anchor = scrolling.style.overflowAnchor;
    scrolling.style.overflowAnchor = 'none';
    if (!pinned) {
      pinned = true;
      for (const e of entries) {
        if (!canStick(e)) continue;
        const p = stick(e);
        if (p) stickies.set(e, p);
      }
    } else {
      for (const p of stickies.values()) fit(p);
    }
    scrolling.style.overflowAnchor = anchor;
  };

  /** something changed that the next frame must draw (a hover, a click, a re-measure) */
  let dirty = true;
  let moving = true;
  /** the loop sleeps when nothing moves; this starts it again (set once the loop exists) */
  let wake: () => void = () => {};
  /** something changed that the next frame must draw: note it, and make sure there is a next frame */
  const touch = () => {
    dirty = true;
    wake();
  };
  let lastY = -1;
  let lastVh = -1;
  const measure = () => {
    placePins();
    for (const e of entries) {
      e.top = layoutTop(e.el);
      e.height = e.el.offsetHeight;
      // the width changed, so the lines wrap somewhere else
      if (e.lines && e.units.length) group(e.units);
    }
    for (const [el, m] of others) {
      m.top = layoutTop(el);
      m.height = el.offsetHeight;
    }
    // the pins' own writes are not changes to the page
    if (mo) mo.takeRecords();
    touch();
  };
  measure();
  /**
   * The page changed under the motion (a block collapsed, a class shown or
   * hidden, an image loaded): measure again at the start of the next frame,
   * before anything is written, so the read never forces a layout of its own.
   */
  let stale = false;
  const remeasure = () => {
    if (stopped) return;
    stale = true;
    touch();
  };

  /** pin offsets of the layer's pinned ancestors: they carry it along */
  const carried = (el: HTMLElement) => {
    let off = 0;
    let p = el.parentElement;
    while (p && p !== root) {
      const pe = byEl.get(p);
      if (pe) off += pe.pinOffset;
      p = p.parentElement;
    }
    return off;
  };
  const topOf = (el: HTMLElement) => {
    const e = byEl.get(el);
    const o = others.get(el);
    return (e ? e.top : o ? o.top : layoutTop(el)) + carried(el) + (e ? e.pinOffset : 0);
  };
  const heightOf = (el: HTMLElement) => {
    const e = byEl.get(el);
    const o = others.get(el);
    return e ? e.height : o ? o.height : el.offsetHeight;
  };

  const curveOf = (a: InteractionAnimation) => (a.curve === 'custom' ? (a.bezier ? bezier(a.bezier[0], a.bezier[1], a.bezier[2], a.bezier[3]) : EASES.out) : EASES[a.curve] || EASES.out);

  /** hover and click move toward their target at a rate set by their duration */
  const approach = (p: number, to: number, duration: number, dt: number) => {
    if (reduced || duration <= 0) return to;
    const step = dt / (duration * 1000);
    return p < to ? Math.min(to, p + step) : Math.max(to, p - step);
  };

  /**
   * Paints every layer for this scroll position and moment, and says whether
   * anything is still in flight, so the loop can rest (PRODUCT-CANVAS §13.27
   * item 24): a preview sitting still used to do this work sixty times a second.
   */
  const render = (y: number, vh: number, now: number | null, dt = 0): boolean => {
    let moving = false;
    // pins first: everything inside or triggered by a pinned layer reads its offset
    for (const e of entries) {
      const p = e.item.pin;
      e.pinOffset = p ? Math.min(p.distance, Math.max(0, y - (e.top + carried(e.el) - p.top))) : 0;
    }
    for (const e of entries) {
      const it = e.item;
      let own = identity();
      // a sticky pin is held by the browser; the offset is still counted for what it carries and triggers
      if (!stuck.has(e.el)) own.y += e.pinOffset;

      const sc = it.scroll;
      if (sc && !reduced) {
        if (sc.speed) {
          const centre = topOf(e.el) - e.pinOffset + e.height / 2 - y;
          own.y += (-sc.speed / 100) * (centre - vh / 2);
        }
        const trig = triggerOf(e, sc.trigger);
        const te = byEl.get(trig);
        let start: number;
        let end: number;
        if (te && te.item.pin && trig !== e.el) {
          start = te.top + carried(trig) - te.item.pin.top;
          end = start + Math.max(1, te.item.pin.distance);
        } else {
          const T = topOf(trig) - (trig === e.el ? e.pinOffset : 0);
          const H = heightOf(trig);
          start = sc.range === 'out' ? T + H / 2 - vh / 2 : T - vh;
          end = sc.range === 'in' ? T + H / 2 - vh / 2 : T + H;
        }
        const k = clamp01((y - start) / Math.max(1, end - start));
        own = combine(own, timeline(asState(sc.from), sc.keys, asState(sc.to), k, EASES.linear));
      }

      const a = it.appear;
      if (a) {
        const trig = triggerOf(e, a.trigger);
        const screenTop = topOf(trig) - y;
        const arrived = screenTop < vh * (1 - a.offset / 100);
        if (arrived) {
          if (!e.played) {
            e.played = true;
            e.t0 = now ?? 0;
          }
        } else if (now === null || (a.replay && screenTop > vh)) {
          // seeking shows the state at that position; a replay resets once the trigger is back below the screen
          e.played = false;
        }
        const ease = EASES[a.ease] || EASES.out;
        const progress = (i: number) => {
          if (reduced) return 1;
          if (!e.played) return 0;
          if (now === null) return 1;
          return clamp01((now - e.t0 - (a.delay + i * a.stagger) * 1000) / Math.max(1, a.duration * 1000));
        };
        if (e.units.length) {
          const from = appearFrom(a, true);
          for (const u of e.units) {
            const k = progress(u.index);
            // playing, not merely waiting for its turn on screen
            if (e.played && k < 1) moving = true;
            paint(u.el, timeline(from, a.keys, identity(), k, ease), NONE);
          }
        } else {
          const k = progress(0);
          if (e.played && k < 1) moving = true;
          own = combine(own, timeline(appearFrom(a, false), a.keys, identity(), k, ease));
        }
      }
      if (now !== null) {
        for (const c of e.changes) {
          const anim = c.ix.animation;
          c.p = approach(c.p, c.to, anim.kind === 'instant' ? 0 : anim.duration, dt);
          if (c.p !== c.to) moving = true;
          if (c.p > 0 && c.ix.action.type === 'change') own = combine(own, mix(identity(), asState(c.ix.action.state), curveOf(anim)(c.p)));
        }
      }
      paint(e.el, own, e.base);
    }
    return moving;
  };

  // ── the live loop, with optional smooth scrolling ──
  let raf = 0;
  let stopped = false;
  const scrollY = () => (scroller ? scroller.scrollTop : win.scrollY);
  const viewH = () => (scroller ? scroller.clientHeight : win.innerHeight);
  const maxY = () => (scroller ? scroller.scrollHeight - scroller.clientHeight : root.ownerDocument.documentElement.scrollHeight - win.innerHeight);
  const scrollTo = (v: number) => (scroller ? (scroller.scrollTop = v) : win.scrollTo(0, v));
  // wired whenever the page asks for it; reduced motion (read live) turns the glide off
  const smooth = spec.smooth && !opts.seekOnly;
  let target = scrollY();
  let current = target;
  let gliding = false;

  /**
   * A scrollable box between the pointer and the page (a modal, a code block,
   * a carousel) that can still move this way: the wheel is its, not ours.
   */
  const inner = (from: EventTarget | null, dx: number, dy: number) => {
    const stopAtEl = scroller || root.ownerDocument.documentElement;
    let el = from instanceof win.Element ? (from as HTMLElement) : null;
    while (el && el !== stopAtEl && el !== root.ownerDocument.body) {
      const cs = win.getComputedStyle(el);
      if (dy && /(auto|scroll|overlay)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      }
      if (dx && /(auto|scroll|overlay)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      }
      el = el.parentElement;
    }
    return false;
  };
  const onWheel = (ev: WheelEvent) => {
    if (ev.ctrlKey || reduced) return;
    const sideways = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
    if (inner(ev.target, sideways ? ev.deltaX : 0, sideways ? 0 : ev.deltaY)) return;
    // A sideways swipe is the browser's (a sideways scroll, or back). A
    // presentation that must not be swiped away asks to hold it
    // (holdSideways), unless something under the pointer scrolls sideways.
    if (sideways) {
      if (opts.holdSideways) ev.preventDefault();
      return;
    }
    ev.preventDefault();
    const step = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * viewH() : ev.deltaY;
    if (!gliding) target = current = scrollY();
    target = Math.min(maxY(), Math.max(0, target + step));
    gliding = true;
    wake();
  };
  const onScroll = () => {
    // the keyboard, the scrollbar or a touch moved the page: follow it
    if (gliding && Math.abs(scrollY() - current) > 2) gliding = false;
  };

  // Scroll to: a tween of the scroll position along the interaction's curve
  let tween: { from: number; to: number; t0: number; ms: number; ease: (t: number) => number } | null = null;

  let last = 0;
  const tick = (now: number) => {
    if (stopped) return;
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (stale) {
      stale = false;
      measure();
    }
    if (tween) {
      if (!tween.t0) tween.t0 = now;
      const k = clamp01((now - tween.t0) / Math.max(1, tween.ms));
      current = target = tween.from + (tween.to - tween.from) * tween.ease(k);
      scrollTo(current);
      if (k >= 1) tween = null;
    } else if (smooth && gliding && !reduced) {
      // the same glide at 60 and 120 Hz: 12% of the way per 60th of a second, whatever the frame length
      current += (target - current) * (1 - Math.pow(0.88, dt / (1000 / 60)));
      if (Math.abs(target - current) < 0.5) {
        current = target;
        gliding = false;
      }
      scrollTo(current);
    }
    const y = scrollY();
    const vh = viewH();
    // nothing in flight, nothing scrolled, nothing touched: skip the pass
    if (dirty || moving || tween || gliding || y !== lastY || vh !== lastVh) {
      moving = render(y, vh, now, dt);
      dirty = false;
      lastY = y;
      lastVh = vh;
    }
    // Nothing in flight: the loop rests until a scroll, a resize or an
    // interaction wakes it, instead of waking sixty times a second for nothing.
    if (moving || tween || gliding || dirty) raf = win.requestAnimationFrame(tick);
    else raf = 0;
  };
  wake = () => {
    if (raf || stopped || opts.seekOnly) return;
    last = 0;
    raf = win.requestAnimationFrame(tick);
  };

  let ro: ResizeObserver | null = null;
  const surface: EventTarget = scroller || win;
  const unlisten: Array<() => void> = [];
  const on = (el: EventTarget, type: string, fn: (ev: Event) => void, capture = false) => {
    el.addEventListener(type, fn, capture);
    unlisten.push(() => el.removeEventListener(type, fn, capture));
  };
  const timers = new Set<number>();
  const later = (seconds: number, fn: () => void) => {
    // reduced motion takes away movement, not time: a "after 2 s" still waits
    if (seconds <= 0) {
      fn();
      return 0;
    }
    const t = win.setTimeout(() => {
      timers.delete(t);
      fn();
    }, seconds * 1000);
    timers.add(t);
    return t;
  };
  const cancel = (t: number) => {
    if (!t) return;
    win.clearTimeout(t);
    timers.delete(t);
  };

  if (!opts.seekOnly) {
    /** the pointer on a text field: a key there is typing, not a trigger */
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    /** a focused control that Enter or Space already does something with */
    const acts = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && typeof el.matches === 'function' && el.matches('a[href], button, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="radio"]');
    };
    /**
     * Wire a trigger (Figma's, trigger.png): `start` when it happens, `end`
     * when a "while" trigger (hovering, pressing) stops. A delay trigger
     * starts once, now; the interaction's own delay is applied by the caller.
     */
    const bind = (el: HTMLElement, ix: Interaction, start: () => void, end?: () => void) => {
      switch (ix.trigger) {
        case 'click': {
          const act = ix.action.type;
          const goes = act === 'navigate' || act === 'url' || act === 'back' || act === 'overlay' || act === 'swap' || act === 'close';
          on(el, 'click', (ev) => {
            // a real link that goes somewhere: the runtime takes it (with its
            // delay), and the address stays for anyone without script
            if (goes && el.tagName === 'A' && el.hasAttribute('href')) ev.preventDefault();
            start();
          });
          // a layer exported as a control without being one (role="button" or
          // "link" on a <div>): Enter presses it, and Space presses a button
          const role = el.getAttribute('role');
          if ((role === 'button' || role === 'link') && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
            on(el, 'keydown', (ev) => {
              const k = (ev as KeyboardEvent).key;
              if (k === 'Enter' || (k === ' ' && role === 'button')) {
                ev.preventDefault();
                start();
              }
            });
          }
          break;
        }
        case 'drag': {
          // a press that moves past a few pixels is a drag: it starts once per press
          let from: { x: number; y: number } | null = null;
          on(el, 'pointerdown', (ev) => {
            const p = ev as PointerEvent;
            from = { x: p.clientX, y: p.clientY };
          });
          on(win, 'pointermove', (ev) => {
            const p = ev as PointerEvent;
            if (!from || Math.hypot(p.clientX - from.x, p.clientY - from.y) < 8) return;
            from = null;
            start();
          });
          on(win, 'pointerup', () => (from = null));
          break;
        }
        case 'hover':
          on(el, 'pointerenter', start);
          on(el, 'pointerleave', () => end && end());
          // keyboard focus gets the same feedback as the pointer
          on(el, 'focus', () => {
            // :focus-visible is Safari 15.4 and Firefox 85: before that, any focus shows it
            let visible = true;
            try {
              visible = el.matches(':focus-visible');
            } catch {
              /* an older browser: the selector is unknown */
            }
            if (visible) start();
          });
          on(el, 'blur', () => end && end());
          break;
        case 'press':
          on(el, 'pointerdown', start);
          for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'keyup', 'blur']) on(el, t, () => end && end());
          on(el, 'keydown', (ev) => {
            const k = (ev as KeyboardEvent).key;
            if (k === 'Enter' || k === ' ') start();
          });
          break;
        case 'mouseenter':
          on(el, 'pointerenter', start);
          break;
        case 'mouseleave':
          on(el, 'pointerleave', start);
          break;
        case 'mousedown':
          on(el, 'pointerdown', start);
          break;
        case 'mouseup':
          on(el, 'pointerup', start);
          break;
        case 'key': {
          const want = (ix.key || '').toLowerCase();
          if (!want) break;
          on(win, 'keydown', (ev) => {
            const k = ev as KeyboardEvent;
            // a shortcut (with a modifier) is the browser's or the page's, not a trigger
            if (k.repeat || k.metaKey || k.ctrlKey || k.altKey || typing(k.target) || k.key.toLowerCase() !== want) return;
            // Enter and Space belong to a focused control: they press it, and the trigger waits
            if ((want === 'enter' || want === ' ') && acts(k.target)) return;
            k.preventDefault();
            start();
          });
          break;
        }
        case 'delay':
          // from the moment the screen shows
          start();
          break;
      }
    };

    for (const e of entries) {
      const el = e.el;
      for (const c of e.changes) {
        // a "while" trigger holds the change for as long as it lasts; a click or
        // a key flips it back and forth; anything else sets it
        const hold = c.ix.trigger === 'hover' || c.ix.trigger === 'press';
        const flip = c.ix.trigger === 'click' || c.ix.trigger === 'key';
        bind(
          el,
          c.ix,
          () => {
            cancel(c.timer);
            c.timer = later(c.ix.delay, () => {
              c.to = flip ? (c.to ? 0 : 1) : 1;
              touch();
            });
          },
          hold
            ? () => {
                cancel(c.timer);
                c.timer = 0;
                c.to = 0;
                touch();
              }
            : undefined
        );
      }
      for (const ix of e.item.interactions || []) {
        const act = ix.action;
        if (ix.trigger === 'none' || act.type === 'change' || act.type === 'none') continue;
        const hold = ix.trigger === 'hover' || ix.trigger === 'press';
        let timer = 0;
        const run = () => {
          if (act.type === 'navigate') opts.navigate && opts.navigate(act.frameId, ix);
          else if (act.type === 'back') opts.back && opts.back(ix);
          else if (act.type === 'overlay') {
            if (opts.overlay) opts.overlay(act.frameId, ix);
            else if (opts.navigate) opts.navigate(act.frameId, ix);
          } else if (act.type === 'swap') {
            if (opts.swap) opts.swap(act.frameId, ix);
            else if (opts.navigate) opts.navigate(act.frameId, ix);
          } else if (act.type === 'close') {
            if (opts.close) opts.close(ix);
            else if (opts.back) opts.back(ix);
          } else if (act.type === 'url') {
            // only web and mail addresses: the document check refuses anything that runs
            if (!/^(https?:\/\/|mailto:)/i.test(act.url)) return;
            if (act.newTab) win.open(act.url, '_blank', 'noopener,noreferrer');
            else win.location.assign(act.url);
          } else if (act.type === 'scroll') {
            const to = find(act.targetId);
            if (!to) return;
            const y = Math.min(maxY(), Math.max(0, layoutTop(to)));
            const ms = ix.animation.kind === 'instant' || reduced ? 0 : ix.animation.duration * 1000;
            gliding = false;
            if (!ms) {
              target = current = y;
              scrollTo(y);
            } else {
              tween = { from: scrollY(), to: y, t0: 0, ms, ease: curveOf(ix.animation) };
              wake();
            }
          }
        };
        bind(
          el,
          ix,
          () => {
            cancel(timer);
            timer = later(ix.delay, run);
          },
          // an overlay opened while hovering or pressing goes when that stops
          hold && act.type === 'overlay'
            ? () => {
                cancel(timer);
                timer = 0;
                if (opts.close) opts.close({ ...ix, action: { type: 'close' } });
              }
            : undefined
        );
      }
    }
    if (smooth) {
      surface.addEventListener('wheel', onWheel as EventListener, { passive: false });
      surface.addEventListener('scroll', onScroll);
    }
    // what wakes a resting loop: the page moving, the window changing size
    on(surface, 'scroll', touch);
    on(win, 'resize', touch);
    if (opts.followReduced && typeof win.matchMedia === 'function') {
      const mq = win.matchMedia('(prefers-reduced-motion: reduce)');
      const follow = () => {
        reduced = mq.matches;
        if (reduced) {
          gliding = false;
          tween = null;
        }
        touch();
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', follow);
        unlisten.push(() => mq.removeEventListener('change', follow));
      }
    }
    // Sizes: the root, and every moving element and trigger (text rewraps, a
    // media query) — none of which Scrollwork itself changes, since it only
    // moves, scales and fades.
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(remeasure);
      ro.observe(root);
      for (const e of entries) ro.observe(e.el);
      for (const el of others.keys()) ro.observe(el);
    }
    // Positions: something above moved without anything resizing. Scrollwork's
    // own writes (the style of what it moves, and the spans it splits text into)
    // are not changes to the page and are ignored, or it would chase itself.
    if (typeof MutationObserver !== 'undefined') {
      const ours = (n: Node) => {
        const el = n as HTMLElement;
        return byEl.has(el) || (typeof el.className === 'string' && el.className.indexOf('ux-motion-') === 0);
      };
      mo = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'attributes' && r.attributeName === 'style' && ours(r.target)) continue;
          if (r.type === 'childList' && ours(r.target)) continue;
          if (r.type === 'childList' && [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].every(ours)) continue;
          remeasure();
          return;
        }
      });
      mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'src', 'width', 'height'] });
    }
    // an image or a frame finishing loading can push everything below it
    on(root, 'load', remeasure, true);
    if (root.ownerDocument.fonts) root.ownerDocument.fonts.ready.then(remeasure);
    raf = win.requestAnimationFrame(tick);
  }

  return {
    stop() {
      stopped = true;
      for (const t of timers) win.clearTimeout(t);
      timers.clear();
      win.cancelAnimationFrame(raf);
      if (smooth) {
        surface.removeEventListener('wheel', onWheel as EventListener);
        surface.removeEventListener('scroll', onScroll);
      }
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      for (const off of unlisten.splice(0)) off();
      for (const e of entries) {
        // the author's inline values come back, not blanks
        release(e.el, e.base.inline);
        for (const u of e.units) putInline(u.el, BLANK);
      }
      // back where they were in the page, once nothing painted is left on them
      for (const p of stickies.values()) unstick(p);
      stickies.clear();
      for (const r of restores.splice(0).reverse()) r();
    },
    seek(y: number, height: number) {
      measure();
      render(y, height, null);
    },
    replay() {
      touch();
      for (const e of entries) e.played = false;
      target = current = 0;
      gliding = false;
      scrollTo(0);
    },
  };
}
