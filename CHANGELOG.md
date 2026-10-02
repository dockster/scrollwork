# Changelog

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
