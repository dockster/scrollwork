// The plain <script> build: window.Scrollwork, and data-auto to play the page
// as soon as it is ready.
//
//   <script src="scrollwork.min.js" data-auto></script>

import * as Scrollwork from './index.js';

declare global {
  interface Window {
    Scrollwork: typeof Scrollwork;
    /** the running page, when started with data-auto */
    scrollwork?: ReturnType<typeof Scrollwork.auto>;
  }
}

window.Scrollwork = Scrollwork;
const script = document.currentScript;
if (script && script.hasAttribute('data-auto')) {
  const run = () => {
    window.scrollwork = Scrollwork.auto();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
