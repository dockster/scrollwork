# Changelog

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
