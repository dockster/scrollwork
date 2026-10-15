// scrollwork/extras: layout transitions (flip), shape morphing (morph),
// motion along a path (follow), dragging with a throw (drag), and a section
// that scrolls sideways while the page scrolls down (sideways). Built on the
// core's animate(), timeline() and scroll(); load the core first.
//
//   import { flip, capture, morph, follow, drag, sideways } from 'scrollwork/extras';

export { capture, flip, type FlipOptions, type FlipState } from './flip.js';
export { morph, shape, sample, lineUp } from './morph.js';
export { follow, type FollowOptions } from './path.js';
export { drag, snapValue, nextSnap, restOf, type Bounds, type DragOptions, type Draggable, type Snap } from './drag.js';
export { sideways, across, type Sideways, type SidewaysOptions } from './sideways.js';

declare const __SCROLLWORK_VERSION__: string;
export const version: string = typeof __SCROLLWORK_VERSION__ === 'string' ? __SCROLLWORK_VERSION__ : 'dev';
