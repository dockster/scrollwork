// sideways(): a section whose content scrolls sideways while the page scrolls
// down. The section stays on screen (sticky) for as long as its track takes
// to pass, and the track moves left with the scroll.
//
//   <section class="work"><div class="track"> panels side by side </div></section>
//   const s = sideways('.work', { smooth: 0.3, snap: 'panels' });
//   s.watch('.panel h2', animate('.panel h2', { opacity: [0, 1] }, { autoplay: false }), { range: 'in' });
//
// The section gets the height that scrolling takes; the track is made sticky.
// Keyboard focus on something inside scrolls the page to show it. stop() puts
// everything back.

import { scroll, type Controls } from '../index.js';
import { els, one, type Targets } from './util.js';

export interface SidewaysOptions {
  /** the moving row: a selector inside the section, or the section's first child */
  track?: string | Element;
  /** seconds the track takes to catch up with the scroll */
  smooth?: number;
  /** rest on each of the track's children ('panels'), every share of the way (0.25), or a list */
  snap?: 'panels' | number | number[];
  onUpdate?: (progress: number) => void;
}
export interface Sideways {
  /** 0 to 1 */
  readonly progress: number;
  /** px the track has moved */
  readonly offset: number;
  /** follow an element inside the track across the screen, sideways: its passage, 0 to 1, to a function or an animation */
  watch(target: Targets, handler: ((p: number) => void) | Controls, options?: { range?: 'through' | 'in' | 'out' }): () => void;
  /** measure again (the section's contents changed) */
  refresh(): void;
  stop(): void;
}

/** A passage across a view `vw` wide by something at `left`, `w` wide, as scroll()'s ranges measure it. */
export function across(range: 'through' | 'in' | 'out', left: number, w: number, vw: number): number {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  if (range === 'in') return c((vw - left) / Math.max(1, vw / 2 + w / 2));
  if (range === 'out') return c((vw / 2 - w / 2 - left) / Math.max(1, vw / 2 + w / 2));
  return c((vw - left) / Math.max(1, vw + w));
}

export function sideways(section: Targets, options: SidewaysOptions = {}): Sideways {
  const sec = one(section);
  const track = (options.track ? (typeof options.track === 'string' ? sec?.querySelector(options.track) : options.track) : sec?.firstElementChild) as HTMLElement | null;
  if (!sec || !track) return { progress: 0, offset: 0, watch: () => () => {}, refresh: () => {}, stop: () => {} };
  const before = { h: sec.style.height, oa: sec.style.overflowAnchor, ox: sec.style.overflowX, pos: track.style.position, top: track.style.top, tr: track.style.translate };
  /** px the track travels; where it starts (its start against the section's left) and how far down the section it sits */
  let distance = 0;
  let from = 0;
  let down = 0;
  let p = 0;
  let stopScroll = () => {};
  const watchers = new Set<() => void>();

  const paint = () => {
    track.style.translate = distance || from ? from - p * distance + 'px 0' : before.tr;
    watchers.forEach((w) => w());
  };
  /**
   * Measured with the track at rest and not stuck: wherever the section's
   * layout puts it (centred, padded), it starts with its left edge on the
   * section's and ends with its right edge on it.
   */
  const measure = () => {
    // the section's height stays: changing it here would move the page (scroll anchoring)
    track.style.translate = '';
    track.style.position = before.pos;
    const cs = getComputedStyle(sec);
    const n = (v: string) => parseFloat(v) || 0;
    const sr = sec.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    const inner = sec.clientWidth - n(cs.paddingLeft) - n(cs.paddingRight);
    const left = tr.left - (sr.left + n(cs.borderLeftWidth) + n(cs.paddingLeft));
    distance = Math.max(0, tr.width - inner);
    from = -left;
    const contentTop = sr.top + n(cs.borderTopWidth) + n(cs.paddingTop);
    down = tr.top - sr.top;
    let h = tr.bottom - contentTop + distance;
    if (cs.boxSizing === 'border-box') h += n(cs.paddingTop) + n(cs.paddingBottom) + n(cs.borderTopWidth) + n(cs.borderBottomWidth);
    if (sec.style.height !== h + 'px') sec.style.height = h + 'px';
    track.style.position = 'sticky';
    track.style.top = '0px';
    // the scroll that moves it: from the track reaching the top for as far as it travels
    stopScroll();
    stopScroll = scroll(
      (v) => {
        p = v;
        paint();
        options.onUpdate?.(v);
      },
      { target: sec, start: 'top+=' + down + ' top', end: '+=' + distance, smooth: options.smooth, snap: snapPoints() }
    );
    paint();
  };
  const snapPoints = (): number[] | number | undefined => {
    if (options.snap !== 'panels') return options.snap;
    if (!distance) return undefined;
    const base = track.getBoundingClientRect().left;
    return Array.from(track.children).map((c) => Math.min(1, Math.max(0, ((c as HTMLElement).getBoundingClientRect().left - base) / distance)));
  };
  sec.style.overflowX = 'clip';
  // the page is not held still around it by the browser while it is measured
  sec.style.overflowAnchor = 'none';
  measure();

  // keyboard focus inside: scroll the page to where the focused thing is on screen
  const focus = (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    if (!distance || !track.contains(t)) return;
    const r = t.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    // where the focused thing sits along the track, and the progress that centres it
    const along = r.left - tr.left;
    const at = Math.min(1, Math.max(0, (along + r.width / 2 - sec.clientWidth / 2) / distance));
    window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY + down + at * distance, behavior: 'auto' });
  };
  sec.addEventListener('focusin', focus);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  ro?.observe(track);
  window.addEventListener('resize', measure);

  return {
    get progress() {
      return p;
    },
    get offset() {
      return p * distance;
    },
    watch(target, handler, o = {}) {
      const list = els(target);
      const range = o.range ?? 'through';
      const run = () => {
        const el = list[0];
        if (!el) return;
        const r = el.getBoundingClientRect();
        const v = across(range, r.left - sec.getBoundingClientRect().left, r.width, sec.clientWidth);
        if (typeof handler === 'function') handler(v);
        else handler.seek(v);
      };
      if (typeof handler !== 'function') handler.pause();
      watchers.add(run);
      run();
      return () => watchers.delete(run);
    },
    refresh: measure,
    stop() {
      stopScroll();
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      sec.removeEventListener('focusin', focus);
      watchers.clear();
      sec.style.height = before.h;
      sec.style.overflowX = before.ox;
      sec.style.overflowAnchor = before.oa;
      track.style.position = before.pos;
      track.style.top = before.top;
      track.style.translate = before.tr;
    },
  };
}
