// The plain <script> build of the effects: window.ScrollworkFx, loaded after
// scrollwork.min.js and handed to it:
//   Scrollwork.auto(document.body, { plugins: [ScrollworkFx.fx] })

import * as ScrollworkFx from './index.js';

declare global {
  interface Window {
    ScrollworkFx: typeof ScrollworkFx;
  }
}

window.ScrollworkFx = ScrollworkFx;
