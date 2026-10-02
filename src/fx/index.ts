// scrollwork/fx: WebGL effects on the elements Scrollwork moves. Opt in with
//   import { fx } from 'scrollwork/fx';  auto(document.body, { plugins: [fx] })
// and `"fx": [{"type": "glitch"}]` on an element. Without WebGL2, or under
// reduced motion, the page shows its pictures as they are.

export { fx } from './plugin.js';
export { createSurface, type Surface, type SurfaceOptions, type Host } from './surface.js';
export { readFx, readOneFx, FX_DEFAULTS, rgbaOf } from './spec.js';
export type { Fx, FxType, FxOn, GlitchFx, DitherFx } from './types.js';

declare const __SCROLLWORK_VERSION__: string;
export const version: string = typeof __SCROLLWORK_VERSION__ === 'string' ? __SCROLLWORK_VERSION__ : 'dev';
