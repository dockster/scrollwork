// inView(): run something when an element comes into view, and optionally
// when it leaves.
//
//   inView('.card', (el) => {
//     const a = animate(el, { y: [30, 0], opacity: [0, 1] });
//     return () => a.reverse();   // on leaving
//   });

import { resolveTargets, type Targets } from './animate.js';

export interface InViewOptions {
  /** the scrolling box to watch within; the viewport when unset */
  root?: Element | null;
  /** grows or shrinks the view, as CSS margins: "0px 0px -20% 0px" starts a little later */
  margin?: string;
  /** how much must be visible: 'some' (any of it), 'all', or 0 to 1 */
  amount?: 'some' | 'all' | number;
  /** once it has come into view, stop watching it */
  once?: boolean;
}

export type OnLeave = () => void;

/** Returns a function that stops watching. Without IntersectionObserver, every target counts as in view at once. */
export function inView(targets: Targets, onEnter: (el: HTMLElement, entry?: IntersectionObserverEntry) => void | OnLeave, options: InViewOptions = {}): () => void {
  const els = resolveTargets(targets);
  const leaving = new Map<Element, OnLeave>();
  if (typeof IntersectionObserver === 'undefined') {
    for (const el of els) onEnter(el);
    return () => {};
  }
  const amount = options.amount === 'all' ? 1 : options.amount === 'some' || options.amount === undefined ? 0 : Math.min(1, Math.max(0, options.amount));
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (leaving.has(el)) continue;
          const back = onEnter(el, entry);
          if (options.once) io.unobserve(el);
          else leaving.set(el, typeof back === 'function' ? back : () => {});
        } else {
          const back = leaving.get(el);
          if (back) {
            leaving.delete(el);
            back();
          }
        }
      }
    },
    { root: options.root ?? null, rootMargin: options.margin ?? '0px', threshold: amount }
  );
  for (const el of els) io.observe(el);
  return () => {
    io.disconnect();
    leaving.clear();
  };
}
