# Changelog

## 1.14.1

- A custom cursor sits on the pointer when the element it moves in is not the root: a
  screen centred in a wider window (a published page wider than its design) put it
  off to the side by the margin. It is now placed in the px of its own offset parent,
  inside that box's border.

## 1.14.0

- `TransitionType` takes `curtain`: a screen change its host plays with a panel
  of one colour passing between the two screens; an interaction's animation
  keeps its `cover` colour (#RRGGBB) for it.
- `timeline()`: several motions in sequence, overlapping where asked
  (`'-=0.3'`, `'<'`, `'>'`, labels), with `call()` and `label()`, played,
  reversed, sought, repeated or scrubbed by `scroll()` as one. Two motions on
  the same value of an element hand over; one given only an end starts where
  the one before left off; a fade in later on is hidden from the start.
- `animate()` moves any CSS property or variable, colours included, values
  with several numbers (`clipPath`, `boxShadow`) number by number, and a plain
  object's numbers; `draw` draws an SVG line; `scaleX`, `scaleY`, `rotateX`
  and `rotateY` join the motion values. `cancel()` gives every property back.
- `scroll()`: `start` and `end` anywhere (`"top 80%"`, `end: "+=600"`, a
  scroll position), `smooth` for a softer scrub, `snap` to the nearest point
  once scrolling stops, and `onEnter`, `onLeave`, `onEnterBack`, `onLeaveBack`.
- Controls have `duration` (seconds).
- In the spec: a state's `clip` hides part of the element from each side
  (`{ top: 100, right: 100 }` opens from the bottom-left corner as it moves
  to `{}`), on appear, scroll, loop, hover and interactions; a scroll motion
  takes an `ease`; and `split` (lines, words, letters) with `spread` lights
  text piece by piece as the page scrolls. Under reduced motion the pieces are
  as they are.
- Formations: a scroll's `split: "children"` moves each element inside in
  turn (pictures flying into their grid while it is pinned), in an `order`
  (start, end, center, edges, random), each from its own start: `outward`
  points `from` away from the centre and turns it as far as the child is from
  it, `vary` (0 to 1) makes each start a little different (seeded), and
  `origin` sets the point they turn about. After Codrops' On-Scroll Layout
  Formations (MIT, docs/THIRD-PARTY.md), without GSAP.
- Rollover `scramble`: each letter flickers through random characters, one
  after another, and lands on its own (`turns`, `glyphs`, a `cursor` block,
  random `colors`), on hover and keyboard focus, as the text comes into view
  (typed in), or both (`on`). Each letter keeps its width, a screen reader
  reads the words once, nothing moves under reduced motion. A roll and a
  scramble do not share the letters. After Codrops' Line Text Hover
  Animations (MIT, docs/THIRD-PARTY.md), without GSAP or SplitType.
- scrollwork.min.js is 28.1 KB gzipped (budget 28.5).
- `scrollwork/extras`, a new optional file (4.9 KB gzipped, budget 5), on
  `animate()`, `timeline()` and `scroll()` without a copy of the core:
  `flip()` for layout changes, `morph()` and `shape()` for one SVG shape into
  another, `follow()` along an SVG path, `drag()` with bounds, a throw, snap
  points and the arrow keys, and `sideways()` for a section that scrolls
  sideways while the page scrolls down.
- scrollwork.min.js was 25.6 KB gzipped at this point (budget 26, was 22.5); a project
  importing the module carries only what it uses. The package description no
  longer says "a few KB".
- Tests: unit tests for values, placement, scroll places, snap, and the
  extras' arithmetic; browser tests for each in Chromium, WebKit and Firefox;
  examples/timeline.html and examples/extras.html.

## 1.13.2 (2026-10-13)

- Scroll speed counts the scroll that wakes the loop. When nothing else moved,
  the loop rested between scroll steps and its first frame after waking had no
  length, so the step that woke it was dropped and the speed stayed 0: a
  scroll fx (`distort` with `on: "scroll"`) alone on a page never moved. The
  first frame after a wake now counts a frame's length.
- Tests: a scroll `distort` alone on the page, stepped and wheeled.

## 1.13.1 (2026-10-12)

- scrollwork/fx `distort` moves with no pointer: a slow sweep across the
  picture (a Lissajous path, its phase from `seed`, at `speed`) pushes the
  cells on `always`, on `scroll` (as hard as the page scrolls fast), and on
  `hover` when the element is hovered with no pointer over it (keyboard focus,
  or a host app playing it on its own surface with `on: "always"`). Before,
  `always` and `scroll` never drew, and a host app's play showed nothing. A
  real pointer moving over the picture takes over; the sweep returns 0.6 s
  after its last move; a pointer resting over a hover one leaves it still.
- `distort` follows the pointer over the whole element, even under words or a
  shade laid over the picture (they took its events before).
- The minified shaders lose their comments and indentation: scrollwork-fx.min.js
  is 8.8 KB gzipped (was 8.9; the budget is 9).

## 1.13.0 (2026-10-12)

- scrollwork/fx `distort`: pixel distortion, after Codrops' Distorted Pixels
  (MIT, © Codrops; docs/THIRD-PARTY.md). The pointer pushes the picture's
  cells along its path and they ease back; `grid`, `mouse` (reach), `strength`
  and `relaxation` as in the original, its demo 1 the defaults. On `appear` it
  opens scrambled and settles in. Nothing draws at rest or once settled;
  reduced motion shows the picture as it is.
- scrollwork-fx.min.js is 8.9 KB gzipped (the budget is 9).

## 1.12.0 (2026-10-11)

- `rollover`: a button's hover effect, drawn by CSS transitions so it reverses
  from wherever it is when the pointer leaves.
  - `roll`: the label's letters move up (or down) one after another, out of a
    one-line window, as a copy of the label moves in behind them; back the
    other way, the last letter first. 0.2 s a letter, 0.02 s apart, on
    `ease-in-out-quad` by default.
  - `wipe`: a `color` grows across the element from a side (`direction`
    right, left, up, down) or out from the `center`, as a background layer
    above its own; its words (and icons) take `ink`. 0.8 s on `out` by default.
  - Played by the nearest link or button around the element (or `trigger`),
    and by keyboard focus; not by a tap on a touch screen. Under reduced
    motion the letters stay and a wipe's colours change at once. A roll and a
    wipe can share an element (`rollover` takes a list, one of each).
  - A rolling label is read once by a screen reader. `stop()` gives the
    element back as it was.
- The minified file is 22.0 KB gzipped (the budget allows 22.5).

## 1.11.1 (2026-10-10)

- A `loader` on the page covers the whole window. It kept the width and
  height the page's CSS gave it (an exported 1440x900 screen) inside
  `position: fixed; inset: 0`, so a wider window showed a strip of the page
  beside it and a shorter one hid its bottom edge.
- The root carries `data-sw-loading` while a loader is up, and loses it when
  the loader has left (again on `replay()`): a host that holds layers over
  the root outside its stacking context can lift the root above them.

## 1.11.0 (2026-10-10)

- `loader`: an element covers the page as it opens, plays the appears inside
  it, holds, then fades (or blurs) away; every appear outside it waits until
  it has gone and the page cannot scroll meanwhile. `once` remembers the
  visit in sessionStorage. `replay()` plays it again.
- `loop.flipbook` (seconds): the element's children are shown one at a time,
  each for that long, round and round: a burst of pictures in a loader, stop
  motion anywhere.

- `cursor`: an element becomes the page's cursor. It follows the pointer
  with a `lag`, hides the page's own cursor (`hide`), can `blend` as
  `difference`, and moves to a `links` state over a link, a button or a
  field. Hidden until the pointer moves and on devices that cannot hover;
  positioned in the root's own pixels, so a zoomed preview lines up too.
- States gain `rotateX`, `rotateY` (degrees in 3D) and `perspective` (px,
  1000 when left out), painted as a `transform` in front of the element's
  own; `scroll.range: "hold"` scrubs a pinned element across its own hold.
  Together they make the pinned section that tips back, shrinks and fades
  while the next one slides over it: `{"pin": {"distance": 900}, "scroll":
  {"range": "hold", "to": {"scale": 0.7, "rotateX": 40, "opacity": 0}}}`.
- `loop.upright`: a loop that rotates turns the element's children back by
  the same angle every frame, so a ring of cards orbits with every picture
  level. A child Scrollwork moves itself is turned on top of its own motion;
  the others are turned directly, and given back their own rotation on stop.
- `loop.fade` (px): the box that clips a looping element fades out at both
  ends of the axis the loop moves along, as a marquee's edges do, with a
  gradient mask on the parent that is taken off on stop. A vertical marquee
  is the same recipe as the horizontal one, `{"to": {"y": -480}}` over two
  copies of the column.

- A split text's `ink` comes back to the text's own colour. A word, line or
  letter was painted against nothing, so a colour in an appear's `from` or
  `keys` faded through black on its way to the text's colour. Each unit is
  painted against its element's colour now, so a flash of orange on each word
  settles on the words as they are.

## 1.10.0 (2026-10-07)

- An appear on a layer near the bottom of the page plays once the page is
  scrolled to its end: every appear whose trigger is on screen there plays,
  though its top never reached the `offset` line. Before, a footer or a last
  card in the bottom 15% of the screen waited, hidden, for a scroll that could
  not come. `seek(y, height, now?, bottom?)` takes the furthest scroll (the
  root's height less the screen when unset) for the same rule in seek mode.

## 1.9.3 (2026-10-04)

- Split text (`lines`, `words`, `chars`) breaks a word wider than its line
  where the element's own CSS lets it (`word-break: break-word`,
  `overflow-wrap: break-word` or `anywhere`), as the text does unsplit:
  before, each word was kept on one line and ran past the element's edge, so
  a big headline on a phone overflowed and everything under it moved up.
  Without those properties a word still never breaks.

## 1.9.2 (2026-10-02)

- `dither` on an element that scrolls (a carousel, `overflow-x: auto`) stays
  on the element as it shows: before, the field was drawn in the scrolled
  content and slid away with it, uncovering the element's edge as the cards
  moved. The pointer trail already followed the element's visible box.

## 1.9.1 (2026-10-02)

- `dither` draws behind the element's children and over its own fill, as a
  background does: before, the field was drawn last and covered the words and
  pictures inside the element. The element is isolated while the effect plays
  (`isolation: isolate`, given back on stop) so the field cannot fall behind
  it. Picture effects (glitch) still draw over their picture.

## 1.9.0 (2026-10-02)

- `loop`: an element moves from one state to another over and over (a
  marquee, a slow spin, a pulse), with a duration, a curve, `yoyo` to go there
  and back, a `delay` and `keys`. It plays only while the element is on screen,
  so an off-screen loop never keeps the page awake, and not at all under
  reduced motion.
- `appear.effect: "roll"`: numbers roll in like an odometer. Each digit becomes
  a wheel that goes round `turns` times (1 by default) and lands on its value,
  the wheels staggered; the other characters slide up through a mask. The text
  is said once, whole, to a screen reader, and comes back as it was on stop.
- `scrollwork/fx` `dither`: a field of dots, ordered (bayer) or a halftone
  screen, of a slow drifting cloud, or of the element's picture when it has
  one. The pointer leaves a trail that thins the dots and tints the paper
  (`accent`), followed over the whole element even under the words and
  pictures that cover it. Drawn one bitmap pixel per CSS pixel and scaled
  without smoothing, so the dots stay crisp. `color2: "transparent"` (the
  default) lets the element's own fill show between the dots.
- fx colours (`color`, `color2`, `accent`) are hex, `rgb()` or `transparent`,
  checked and said like the numbers.

## 1.8.0 (2026-10-02)

- `scrollwork/fx`: WebGL effects on the elements Scrollwork moves, in a file
  of their own (`dist/fx.mjs`, `dist/scrollwork-fx.min.js`, about 6 KB
  gzipped). An item's `fx` is a list of effects; the first is `glitch`
  (blocks of the picture shift and the colours split, on hover by default).
  One WebGL2 context draws every effect, each shown through a small canvas
  inside its element, so the effect keeps the element's radius, stacking,
  scroll and transforms. Without WebGL2, under reduced motion, or when the
  picture cannot be read (no CORS), the element shows its picture as it is.
- `plugins` on `start()` and `auto()`: something that plays alongside the
  engine, mounted on the elements found and called at the end of every frame
  with each element's signals (appear progress, scroll progress, the picture
  in flight, the scroll speed). The engine measures the scroll speed now, for
  plugins, and keeps the loop awake while it settles.
- The spec carries an item's `fx` through unread (an entry without a `type`
  is dropped and said), for a plugin to read.
- The build has a size budget per minified file and fails over it; the README
  says the measured size (about 17 KB gzipped for the core) instead of the 10 KB
  it had kept saying.

## 1.7.0 (2026-10-01)

- `scroll.cover`: a parallax that keeps covering its parent. The element is
  scaled up just enough that, while the parent is on screen, the drift never
  shows the parent's edge, so a photo filling a clipped cell can drift at any
  speed without a gap. Measured from the live viewport and the parent's box.

## 1.6.0 (2026-10-01)

- A state can scale one axis: `scaleX` and `scaleY`, on top of `scale`
  (`{"scaleX": 0}` to `{"scaleX": 1}` grows a bar from nothing). At rest `1`.
- A state can move to a colour: `fill` (background) and `ink` (text), any CSS
  colour, eased from the element's own colour as the motion plays. `ink`
  reaches the words inside the element too, whatever their own CSS colour, so
  a hover that darkens a card and lightens its words is one `change`.
- A state can show another picture: `image`, a URL, swapped halfway through
  the motion (an `<img>`'s `src`, any other element's `background-image`) and
  put back when the motion ends.

## 1.5.0 (2026-10-01)

- `seek(y, height, now?)` on a control takes a clock. Without one, as before,
  an appear whose trigger has arrived is shown finished. With one
  (`performance.now()`), an appear that arrives plays in time from that
  moment, and a seek back above its start readies it again, so a scrubber can
  show the entrance a reader would see. It returns whether anything is still
  in flight: seek again each frame while it does.

## 1.4.0 (2026-09-30)

- Motion from a design's tokens: a duration, delay, stagger or curve can be
  `"var(--name)"`, read from the element's CSS (or the page's root for a spec
  given to `start()`). Times take `ms` or `s`; curves take a name or
  `cubic-bezier()`, and an interaction plays a bezier as its custom curve. A
  fallback after the comma covers a variable that is missing or holds what
  Scrollwork cannot play: `"var(--ease-bounce, ease-out-bounce)"`. See
  Tokens in docs/REFERENCE.md.

## 1.3.0 (2026-09-28)

- The thirty curves of easings.net, by name: `ease-in-sine` to
  `ease-in-out-bounce`, wherever a curve is read (appear, interactions,
  `animate()`). Twenty four are cubic beziers with the site's points; Elastic
  and Bounce are the site's functions. `EASINGS` lists the names, `DRAWN`
  holds Elastic and Bounce, and `cssEase(name)` writes any named curve as CSS
  (`linear()` for the drawn ones).

## 1.2.0 (2026-09-28)

The first version on npm: it carries 1.1.0 below, which was tagged but not
published.

- A page's own actions: an interaction can say `{"type": "custom", "name": ..., "data": ...}`,
  and Scrollwork binds its trigger and delay and hands `name` and `data` to the
  `custom` option (with `end` when a hover or press that held it stops). How a
  design tool plays its variables and conditionals.
- Springs: `spring(stiffness, damping, mass)` gives a curve and the time it
  takes to settle, and `SPRINGS` has Figma's four. An interaction's animation
  can be `{"curve": "spring", "spring": [600, 15, 1]}`.
- The innermost element with a pointer trigger takes the event: a button's
  click no longer also runs the click of the card or page around it.
- The root itself can carry motion and interactions (a whole screen with a
  key, a delay or a click anywhere).
- `scroll` to an element inside a box that scrolls on its own (a carousel,
  `overflow: auto`) scrolls that box to it, along the interaction's curve,
  rather than the page.
- `scroll` takes an `offset` (px above the target), `navigate` a
  `preserveScroll`, and `overlay` an `offset` and a `backdrop` colour, passed
  to the page's callbacks; `overlay` has a `manual` position.
- `media-end` and `media-time` triggers: when a video or audio ends, or plays
  past a moment (`at`, in seconds).

## 1.1.0 (2026-09-26, tagged, not published on its own)

- Pins can be held by `position: sticky`: turn it on with
  `data-scrollwork-sticky` on `<html>` (or `sticky: true` in code). The browser
  then moves a pin with its own scroll, so on iOS it stays still through a
  fling instead of trailing it by up to 185px. Where the layout does not allow
  it (a scrolling box in between, an inline or floated element, a pin inside
  another pin), or it would change how the page looks, that pin moves by
  script as before. Off by default: sticky moves each pinned element into a
  track of its own, which a page rendered by React or Vue must not have.
- `stop()` gives an element back its style attribute exactly as it was: an
  element that had none no longer keeps an empty `style=""`.

## 1.0.2 (2026-09-25)

Documentation only; the code is the same as 1.0.1.

- The reference now lists every field an interaction's action takes: the
  `target` of `navigate`, `swap` and `overlay`, an overlay's `position`,
  `closeOnOutside` and `background`, and a screen change's `transition` and
  `direction`, with what Scrollwork does with them.
- The README names the value for splitting into letters: `chars`.

## 1.0.1 (2026-09-25)

- Positions are measured again when the page changes under the motion, not
  only when it resizes: a block collapsed or a class toggled above an element,
  content added or removed, an image finishing loading, or a moving element
  changing size. An element moved into view this way now appears without
  waiting for a scroll.
- `reverse()` ends when every target is back at its start, instead of also
  playing the start delay backwards.

## 1.0.0 (2026-09-25)

The first release: scroll, appear, pin and interaction motion from JSON or
`data-scrollwork` attributes, plus `animate()`, `inView()` and `scroll()`.
