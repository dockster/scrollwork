// Rollovers: a control's hover effect (types.ts RolloverMotion), drawn with
// CSS transitions so it reverses from wherever it is when the pointer leaves
// halfway. Three effects:
//
// - roll: the label's letters move up (or down) one after another, out of a
//   window one line tall, as a copy of the label behind them moves in; on
//   leave they come back the other way, the last letter first.
// - wipe: a colour grows across the element from a side (or the centre) as
//   a background layer above its own background, while its words take
//   another colour.
// - scramble: each letter flickers through random characters and lands on
//   its own (after Codrops' Line Text Hover Animations, MIT); it can also play
//   as the text comes into view.
//
// The control is the nearest link or button around the element (or the
// element named by `trigger`): the pointer anywhere on it plays it, and so
// does the keyboard's visible focus. A touch screen's tap does not (it would
// stay "hovered"). Under reduced motion the letters never move and a wipe's
// colours change at once. Everything goes back as it was on stop.

import { CURVES } from './easing.js';
import { SR_ONLY } from './style.js';
import type { RolloverMotion } from './types.js';

export interface RolloverContext {
  /** whether the reader asks for less motion, now */
  reduced(): boolean;
  /** listen, until the engine stops */
  on(el: EventTarget, type: string, fn: (ev: Event) => void): void;
  /** undo, when the engine stops */
  restore(fn: () => void): void;
  /** an element by the id the spec names it with */
  find(id: string): HTMLElement | null;
}

/** a named curve as a CSS timing function: its bezier; a drawn one (elastic, bounce) eases out, as hover feedback should */
const cssEase = (name: string) => {
  const p = (CURVES as Record<string, readonly number[]>)[name];
  return name === 'linear' ? 'linear' : p ? `cubic-bezier(${p.join(', ')})` : 'ease-out';
};

/** what counts as the control around an element */
const CONTROL = 'a[href], button, [role="button"], [role="link"], [data-sw-control]';

/** The element whose hover plays the effect. */
function controlOf(el: HTMLElement, r: RolloverMotion, ctx: RolloverContext): HTMLElement {
  if (r.trigger) {
    const t = ctx.find(r.trigger);
    if (t) return t;
  }
  return (el.closest(CONTROL) as HTMLElement | null) || el;
}

/** hovered by a pointer that can hover, or focused from the keyboard: `play(true)`; left: `play(false)` */
function listen(control: HTMLElement, ctx: RolloverContext, play: (on: boolean) => void) {
  let pointer = false;
  let focus = false;
  const set = () => play(pointer || focus);
  ctx.on(control, 'pointerenter', (ev) => {
    if ((ev as PointerEvent).pointerType === 'touch') return;
    pointer = true;
    set();
  });
  ctx.on(control, 'pointerleave', () => {
    pointer = false;
    set();
  });
  ctx.on(control, 'focusin', () => {
    // :focus-visible is Safari 15.4 and Firefox 85: before that, any focus shows it
    let visible = true;
    try {
      visible = !!control.querySelector(':focus-visible') || control.matches(':focus-visible');
    } catch {
      /* an older browser: the selector is unknown */
    }
    focus = visible;
    set();
  });
  ctx.on(control, 'focusout', (ev) => {
    if (control.contains((ev as FocusEvent).relatedTarget as Node | null)) return;
    focus = false;
    set();
  });
}

// ── roll ────────────────────────────────────────────────────────────────────

function roll(el: HTMLElement, r: RolloverMotion, ctx: RolloverContext) {
  const doc = el.ownerDocument;
  const said = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!said) return;
  // the element's own children are set aside untouched, and come back as they were on stop;
  // what shows meanwhile is built from copies of them
  const kids = Array.from(el.childNodes);
  const label = doc.createElement('span');
  label.className = 'sw-roll-label';
  label.style.cssText = 'display:block';
  for (const k of kids) label.appendChild(k.cloneNode(true));
  for (const k of kids) el.removeChild(k);
  // every letter its own box, so each can move on its own
  const letters = (holder: HTMLElement) => {
    const walker = doc.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    const out: HTMLElement[] = [];
    for (const t of texts) {
      const frag = doc.createDocumentFragment();
      for (const ch of Array.from(t.textContent || '')) {
        if (/\s/.test(ch)) {
          frag.appendChild(doc.createTextNode(ch));
          continue;
        }
        const c = doc.createElement('span');
        c.className = 'sw-roll-char';
        c.style.display = 'inline-block';
        c.textContent = ch;
        frag.appendChild(c);
        out.push(c);
      }
      t.parentNode!.replaceChild(frag, t);
    }
    return out;
  };
  // a window one line tall: the label in it, its copy just outside, above or below
  const win = doc.createElement('span');
  win.className = 'sw-roll';
  win.setAttribute('aria-hidden', 'true');
  win.style.cssText = 'position:relative;display:inline-block;vertical-align:top;white-space:nowrap;overflow:hidden;max-width:100%';
  // clip where it exists (Safari 16, Firefox 81); hidden before that, which clips the same
  win.style.overflow = 'clip';
  const copy = label.cloneNode(true) as HTMLElement;
  copy.className = 'sw-roll-copy';
  const down = r.direction === 'down';
  copy.style.cssText = `display:block;position:absolute;left:0;width:100%;${down ? 'bottom:100%' : 'top:100%'}`;
  win.append(label, copy);
  // the words once, whole, for a screen reader: the letters are hidden from it
  const read = doc.createElement('span');
  read.className = 'sw-roll-said';
  read.textContent = said;
  read.style.cssText = SR_ONLY;
  el.append(win, read);
  const chars = [...letters(label), ...letters(copy)];
  const n = chars.length / 2;
  const move = down ? '100%' : '-100%';
  const ease = cssEase(r.ease);
  const play = (on: boolean) => {
    const still = ctx.reduced();
    chars.forEach((c, i) => {
      const k = i % n;
      // on the way back the last letter goes first, as a timeline played in reverse
      const delay = (on ? k : n - 1 - k) * r.stagger;
      c.style.transition = still ? 'none' : `transform ${r.duration}s ${ease} ${delay}s`;
      c.style.transform = on && !still ? `translateY(${move})` : '';
    });
  };
  listen(controlOf(el, r, ctx), ctx, play);
  ctx.restore(() => {
    win.remove();
    read.remove();
    for (const k of kids) el.appendChild(k);
  });
}

// ── wipe ────────────────────────────────────────────────────────────────────

function wipe(el: HTMLElement, r: RolloverMotion, ctx: RolloverContext) {
  if (!r.color) return;
  const win = el.ownerDocument.defaultView;
  const cs = win ? win.getComputedStyle(el) : null;
  const had = { image: el.style.backgroundImage, size: el.style.backgroundSize, position: el.style.backgroundPosition, repeat: el.style.backgroundRepeat, transition: el.style.transition };
  // the colour is a background layer above the element's own, which stays under it
  const own = cs && cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
  const list = (mine: string, theirs: string | undefined) => (own ? `${mine}, ${theirs}` : mine);
  const across = r.direction === 'up' || r.direction === 'down' ? false : true;
  const from = r.direction === 'right' ? 'left center' : r.direction === 'left' ? 'right center' : r.direction === 'up' ? 'center bottom' : r.direction === 'down' ? 'center top' : 'center center';
  const rest = across ? '0% 100%' : '100% 0%';
  el.style.backgroundImage = list(`linear-gradient(${r.color}, ${r.color})`, own);
  el.style.backgroundRepeat = list('no-repeat', cs?.backgroundRepeat);
  el.style.backgroundPosition = list(from, cs?.backgroundPosition);
  el.style.backgroundSize = list(rest, cs?.backgroundSize);
  // The words take `ink` through a class and a variable, from one rule that wins over inline colour:
  // the engine writes the element's inline colour as it paints (style.ts), and would undo it. The rule
  // reaches every text and icon inside (currentColor), as a hover colour should.
  const doc = el.ownerDocument;
  if (r.ink && !doc.getElementById('sw-rollover-style')) {
    const st = doc.createElement('style');
    st.id = 'sw-rollover-style';
    st.textContent = '.sw-ink, .sw-ink * { color: var(--sw-ink) !important; }';
    doc.head.appendChild(st);
  }
  const ease = cssEase(r.ease);
  // the element's own transitions are kept (a fill that fades on hover), the wipe's added after them
  const base = cs && cs.transition && cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0) ? `${cs.transition}, ` : '';
  // what is inside fades its colour with the wipe's: read when it plays, so the letters of a roll set up
  // after this wipe are reached too; each one's own transition comes back on stop
  const touched = new Map<HTMLElement, string>();
  if (r.ink) el.style.setProperty('--sw-ink', r.ink);
  const play = (on: boolean) => {
    const t = ctx.reduced() ? '0s' : `${r.duration}s`;
    el.style.transition = `${base}background-size ${t} ${ease}${r.ink ? `, color ${t} ${ease}` : ''}`;
    const sizes = el.style.backgroundSize.split(',');
    sizes[0] = on ? '100% 100%' : rest;
    el.style.backgroundSize = sizes.join(',');
    if (!r.ink) return;
    (Array.from(el.querySelectorAll('*')) as HTMLElement[]).forEach((i) => {
      if (!touched.has(i)) touched.set(i, i.style.transition);
      i.style.transition = `color ${t} ${ease}`;
    });
    el.classList.toggle('sw-ink', on);
  };
  listen(controlOf(el, r, ctx), ctx, play);
  ctx.restore(() => {
    el.style.backgroundImage = had.image;
    el.style.backgroundSize = had.size;
    el.style.backgroundPosition = had.position;
    el.style.backgroundRepeat = had.repeat;
    el.style.transition = had.transition;
    el.classList.remove('sw-ink');
    el.style.removeProperty('--sw-ink');
    touched.forEach((had, i) => (i.style.transition = had));
  });
}

// ── scramble ────────────────────────────────────────────────────────────────

/** the characters a scramble draws from when the spec names none (Codrops' Line Text Hover Animations) */
export const GLYPHS = 'abcdefghijklmnopqrstuvwxyz!@#$%^&*-_+=;:<>,';

/**
 * What one letter shows `k` (0 to 1) of the way through its scramble: a
 * random character for each of `turns` steps, then its own. `seed` picks the
 * character, so a step shows the same one for as long as it lasts.
 */
export function scrambleAt(own: string, k: number, turns: number, glyphs: string, seed: number): { ch: string; step: number } {
  if (k <= 0 || k >= 1 || !glyphs) return { ch: own, step: -1 };
  const step = Math.min(turns - 1, Math.floor(k * turns));
  const list = Array.from(glyphs);
  const v = Math.sin((seed + 1) * 12.9898 + (step + 1) * 78.233) * 43758.5453;
  return { ch: list[Math.floor((v - Math.floor(v)) * list.length)], step };
}

/**
 * scramble: each letter flickers through random characters, one after
 * another, and lands on its own; on hover (and keyboard focus), as the text
 * comes into view (it is hidden until then, and types itself in), or both.
 * A block of the text's colour may sit on each letter as it starts, and the
 * random characters may take colours of their own. Each letter keeps its
 * width while it flickers, so the line never shifts.
 */
function scramble(el: HTMLElement, r: RolloverMotion, ctx: RolloverContext) {
  const doc = el.ownerDocument;
  const said = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!said) return;
  const kids = Array.from(el.childNodes);
  const holder = doc.createElement('span');
  holder.className = 'sw-scramble';
  holder.setAttribute('aria-hidden', 'true');
  for (const k of kids) holder.appendChild(k.cloneNode(true));
  for (const k of kids) el.removeChild(k);
  // every letter its own box
  const walker = doc.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const chars: Array<{ el: HTMLElement; own: string }> = [];
  for (const t of texts) {
    const frag = doc.createDocumentFragment();
    for (const ch of Array.from(t.textContent || '')) {
      if (/\s/.test(ch)) {
        frag.appendChild(doc.createTextNode(ch));
        continue;
      }
      const c = doc.createElement('span');
      c.className = 'sw-scramble-char';
      c.style.display = 'inline-block';
      c.textContent = ch;
      frag.appendChild(c);
      chars.push({ el: c, own: ch });
    }
    t.parentNode!.replaceChild(frag, t);
  }
  const read = doc.createElement('span');
  read.className = 'sw-scramble-said';
  read.textContent = said;
  read.style.cssText = SR_ONLY;
  el.append(holder, read);

  const on = r.on || 'hover';
  const turns = Math.max(1, r.turns || 3);
  const glyphs = r.glyphs || GLYPHS;
  const colors = r.colors && r.colors.length ? r.colors : null;
  const win = doc.defaultView || window;
  let frame = 0;
  let t0 = 0;
  let shown = on === 'hover';
  // as it comes into view it types itself in: hidden until then
  const hide = (v: boolean) => chars.forEach((c) => (c.el.style.opacity = v ? '0' : ''));
  if (!shown && !ctx.reduced()) hide(true);
  else shown = true;
  const settle = () => {
    chars.forEach((c) => {
      c.el.textContent = c.own;
      c.el.style.color = '';
      c.el.style.backgroundColor = '';
      c.el.style.width = '';
      c.el.style.opacity = '';
    });
  };
  const tick = (now: number) => {
    frame = 0;
    const t = (now - t0) / 1000;
    let busy = false;
    chars.forEach((c, i) => {
      const k = (t - i * r.stagger) / Math.max(0.01, r.duration);
      if (k < 1) busy = true;
      if (k <= 0) return;
      c.el.style.opacity = '';
      const s = scrambleAt(c.own, k, turns, glyphs, i);
      if (c.el.textContent !== s.ch) c.el.textContent = s.ch;
      c.el.style.color = s.step >= 0 && colors ? colors[Math.floor(((Math.sin((i + 1) * 3.1 + s.step * 7.7) + 1) / 2) * colors.length) % colors.length] : '';
      c.el.style.backgroundColor = s.step === 0 && r.cursor ? 'currentColor' : '';
    });
    if (busy) frame = win.requestAnimationFrame(tick);
    else settle();
  };
  const play = () => {
    if (ctx.reduced()) {
      settle();
      return;
    }
    win.cancelAnimationFrame(frame);
    // each letter keeps its own width while another character stands in it
    chars.forEach((c) => {
      c.el.textContent = c.own;
      c.el.style.width = '';
    });
    chars.forEach((c) => (c.el.style.width = c.el.getBoundingClientRect().width + 'px'));
    if (!shown) {
      shown = true;
      hide(true);
    }
    t0 = win.performance.now();
    frame = win.requestAnimationFrame(tick);
  };
  if (on !== 'appear') listen(controlOf(el, r, ctx), ctx, (over) => over && shown && play());
  if (on !== 'hover') {
    if (typeof win.IntersectionObserver === 'function') {
      // once a sixth of it is on screen, a little way up from the bottom
      const io = new win.IntersectionObserver(
        (es) => {
          if (!es.some((e) => e.isIntersecting)) return;
          io.disconnect();
          play();
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0.15 }
      );
      io.observe(el);
      ctx.restore(() => io.disconnect());
    } else play();
  }
  ctx.restore(() => {
    win.cancelAnimationFrame(frame);
    holder.remove();
    read.remove();
    for (const k of kids) el.appendChild(k);
  });
}

/** Play an element's rollover on its control's hover and focus, until the engine stops. */
export function mountRollover(el: HTMLElement, r: RolloverMotion, ctx: RolloverContext) {
  if (r.effect === 'roll') roll(el, r, ctx);
  else if (r.effect === 'scramble') scramble(el, r, ctx);
  else wipe(el, r, ctx);
}
