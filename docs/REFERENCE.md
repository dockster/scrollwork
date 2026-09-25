# Scrollwork reference

Everything the `data-scrollwork` attribute and `start()` accept, with the
defaults used when a field is left out. The README has the overview and the
`animate`, `inView` and `scroll` API.

## States

A **state** is `{ "x", "y", "scale", "rotate", "opacity", "blur" }`:

| Field | Unit | At rest |
|---|---|---|
| `x`, `y` | px | `0` |
| `scale` | multiple | `1` |
| `rotate` | degrees | `0` |
| `opacity` | 0 to 1, multiplies the element's own | `1` |
| `blur` | px | `0` |

A state is relative to the element as the page draws it. `y: 40` is 40px below
where its CSS puts it, and `scale: 1.1` is 10% larger than its own scale.

## appear

Plays once the element (or its trigger) comes into view.

| Field | Default | |
|---|---|---|
| `effect` | `"slide-up"` | `fade`, `slide-up`, `mask`, `blur`, `scale`, `custom` |
| `split` | `"none"` | text only: `lines`, `words`, `chars` |
| `duration` | `0.8` | seconds |
| `delay` | `0` | seconds |
| `stagger` | `0.08` | seconds between lines, words or letters |
| `ease` | `"expo"` | any curve name (below) |
| `from` | `{ "y": 40, "opacity": 0 }` | the custom effect's starting state |
| `keys` | none | steps between start and end: `[{ "at": 50, "state": { … } }]` |
| `offset` | `15` | starts when the trigger's top is this percent into the view |
| `replay` | `false` | plays again each time it comes back into view |
| `trigger` | the element | another element's `data-sw-id` whose arrival starts it |

Text is split when the element holds words and only inline elements (`<em>`,
`<strong>`, a link). Set `"text": false` to never split it, or `"text": true`
to force it.

## scroll

Follows the scroll position.

| Field | Default | |
|---|---|---|
| `speed` | `0` | parallax, -100 to 100: above 0 drifts slower than the page, below 0 faster |
| `from`, `to` | at rest | the states at the start and the end of the range |
| `keys` | none | steps between them |
| `range` | `"through"` | `through`: entering to leaving. `in`: until centred. `out`: centred to leaving |
| `trigger` | the element | another element whose passage drives it; a pinned trigger drives it across its hold |

## pin

Holds the element in place while the page scrolls.

| Field | Default | |
|---|---|---|
| `distance` | `600` | px of scrolling |
| `top` | `0` | px from the top of the view |

## hover and press

`{ "hover": { "scale": 1.04 } }` and `{ "press": { "scale": 0.96 } }` are
states. Add `"animation": { "curve": "out", "duration": 0.25 }` to change how
they move (press defaults to 0.12 s). Keyboard focus shows the hover state;
Enter and Space show the press state.

## interactions

The full form, a list:

```json
{ "interactions": [
  { "trigger": "click", "action": { "type": "change", "state": { "rotate": 180 } },
    "animation": { "curve": "back", "duration": 0.4 } },
  { "trigger": "key", "key": "ArrowDown", "action": { "type": "scroll", "target": "features" } }
] }
```

| Field | Default | |
|---|---|---|
| `trigger` | `"none"` | `click`, `drag`, `hover`, `press`, `key`, `mouseenter`, `mouseleave`, `mousedown`, `mouseup`, `delay` |
| `key` | none | for `key`: the key as `KeyboardEvent.key` (`"k"`, `"ArrowRight"`, `" "`) |
| `delay` | `0` | seconds before the action (kept under reduced motion) |
| `action.type` | `"none"` | `change` (to `state`), `scroll` (to `target`), `url` (`url`, `newTab`), `navigate`, `back`, `overlay`, `swap`, `close` |
| `animation` | `{ "curve": "out", "duration": 0.25 }` | `kind: "instant"` for no motion; `curve: "custom"` with `bezier: [x1, y1, x2, y2]` |

A `click` or `key` change flips back and forth; `hover` and `press` hold it for
as long as they last. `navigate`, `back`, `overlay`, `swap` and `close` call
the matching option of `start()`; with `auto()`, navigate follows a `#hash` or
a URL, and back goes back in history. `url` opens only web and mail addresses.

## Curves

`smooth` (0.87, 0, 0.13, 1), `out` (0.22, 1, 0.36, 1), `in-out`
(0.65, 0, 0.35, 1), `expo` (0.16, 1, 0.3, 1), `back` (0.34, 1.56, 0.64, 1),
`linear`, `in` (0.42, 0, 1, 1), `in-back` (0.3, -0.05, 0.7, -0.5) and
`in-out-back` (0.7, -0.4, 0.4, 1.4). A custom bezier's x values are clamped
to 0 to 1, as CSS does.

## start(spec, options)

A spec is `{ "version": 1, "items": [...], "smooth": false }`. Each item has an
`id` (the value of `options.attr` on its element), `text`, and any of
`appear`, `scroll`, `pin` and `interactions`. A spec without `version` is
read as version 1; a newer version plays what this Scrollwork knows, and
says so.

| Option | | |
|---|---|---|
| `attr` | required | the attribute that names elements |
| `root` | required | where elements are looked up |
| `scroller` | required | the scrolling element, or `null` for the window |
| `reduced` | required | start with reduced motion on or off |
| `followReduced` | `false` | follow `prefers-reduced-motion` as it changes (`auto()` turns it on) |
| `split` | required | split text |
| `warn` | `true` | say in the console what could not be read |
| `navigate`, `back`, `overlay`, `swap`, `close` | none | what the screen actions do |

`auto(root, options)` takes the same options (all optional), plus `smooth`.
