# Scrollwork

Scroll, appear, pin and interaction motion for the web. Describe it in HTML
with a `data-scrollwork` attribute, or in code with `animate()`, `timeline()`,
`inView()` and `scroll()`.

- **About 28 KB gzipped, no dependencies.** One file for a `<script>` tag, or
  an ES module for your bundler, with TypeScript types. WebGL effects are a
  separate, optional file (`scrollwork/fx`, about 10 KB), and so are flip,
  morph, motion paths, dragging and sideways sections (`scrollwork/extras`,
  about 5 KB).
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
wheel scrolling smooth, and `data-scrollwork-sticky` to pin with
`position: sticky` where the layout allows, so pins stay put during iOS
momentum scrolling. Sticky moves each pinned element into a track of its own
while it plays, so leave it off on pages a framework such as React or Vue
renders; there, pins move by script as before (`sticky: true` is the same
choice from code).

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
import { animate, timeline, inView, scroll, auto } from 'scrollwork';

// animate: values are relative to the element's own look
const intro = animate('.card', { y: [40, 0], opacity: [0, 1] }, { duration: 0.6, stagger: 0.08, ease: 'expo' });
await intro.finished;

// inView: run something when an element arrives, and undo it when it leaves
inView('.stat', (el) => {
  const a = animate(el, { scale: [0.9, 1], opacity: [0, 1] });
  return () => a.reverse();
});

// any CSS property, variable or colour, an SVG line drawn, a plain object's numbers
animate('.panel', { width: ['40%', '100%'], '--glow': 1, backgroundColor: '#111' });
animate('svg path', { draw: [0, 1] }, { duration: 1.2 });
animate(counter, { value: 1200 }, { onUpdate: () => (el.textContent = Math.round(counter.value)) });

// timeline: one after the other, overlapping where asked, played or scrubbed as one
const tl = timeline({ defaults: { duration: 0.6, ease: 'out' } })
  .add('.hero h1', { y: [40, 0], opacity: [0, 1] })
  .add('.hero p', { opacity: [0, 1] }, {}, '-=0.3')
  .label('cards')
  .add('.card', { y: [24, 0], opacity: [0, 1] }, { stagger: 0.08 }, 'cards');

// scroll: progress through the page, or through one element's passage
scroll((p) => progressBar.style.scale = `${p} 1`);
scroll(animate('.hero img', { y: [0, 120] }, { autoplay: false }), { target: '.hero' });
scroll(timeline({ autoplay: false }).add(/* ... */), { target: '.story', start: 'top top', end: '+=2000', smooth: 0.4, snap: 0.25 });

// the declarative engine, for everything with a data-scrollwork attribute
auto();
```

## The attribute

`data-scrollwork` holds JSON, and every field is optional. The full list, with
defaults, is in [docs/REFERENCE.md](docs/REFERENCE.md).

| Key | What it does |
|---|---|
| `appear` | Plays once the element comes into view (its top `offset`% up the screen, or on screen at all once the page is scrolled to its end): `fade`, `slide-up`, `mask`, `blur`, `scale` or a `custom` start state. Text can be split into `lines`, `words` or letters (`chars`), with a stagger. |
| `scroll` | Follows the scroll position: parallax (`speed`, with `cover` to keep a picture over its clipped box), or `from` and `to` states scrubbed across the element's passage, or across its own pin (`range: "hold"`). States can tip in 3D (`rotateX`, `rotateY`, `perspective`). |
| `pin` | Holds the element in place for a stretch of scrolling. |
| `loop` | A state played over and over while on screen: a marquee (with `fade` for its edges), a spin (with `upright` to keep the children level), a `flipbook` of the children. |
| `cursor` | The element follows the pointer as the page's cursor, with a `lag`, a `links` state over links, the page's own cursor hidden. |
| `loader` | The element covers the page as it opens, plays what appears inside it, holds, then leaves; every other appear waits for it. The root carries `data-sw-loading` while it is up. |
| `hover`, `press` | A state to move to while hovered (or focused by keyboard) or pressed. |
| `rollover` | A button's hover effect: `roll` sends the label's letters out one after another as a copy rolls in (`direction` up or down, `stagger`), `wipe` sweeps a `color` across it from a side or the centre while its words take an `ink`. `scramble` flickers each letter through random characters (`turns`, `glyphs`) before it lands on its own, with a `cursor` block and random `colors` if asked, and plays on hover, as the text comes into view, or both (`on`). Played by the nearest link or button around it, or by keyboard focus; one of each, as a list, on the same element. |
| `interactions` | The full list: click, key, delay, a video ending and more, changing state, scrolling to an element, or calling your own `custom` action. |

A **state** is `{ x, y, scale, rotate, opacity, blur }`, in px, a multiple,
degrees, 0 to 1 and px. It is relative to the element as your CSS draws it.
It can also scale one axis (`scaleX`, `scaleY`), move to a colour (`fill`,
`ink`) or show another picture (`image`), and hide part of itself from each side
(`clip: { top, right, bottom, left }` in percent: a reveal from a corner is a
scroll from `{ "clip": { "top": 100, "right": 100 } }` to `{}`).

A `scroll` can take an `ease`, and on text a `split` (`lines`, `words`,
`chars`) with a `spread` (0.05 to 1): its `from` and `to` then apply to each
piece in turn, so words light up as the paragraph is read
(`{ "split": "words", "from": { "opacity": 0.2 }, "to": {}, "range": "in" }`).
`split: "slices"` cuts a one-line text into `slices` that come together as it
scrolls in (after Codrops' Sliced Text Effect). `split: "children"` does the same for each element inside it, a formation:
pictures flying into their grid while it is pinned. `order` (`start`, `end`,
`center`, `edges`, `random`) says which goes first; `outward` gives each its
side of the centre (a start that moves across and down spreads from the
centre; one that moves one way only keeps it for all) and opens the turns out
as far as each is from the centre;
`vary` (0 to 1) makes each start a little different, the same every time;
`origin` (`center`, `top`, `bottom`, `left`, `right`) is the point they turn
about.

If the JSON is broken, or a value is not one Scrollwork knows, it says so in
the console (`[scrollwork] …`) and uses the default. Pass `warn: false` to
quiet it.

## API

| Call | Returns | |
|---|---|---|
| `auto(root?, options?)` | control | Play every `[data-scrollwork]` under `root` (default `document.body`) |
| `start(spec, options)` | control | Play a spec object (the same fields as the attribute, with an `id` per item) |
| `animate(targets, keyframes, options?)` | controls | Move elements (or a plain object's numbers) from code |
| `timeline(options?)` | timeline | Several motions in sequence, played, reversed, sought or scrubbed as one |
| `inView(targets, onEnter, options?)` | stop function | Run `onEnter(el)` on arrival; return a function to run on leaving |
| `scroll(handler, options?)` | stop function | Call `handler(progress)` or scrub an animation or a timeline as the page scrolls |
| `easeOf(ease)` | `(t) => number` | Any curve as a function |
| `spring(stiffness, damping, mass)` | `{ ease, duration }` | A spring as a curve, and how long it takes to settle; `SPRINGS` has Figma's four |

A **control** (`auto`, `start`) has `stop()`, which gives every element back
exactly as it was, `replay()`, and in seek mode `seek(y, height, now?, bottom?)`:
the page posed at a scroll position; with a clock, an appear that arrives plays
in time, and the call says whether anything is still in flight. `bottom` is the
furthest the page scrolls (the root's height less the screen when unset).

**Controls** (`animate`, `timeline`) have `play()`, `pause()`, `reverse()`,
`seek(0..1)`, `finish()`, `cancel()`, `finished` (a promise), `progress`,
`playing` and `duration` (seconds).

**Keyframes.** The motion values `x`, `y`, `scale`, `scaleX`, `scaleY`,
`rotate`, `rotateX`, `rotateY`, `opacity` and `blur` are relative to the
element's own look, and a single number moves from rest. Any other key is a CSS
property (`width`, `clipPath`, `boxShadow`) or variable (`'--glow'`), from its
value now to the one given: lengths move in their unit, colours (hex, `rgb()`,
names) through rgba, values with several numbers number by number, anything
else switches halfway. `draw` draws an SVG line from its start, 0 to 1. On a
plain object every key is its own property. A list is keyframes, evenly spaced.

`animate` options: `duration` (0.6 s), `delay`, `ease`, `repeat`
(`Infinity` for ever), `yoyo`, `stagger`, `autoplay` (true), `reducedMotion`
(`'user'`, `'always'`, `'never'`), `onUpdate(progress)` and `onComplete()`.

**Timeline.** `add(targets, keyframes, options?, at?)` places a motion
(`duration`, `delay`, `ease`, `stagger`, `repeat`, `yoyo`); `call(fn, at?)` runs
a function each time the playhead passes; `label(name, at?)` names a moment,
and `labelAt(name)` says where it is. `at` is seconds from the start, `'+=0.2'`
or `'-=0.2'` from the end so far, `'<'` and `'>'` the start and end of the
motion added before (`'<0.2'`, `'>-0.1'`), or a label (`'cards+=0.3'`); unset is
the end so far. Two motions moving the same value of one element hand over:
the one that started last shows, and before either starts the first one's
start shows, so a fade in later on is hidden from the beginning. A motion given
only an end starts where the one before it left off. Options: `defaults`
(`duration`, `ease`, `stagger`), `repeat`, `yoyo`, `autoplay`,
`reducedMotion`, `onUpdate`, `onComplete`. It starts playing once built, after
the chain of `add()`s.

**scroll** options: `target`, `container`, `range` (`through`, `in`, `out`),
or `start` and `end` anywhere: `"<place on the target> <place on the view>"`,
each `top`, `center`, `bottom`, a percent or px, with `+=` or `-=` after it
(`"top 80%"`, `"center center+=100"`); `end: "+=600"` is 600px after the start;
a number is a scroll position. `smooth` (seconds) lets the progress catch up
softly; `snap` (`0.25`, or a list such as `[0, 0.4, 1]`) glides to the
nearest point once scrolling stops inside the passage; `onEnter`, `onLeave`,
`onEnterBack` and `onLeaveBack` run as it is crossed. Under reduced motion
there is no smoothing and a snap jumps.

**Curves**: `smooth`, `out`, `in-out`, `expo`, `back`, `linear`, `in`,
`in-back`, `in-out-back`, the thirty of [easings.net](https://easings.net)
(`ease-in-sine` to `ease-in-out-bounce`), a cubic bezier `[x1, y1, x2, y2]`,
a spring (`spring(600, 15, 1).ease`), or your own function. `cssEase(name)`
writes a named curve as CSS.

## Extras (scrollwork/extras)

Five more motions in an optional file of their own (about 5 KB gzipped), built
on `animate()`, `timeline()` and `scroll()`: load it after the core.

```js
import { capture, flip, morph, shape, follow, drag, sideways } from 'scrollwork/extras';
// or <script src="scrollwork.min.js"></script><script src="scrollwork-extras.min.js"></script> (window.ScrollworkExtras)

// flip: capture where things are, change the layout, and they glide there
const before = capture('.card');
grid.classList.toggle('list');
flip(before, { duration: 0.5, ease: 'expo', stagger: 0.02 });

// morph: one SVG shape into another, whatever their points
morph('#blob', '#star', { duration: 0.8, ease: 'in-out' });
tl.add(shape('#icon', 'M0 0 L10 10 Z'), { progress: 1 });          // in a timeline

// follow: along an SVG path, turning with it; scrubbed by the scroll here
scroll(animate(follow('.plane', '#route', { rotate: true, align: true }), { progress: [0, 1] }, { autoplay: false }), { target: '.flight' });

// drag: inside bounds, thrown on release, landing on snap points; arrow keys too
const belt = drag('.belt', { axis: 'x', bounds: '.rail', snap: 320 });

// sideways: a section that scrolls sideways while the page scrolls down
sideways('.work', { snap: 'panels', smooth: 0.2 });
```

- **flip(state, options)** returns a timeline. `scale: false` only moves
  (text keeps its shape); `enter` is how a new element comes in (a fade and a
  small scale), `false` for not at all.
- **morph(path, to, options)** returns controls; **shape(path, to)** is the
  same as an object whose `progress` (0 to 1) draws it, for timelines. `to` is
  a `d` or a path. `points` (120) sets how finely the outlines are walked. One
  outline per path: a shape with a hole morphs its outer line.
- **follow(element, path, options)** is an object whose `progress` places the
  element: `align` puts its centre on the path (by default it moves by the
  path's shape from where it is), `rotate` turns it with the path (a number
  adds degrees), `start` and `end` take part of the path.
- **drag(element, options)**: `axis`, `bounds` (an element, a selector, or
  `{ left, right, top, bottom }` offsets), `inertia` (true), `overshoot`
  (0.35), `snap` (px, a list, a function, or one per axis), `step` (px per
  arrow key when it has focus), and `onStart`, `onDrag`, `onRelease`,
  `onRest`. It returns `x`, `y`, `dragging`, `to(x, y?)`, `enable()`,
  `disable()` and `destroy()`. Letting go is not a click; touch scrolls along
  the other axis; under reduced motion nothing is thrown.
- **sideways(section, options)**: the track is the section's first child (or
  `track`), and moves from its left edge on the section's to its right edge
  on it, wherever the section's layout puts it. `smooth`, `snap` (`'panels'`,
  a share, or a list), `onUpdate`. It returns `progress`, `offset`,
  `watch(target, handler, { range })` for something inside passing across the
  screen, `refresh()` and `stop()`. Keyboard focus inside scrolls it into view.

## Effects (scrollwork/fx)

Shader effects on the elements Scrollwork moves, in a file of their own that
only pages using one load. Opt in by handing the plugin to the engine:

```html
<img-like div data-scrollwork='{"fx": [{"type": "glitch"}]}' style="background: url(hero.jpg) center / cover"></div>
<script src="scrollwork.min.js"></script>
<script src="scrollwork-fx.min.js"></script>
<script>window.scrollwork = Scrollwork.auto(document.body, { plugins: [ScrollworkFx.fx] })</script>
```

```js
import { auto } from 'scrollwork';
import { fx } from 'scrollwork/fx';
auto(document.body, { plugins: [fx] });
```

`fx` is a list; each effect has a `type` and an `on` (`hover`, the default
for most, `appear`, `always` or `scroll`, the scroll speed), an `intensity`
(0 to 1), a `speed` and the fields of its own in
[docs/REFERENCE.md](docs/REFERENCE.md#fx). The effect reads the element's own
picture (its `background-image`) and draws over it inside the element, under
its border radius and in its stacking order, from one WebGL2 context for the
whole page. Without WebGL2, under reduced motion, or when the picture is served
without CORS headers, the element shows its picture as it is: nothing goes
blank. An element that cannot hold a child (`<img>`, `<video>`) is left alone;
put the picture on a `<div>`'s background instead.

Effects: `glitch` (blocks of the picture shift and the colours split while
hovering), `dither` (a crisp field of bayer or halftone dots over a drifting
cloud or the element's picture, with a pointer trail) and `distort` (the
pointer pushes the picture's cells along its path and they ease back, after
Codrops' Distorted Pixels; with no pointer, on `always` or `scroll`, a slow
sweep moves them), and `bulge` (the picture, or the element's own words, swells
towards the eye under a lit dome that follows the pointer, after Codrops' 3D Bulge
Text Effect). More follow.

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
  that contains a link or a button is left readable as it is. A rolling label
  is read once, without its copy.
- **Rollovers.** Played by keyboard focus as by hover, never by a tap on a
  touch screen. Under reduced motion the letters stay and a wipe's colours
  change at once.
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

Known limits: parallax, and pins without `data-scrollwork-sticky`, are moved
by script after the browser scrolls, so iOS momentum scrolling may show a lag;
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

The `distort` effect follows Codrops' Distorted Pixels
(github.com/codrops/DistortedPixels, MIT, © Codrops); its notice is in
[docs/THIRD-PARTY.md](docs/THIRD-PARTY.md). So does the `bulge` effect, after
Codrops' 3D Bulge Text Effect (tympanus.net/codrops/?p=76625, MIT, © Codrops).
