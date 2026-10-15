// follow(): an element travels along an SVG path, turning with it if asked.
//
//   animate(follow('.plane', '#route', { rotate: true }), { progress: 1 }, { duration: 3 });
//   scroll(animate(follow('.dot', '#curve'), { progress: [0, 1] }, { autoplay: false }), { target: '.story' });
//
// The path's shape is drawn on screen as the SVG scales it. By default the
// element moves by the path's shape from where it is; `align` puts its centre
// on the path itself.

import { ownOf, offset, one, type Own } from './util.js';

export interface FollowOptions {
  /** the element's centre on the path itself, rather than the path's shape from where the element is */
  align?: boolean;
  /** turn with the path: the element's right points along it; a number of degrees is added on top */
  rotate?: boolean | number;
  /** where along the path progress 0 and 1 are, 0 to 1 */
  start?: number;
  end?: number;
}

export function follow(target: string | Element, path: string | Element, options: FollowOptions = {}): { progress: number } {
  const el = one(target as string | Element);
  const p = (typeof path === 'string' ? document.querySelector(path) : path) as SVGGeometryElement | null;
  const s = options.start ?? 0;
  const e = options.end ?? 1;
  let k = 0;
  let own: Own | null = null;
  /** a point along the path, on screen */
  const at = (len: number) => {
    const q = p!.getPointAtLength(len);
    const m = p!.getScreenCTM();
    return m ? new DOMPoint(q.x, q.y).matrixTransform(m) : new DOMPoint(q.x, q.y);
  };
  const paint = () => {
    if (!el || !p || typeof p.getTotalLength !== 'function') return;
    if (!own) own = ownOf(el);
    const total = p.getTotalLength();
    const len = total * Math.min(1, Math.max(0, s + (e - s) * k));
    const here = at(len);
    let x: number;
    let y: number;
    if (options.align) {
      // the element's centre at rest: where it is now, less the offset written
      offset(el, own, 0, 0);
      const r = el.getBoundingClientRect();
      x = here.x - (r.left + r.width / 2);
      y = here.y - (r.top + r.height / 2);
    } else {
      const from = at(total * s);
      x = here.x - from.x;
      y = here.y - from.y;
    }
    let r = 0;
    if (options.rotate !== undefined && options.rotate !== false) {
      const a = at(Math.max(0, len - 0.5));
      const b = at(Math.min(total, len + 0.5));
      r = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + (typeof options.rotate === 'number' ? options.rotate : 0);
    }
    offset(el, own, x, y, r);
  };
  return {
    get progress() {
      return k;
    },
    set progress(v: number) {
      k = v;
      paint();
    },
  };
}
