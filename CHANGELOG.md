# Changelog

## 1.1.0 (unreleased)

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
