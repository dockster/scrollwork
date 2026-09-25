# Changelog

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
