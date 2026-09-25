// Motion from HTML: every element with a `data-scrollwork` attribute holding
// JSON is read, filled in with the defaults and played.
//
//   <h1 data-scrollwork='{"appear": {"effect": "mask", "split": "words"}}'>…</h1>
//   <img data-scrollwork='{"scroll": {"speed": 30}}'>
//   <a data-scrollwork='{"hover": {"scale": 1.05}}'>…</a>
//
// `hover` and `press` are shorthands for a change on that trigger; the full
// `interactions` list is accepted as well.

import { Notes, readAnimation, readItem, state } from './spec.js';
import type { Interaction, MotionControl, MotionItem, MotionOptions, MotionSpec } from './types.js';

type Loose = Record<string, unknown>;

/** Ids handed out on this page, across every auto(): never the same twice. */
let issued = 0;
/** The ids Scrollwork gave (not the author's), and how many running auto()s use each element. */
const ours = new WeakSet<HTMLElement>();
const using = new Map<HTMLElement, number>();

/** Elements that make an element a layout block rather than a run of text. */
const BLOCKS = 'div, p, section, article, header, footer, ul, ol, li, table, figure, img, svg, video, canvas, picture, iframe, h1, h2, h3, h4, h5, h6, input, select, textarea';

export interface AutoOptions extends Partial<Omit<MotionOptions, 'attr' | 'root'>> {
  /** smooth wheel scrolling; defaults to a data-scrollwork-smooth attribute on the root or <html> */
  smooth?: boolean;
}

/** Read every [data-scrollwork] under `root` into a spec. */
export function readPage(root: HTMLElement, warn = true, named: HTMLElement[] = []): MotionSpec {
  const notes = new Notes('data-scrollwork');
  const items: MotionItem[] = [];
  root.querySelectorAll<HTMLElement>('[data-scrollwork]').forEach((el, i) => {
    const label = el.id ? `#${el.id}` : `<${el.tagName.toLowerCase()}> #${i + 1}`;
    let raw: Loose;
    try {
      const parsed = JSON.parse(el.getAttribute('data-scrollwork') || '{}');
      raw = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      notes.add(`${label}: the attribute is not valid JSON (${(err as Error).message})`);
      return;
    }
    // An id of the author's is kept; otherwise one this page has never used, so
    // a second auto() after the page changed (a single-page app, htmx) cannot
    // give two elements the same one.
    let id = el.getAttribute('data-sw-id');
    if (!id) {
      id = 'sw' + issued++;
      el.setAttribute('data-sw-id', id);
      ours.add(el);
    }
    named.push(el);
    using.set(el, (using.get(el) || 0) + 1);
    // Text to split: words whose children are only inline phrasing (<em>, a
    // link), not only bare text. "text": false opts out.
    const text = typeof raw.text === 'boolean' ? raw.text : !el.querySelector(BLOCKS) && !!(el.textContent || '').trim();
    const item = readItem({ ...raw, id, text }, notes, i);
    if (!item) return;
    const extra: Interaction[] = [];
    for (const [trigger, duration] of [['hover', 0.25], ['press', 0.12]] as const) {
      const v = raw[trigger];
      if (!v || typeof v !== 'object') continue;
      const o = v as Loose;
      extra.push({
        id: trigger,
        trigger,
        delay: 0,
        action: { type: 'change', state: state(o.state ?? o, notes, `${label}.${trigger}`) },
        animation: readAnimation(o.animation, notes, `${label}.${trigger}.animation`, duration),
      });
    }
    if (extra.length) item.interactions = [...(item.interactions || []), ...extra];
    items.push(item);
  });
  notes.flush(warn);
  const doc = root.ownerDocument;
  return { version: 1, items, smooth: root.hasAttribute('data-scrollwork-smooth') || doc.documentElement.hasAttribute('data-scrollwork-smooth') };
}

/** Read the page and play it. */
export function autoWith(start: (spec: MotionSpec, opts: MotionOptions) => MotionControl, root: HTMLElement, options: AutoOptions = {}): MotionControl {
  const warn = options.warn !== false;
  const named: HTMLElement[] = [];
  const spec = readPage(root, warn, named);
  if (options.smooth !== undefined) spec.smooth = options.smooth;
  const win = root.ownerDocument.defaultView || window;
  const reduced = options.reduced ?? (typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const control = start(spec, {
    split: true,
    scroller: null,
    followReduced: options.reduced === undefined,
    navigate: (anchor) => {
      if (anchor.charAt(0) === '#') win.location.hash = anchor;
      else win.location.href = anchor;
    },
    back: () => win.history.back(),
    ...options,
    reduced,
    warn,
    attr: 'data-sw-id',
    root,
  });
  return {
    ...control,
    stop() {
      control.stop();
      // Ids Scrollwork gave are taken back once no running auto() uses them
      // (two can overlap, as a page swaps content): the page is as it was.
      for (const el of named) {
        const left = (using.get(el) || 1) - 1;
        if (left > 0) {
          using.set(el, left);
          continue;
        }
        using.delete(el);
        if (ours.has(el)) {
          el.removeAttribute('data-sw-id');
          ours.delete(el);
        }
      }
      named.length = 0;
    },
  };
}
