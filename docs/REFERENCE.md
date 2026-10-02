# Scrollwork reference

Everything the `data-scrollwork` attribute and `start()` accept, with the
defaults used when a field is left out. The README has the overview and the
`animate`, `inView` and `scroll` API.

## States

A **state** is `{ "x", "y", "scale", "rotate", "opacity", "blur" }`, and can
carry `scaleX`, `scaleY`, `fill`, `ink` and `image`:

| Field | Unit | At rest |
|---|---|---|
| `x`, `y` | px | `0` |
| `scale` | multiple | `1` |
| `scaleX`, `scaleY` | multiple of one axis, on top of `scale` | `1` |
| `rotate` | degrees | `0` |
| `opacity` | 0 to 1, multiplies the element's own | `1` |
| `blur` | px | `0` |
| `fill`, `ink` | a CSS colour the background (or the text, the words inside the element included) moves to | the element's own |
| `image` | a picture's URL, shown in place of the element's own from halfway through | the element's own |

A state is relative to the element as the page draws it. `y: 40` is 40px below
where its CSS puts it, and `scale: 1.1` is 10% larger than its own scale.
`{"scaleX": 0}` is a bar with no width that grows to its own; `{"fill":
"#232323", "ink": "#FFFFFF"}` on hover darkens a card and lightens its words,
eased like the rest of the state; `image` has no in-between, so it swaps at
the midpoint and comes back when the motion ends.

## appear

Plays once the element (or its trigger) comes into view.

| Field | Default | |
|---|---|---|
| `effect` | `"slide-up"` | `fade`, `slide-up`, `mask`, `blur`, `scale`, `custom`, `roll` (text: digits roll like an odometer, always by letter) |
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
| `turns` | `1` | `roll` only: times each digit goes round 0 to 9 before its value, 0 to 10 |

Text is split when the element holds words and only inline elements (`<em>`,
`<strong>`, a link). Set `"text": false` to never split it, or `"text": true`
to force it.

## scroll

Follows the scroll position.

| Field | Default | |
|---|---|---|
| `speed` | `0` | parallax, -100 to 100: above 0 drifts slower than the page, below 0 faster |
| `cover` | `false` | parallax inside a clipping box: scaled up just enough that the drift never shows the box's edge |
| `from`, `to` | at rest | the states at the start and the end of the range |
| `keys` | none | steps between them |
| `range` | `"through"` | `through`: entering to leaving. `in`: until centred. `out`: centred to leaving |
| `trigger` | the element | another element whose passage drives it; a pinned trigger drives it across its hold |

## loop

Moves from one state to another over and over, while the element is on
screen; nothing under reduced motion. `{"to": {"x": -640}, "duration": 12.8}`
is a marquee (two copies of the row side by side, the row moved by one copy's
width); `{"to": {"rotate": 360}, "duration": 20}` a slow spin.

| Field | Default | |
|---|---|---|
| `from` | at rest | where each turn starts |
| `to` | at rest | where it ends |
| `duration` | `4` | seconds per turn |
| `ease` | `"linear"` | any curve name |
| `yoyo` | `false` | there and back (`from`, `to`, `from`) instead of starting over |
| `delay` | `0` | seconds before the first turn |
| `keys` | none | steps between `from` and `to` |

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
| `trigger` | `"none"` | `click`, `drag`, `hover`, `press`, `key`, `mouseenter`, `mouseleave`, `mousedown`, `mouseup`, `delay`, `media-end`, `media-time` |
| `key` | none | for `key`: the key as `KeyboardEvent.key` (`"k"`, `"ArrowRight"`, `" "`) |
| `at` | `0` | for `media-time`: the second the video or audio plays past |
| `delay` | `0` | seconds before the action (kept under reduced motion) |
| `action.type` | `"none"` | `change` (to `state`), `scroll` (to `target`, with an `offset`), `url` (`url`, `newTab`), `navigate` (to `target`, with `preserveScroll`) and `swap` (to `target`), `overlay` (below), `back`, `close`, `custom` (below) |
| `animation` | `{ "curve": "out", "duration": 0.25 }` | `kind: "instant"` for no motion; `curve: "custom"` with `bezier: [x1, y1, x2, y2]`; `curve: "spring"` with `spring: [stiffness, damping, mass]`; press defaults to 0.12 s |

A `scroll` target is another element's `data-sw-id`; `offset` stops that many
pixels above it (the height of a header that stays on top). When the target
sits in a box that scrolls on its own (`overflow: auto`, a carousel), that box
scrolls to it rather than the page. A `navigate`, `swap` or
`overlay` target is whatever your page's `navigate` option understands; with
`auto()`, a `#hash` or a URL. An `overlay` also takes `position` (`center`,
the default, `top-left`, `top-center`, `top-right`, `bottom-left`,
`bottom-center`, `bottom-right`, or `manual` with an `offset: { x, y }` from
the element that opened it), `closeOnOutside` and `background` (both `true`
unless set to `false`), and a `backdrop` colour. A screen change's `animation` can carry a
`transition` (`instant`, `dissolve`, `smart`, `move-in`, `move-out`, `push`,
`slide-in`, `slide-out`) and a `direction` (`left`, `right`, `top`,
`bottom`); Scrollwork hands the interaction, with them, to your `navigate`,
`overlay` and `swap` options, and plays nothing itself.

A `click` or `key` change flips back and forth; `hover` and `press` hold it for
as long as they last. `navigate`, `back`, `overlay`, `swap` and `close` call
the matching option of `start()`; with `auto()`, navigate follows a `#hash` or
a URL, and back goes back in history. `url` opens only web and mail addresses.

The innermost element with a pointer trigger takes the event: a button's click
does not also run the click of the card or the page around it. The root itself
can carry interactions (a whole screen with a key or a delay).

`media-end` and `media-time` listen to a video or audio: the element itself,
or the first one inside it. `media-time` fires each time playback passes `at`;
seeking back before it lets it fire again. A looping video never ends.

A `custom` action, `{ "type": "custom", "name": "addToCart", "data": { ... } }`,
is the page's own: Scrollwork binds its trigger and delay and calls the
`custom(name, data, interaction, phase)` option, with `phase` `"start"`, and
`"end"` when a `hover` or `press` that held it stops. Without the option,
custom actions do nothing.

## Curves

`smooth` (0.87, 0, 0.13, 1), `out` (0.22, 1, 0.36, 1), `in-out`
(0.65, 0, 0.35, 1), `expo` (0.16, 1, 0.3, 1), `back` (0.34, 1.56, 0.64, 1),
`linear`, `in` (0.42, 0, 1, 1), `in-back` (0.3, -0.05, 0.7, -0.5) and
`in-out-back` (0.7, -0.4, 0.4, 1.4). A custom bezier's x values are clamped
to 0 to 1, as CSS does.

**easings.net.** The thirty curves of [easings.net](https://easings.net), named
as there in kebab case: `ease-in-sine`, `ease-out-quart`, `ease-in-out-bounce`.
Ten families (sine, quad, cubic, quart, quint, expo, circ, back, elastic,
bounce), each `in`, `out` and `in-out`. The first eight are cubic beziers with
the site's points (`CURVES`); Elastic and Bounce are functions, as the site
writes them (`DRAWN`). `EASINGS` lists the thirty names in the site's order,
and `cssEase(name)` gives any named curve as CSS: `cubic-bezier()`, or
`linear()` through 129 points for Elastic and Bounce. They are accepted
everywhere a curve is: `appear.ease`, an interaction's `animation.curve`,
and `animate()`'s `ease`.

**Springs.** `spring(stiffness, damping, mass)` returns `{ ease, duration }`:
the curve, and the seconds it takes to settle within a thousandth of the end.
`SPRINGS` holds Figma's four as `[stiffness, damping, mass]`: `gentle`
(100, 15, 1), `quick` (300, 20, 1), `bouncy` (600, 15, 1), `slow` (80, 20, 1).
An interaction plays a spring over its `duration`, so give it the spring's own
settle time.

## Tokens

Durations and curves can come from CSS variables, so motion follows a design
system's tokens: change `--duration-slow` in the stylesheet and every animation
that uses it changes with it.

```html
<style>:root { --duration-slow: 600ms; --ease-brand: cubic-bezier(0.2, 0, 0, 1); }</style>
<div data-scrollwork='{"appear": {"effect": "fade", "duration": "var(--duration-slow)"}}'>…</div>
<button data-scrollwork='{"hover": {"scale": 1.05}, "animation": {"curve": "var(--ease-brand)", "duration": "var(--duration-slow)"}}'>…</button>
```

Wherever a spec takes `duration`, `delay` or `stagger`, it also takes
`"var(--name)"`, read from the element's computed style when the page is read
(`auto()`), or from the page's root for a spec passed to `start()`. A time is
`600ms`, `0.6s`, or a bare number of seconds. Wherever it takes a curve
(`appear.ease`, an interaction's `animation.curve`), the variable may hold a
curve name or `cubic-bezier(x1, y1, x2, y2)`; an interaction plays a bezier as
its custom curve, an appear plays names only.

A fallback after a comma is used when the variable is not set or holds
something Scrollwork cannot play, such as a `linear()` curve:
`"var(--ease-bounce, ease-out-bounce)"`. With neither, the field takes its
default, and the console says why.

## fx

Effects drawn by the optional add-on, `scrollwork/fx`, given to `auto()` or
`start()` as `plugins: [fx]`. Without it, the list is carried and nothing
happens. A list, in the order they stack (each works on the one before).

Every effect takes:

| Field | Default | |
|---|---|---|
| `type` | required | the effect |
| `on` | per effect | `hover` (and keyboard focus), `appear` (its appear's progress, strongest at the start), `always`, `scroll` (the scroll speed) |
| `intensity` | `0.6` | 0 to 1 |
| `speed` | `1` | a multiple of its own pace, 0.1 to 4 |
| `seed` | `0` | the random pattern's seed |
| `in`, `out` | `0.12`, `0.35` | seconds to come in and go out, for `hover` |

### glitch

Blocks of the picture shift sideways in steps and the red and blue channels
drift apart; stronger near the pointer. At rest the picture is itself.

| Field | Default | |
|---|---|---|
| `on` | `"hover"` | |
| `blocks` | `24` | blocks across the width, 2 to 128 |
| `split` | `6` | px the colours move apart at full strength, 0 to 64 |

The element's picture is its `background-image` (or its `::before`'s), fitted
as `background-size: cover` or `contain` says. It is read with CORS
(`crossorigin="anonymous"`): a picture served without `Access-Control-Allow-Origin`
cannot be read, and the element keeps it as it is. The same when there is no
WebGL2, no `OffscreenCanvas` (Safari before 16.4), or the reader asked for
reduced motion.

### dither

A field of dots over the element: an ordered (bayer) dither or a halftone
screen of a slow drifting cloud, or of the element's own picture when it has
one. The pointer leaves a trail that thins the dots and tints the paper; it is
followed over the whole element, even under what covers it, since a field is
usually drawn behind the page. Drawn one bitmap pixel per CSS pixel and scaled
without smoothing. Always moving while on screen.

| Field | Default | |
|---|---|---|
| `on` | `"always"` | `hover` draws it only while the pointer is over it |
| `intensity` | `0.7` | how dark the darkest part gets |
| `mode` | `"bayer"` | `bayer` or `halftone` |
| `size` | `2` | px: a bayer cell; a halftone dot's spacing is three times it |
| `scale` | `420` | px: how large the cloud's shapes are |
| `color` | `"#000000"` | the dots |
| `color2` | `"transparent"` | between the dots; transparent shows the element's own fill |
| `accent` | `"#B3FDD0"` | the trail's tint on the paper |
| `radius` | `90` | px the trail reaches around the pointer |
| `trail` | `0.35` | seconds the trail's tail takes to catch up |
| `in`, `out` | `0.2`, `0.6` | seconds the trail takes to show and to fade |

Colours are hex (`#rgb`, `#rrggbb`, with alpha), `rgb()`/`rgba()` or
`transparent`.

A field draws behind the element's children and over its own background, as a
background picture would: the element is isolated (`isolation: isolate`) while
the effect plays, and given back on stop.

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
| `custom` | none | what the page's own actions do: `(name, data, interaction, phase)` |
| `plugins` | none | plugins that play alongside the engine: `[fx]` from `scrollwork/fx` |

`auto(root, options)` takes the same options (all optional), plus `smooth`.
