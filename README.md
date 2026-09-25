# Scrollwork

Scroll, appear, pin and interaction motion for the web. Describe it in HTML
with a `data-scrollwork` attribute, or in code with `animate()`, `inView()`
and `scroll()`.

- **About 10 KB gzipped, no dependencies.** One file for a `<script>` tag, or
  an ES module for your bundler, with TypeScript types.
- **Declarative first.** Text that rises line by line, parallax, pinned
  sections and hover states come from data, not code.
- **Leaves your styles alone.** Motion is added to what the element already
  has: a centred element stays centred, and a faded one stays faded.
- **Respects the reader.** It follows `prefers-reduced-motion`, even when the
  setting changes mid-visit. Hover works with keyboard focus too, and split
  text is read whole by screen readers.
- **Rests when nothing moves.** No animation frame runs while the page is
  still.

Scrollwork is the motion engine of [uxdeck](https://uxdeck.app), the design
canvas of [uxspot.io](https://uxspot.io). Designs exported from uxdeck run on it.

## Install

```sh
npm install scrollwork
```

Or from a CDN, as a plain script:

```html
<script src="https://cdn.jsdelivr.net/npm/scrollwork@1/dist/scrollwork.min.js" data-auto></script>
```

Or download `scrollwork.min.js` from the
[latest release](https://github.com/dockster/scrollwork/releases/latest) and
serve it yourself.

## Quick start: HTML

```html
<h1 data-scrollwork='{"appear": {"effect": "mask", "split": "lines"}}'>
  Motion that tells the story
</h1>

<img src="hero.jpg" alt="" data-scrollwork='{"scroll": {"speed": 30}}'>

<a href="#start" data-scrollwork='{"hover": {"scale": 1.04}, "press": {"scale": 0.96}}'>Start</a>

<script src="scrollwork.min.js" data-auto></script>
```

With `data-auto`, Scrollwork plays the page once it has loaded, and keeps the
control on `window.scrollwork` (`replay()`, `stop()`). Without it, call
`Scrollwork.auto()` yourself. Put `data-scrollwork-smooth` on `<html>` to make
wheel scrolling smooth.

### Avoid a flash

The page paints before any script runs, so an element that is about to appear
can show for a moment first, then vanish and fade in. To prevent this, put
these two lines in `<head>`:

```html
<style>html.sw-pending [data-scrollwork*='"appear"'] { opacity: 0 }</style>
<script>document.documentElement.classList.add('sw-pending'); setTimeout(() => document.documentElement.classList.remove('sw-pending'), 3000);</script>
```

Only the elements that will appear are hidden. Scrollwork removes the class
once their start states are painted. If the script never loads, the timeout
shows them anyway, so content is never lost.

## Quick start: code

```js
import { animate, inView, scroll, auto } from 'scrollwork';

// animate: values are relative to the element's own look
const intro = animate('.card', { y: [40, 0], opacity: [0, 1] }, { duration: 0.6, stagger: 0.08, ease: 'expo' });
await intro.finished;

// inView: run something when an element arrives, and undo it when it leaves
inView('.stat', (el) => {
  const a = animate(el, { scale: [0.9, 1], opacity: [0, 1] });
  return () => a.reverse();
});

// scroll: progress through the page, or through one element's passage
scroll((p) => progressBar.style.scale = `${p} 1`);
scroll(animate('.hero img', { y: [0, 120] }, { autoplay: false }), { target: '.hero' });

// the declarative engine, for everything with a data-scrollwork attribute
auto();
```

## The attribute

`data-scrollwork` holds JSON, and every field is optional. The full list, with
defaults, is in [docs/REFERENCE.md](docs/REFERENCE.md).

| Key | What it does |
|---|---|
| `appear` | Plays once the element comes into view: `fade`, `slide-up`, `mask`, `blur`, `scale` or a `custom` start state. Text can be split into lines, words or letters, with a stagger. |
| `scroll` | Follows the scroll position: parallax (`speed`), or `from` and `to` states scrubbed across the element's passage. |
| `pin` | Holds the element in place for a stretch of scrolling. |
| `hover`, `press` | A state to move to while hovered (or focused by keyboard) or pressed. |
| `interactions` | The full list: click, key, delay and more, changing state or scrolling to an element. |

A **state** is `{ x, y, scale, rotate, opacity, blur }`, in px, a multiple,
degrees, 0 to 1 and px. It is relative to the element as your CSS draws it.

If the JSON is broken, or a value is not one Scrollwork knows, it says so in
the console (`[scrollwork] …`) and uses the default. Pass `warn: false` to
quiet it.

## API

| Call | Returns | |
|---|---|---|
| `auto(root?, options?)` | control | Play every `[data-scrollwork]` under `root` (default `document.body`) |
| `start(spec, options)` | control | Play a spec object (the same fields as the attribute, with an `id` per item) |
| `animate(targets, keyframes, options?)` | controls | Move elements from code |
| `inView(targets, onEnter, options?)` | stop function | Run `onEnter(el)` on arrival; return a function to run on leaving |
| `scroll(handler, options?)` | stop function | Call `handler(progress)` or scrub an animation as the page scrolls |
| `easeOf(ease)` | `(t) => number` | Any curve as a function |

A **control** (`auto`, `start`) has `stop()`, which gives every element back
exactly as it was, and `replay()`.

**Controls** (`animate`) have `play()`, `pause()`, `reverse()`, `seek(0..1)`,
`finish()`, `cancel()`, `finished` (a promise), `progress` and `playing`.

`animate` options: `duration` (0.6 s), `delay`, `ease`, `repeat`
(`Infinity` for ever), `yoyo`, `stagger`, `autoplay` (true), `reducedMotion`
(`'user'`, `'always'`, `'never'`), `onUpdate(progress)` and `onComplete()`.

**Curves**: `smooth`, `out`, `in-out`, `expo`, `back`, `linear`, `in`,
`in-back`, `in-out-back`, a cubic bezier `[x1, y1, x2, y2]`, or your own
function.

## Accessibility

- **Reduced motion.** With `prefers-reduced-motion: reduce`, elements appear in
  their final state, parallax and scrubbing stop, hover and press snap, and
  smooth scrolling is off. Delays are kept, because a reduced-motion reader
  still needs the page's timing. `animate()` jumps to its end and does not
  loop. `reducedMotion: 'never'` is for motion that is the content itself,
  such as a progress bar.
- **Keyboard.** Hover states also show on keyboard focus. Press states respond
  to Enter and Space. A key trigger never takes Enter or Space from a focused
  button or link, and ignores shortcuts made with a modifier key.
- **Screen readers.** Split text hides its pieces and is read once, whole. Text
  that contains a link or a button is left readable as it is.
- **Scrolling.** Smooth scrolling leaves the wheel to any box under the pointer
  that can still scroll: a modal, a code block, a carousel.

## Browser support

Every release is tested in current Chromium, WebKit and Firefox.

Scrollwork needs the individual transform properties (`translate`, `scale`,
`rotate`), so it is built for Chrome 104, Safari 14.1 and Firefox 72 or later.
Where those versions miss something newer, it falls back rather than failing:
focus shows hover styles without `:focus-visible`, and the mask effect uses
`overflow: hidden` where `overflow: clip` is not supported. Versions that old
are not in the test runs.

Known limits in 1.0: pinned and parallax elements are moved by script after
the browser scrolls, so iOS momentum scrolling may show a slight lag;
and an element that `auto()` or `start()` takes over begins from
its author's look, so the end state of an earlier `animate()` on it is not
kept once the engine stops.

## Development

```sh
npm install
npm run build           # dist/: ES module, plain script, minified, types
npm test                # unit tests
npm run test:browsers   # Chromium, WebKit and Firefox (after the build)
```

## License

MIT, © 2026 uxspot.io
