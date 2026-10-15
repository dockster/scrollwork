// The plain <script> build of the extras: window.ScrollworkExtras, loaded
// after scrollwork.min.js (whose animate(), timeline() and scroll() it uses).

import * as ScrollworkExtras from './index.js';

declare global {
  interface Window {
    ScrollworkExtras: typeof ScrollworkExtras;
  }
}

window.ScrollworkExtras = ScrollworkExtras;
