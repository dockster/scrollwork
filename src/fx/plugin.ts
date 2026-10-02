// The plugin: given to start() or auto() as `plugins: [fx]`, it reads each
// item's `fx` list, puts a surface on the root and draws at the end of every
// frame the engine draws.

import { readFx } from './spec.js';
import { createSurface } from './surface.js';
import type { Plugin } from '../types.js';

export const fx: Plugin = {
  name: 'fx',
  mount(ctx) {
    const items = ctx.items.filter((i) => i.item.fx && i.item.fx.length);
    if (!items.length) return null;
    const notes: string[] = [];
    const note = (m: string) => notes.push(m);
    const surface = createSurface({ win: ctx.win, reduced: ctx.reduced, wake: ctx.wake });
    if (!surface) return null;
    for (const { item, el } of items) {
      const list = readFx(item.fx, note, `items "${item.id}"`);
      if (list.length) surface.add(el, list);
    }
    if (notes.length && typeof console !== 'undefined') console.warn('[scrollwork/fx]:\n  ' + notes.join('\n  '));
    return {
      frame: (read, now, dt) => surface.draw(now, dt, read),
      stop: () => surface.stop(),
    };
  },
};
