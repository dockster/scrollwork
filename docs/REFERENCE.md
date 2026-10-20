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
| `rotateX`, `rotateY` | degrees in 3D: tipped back (around the horizontal axis), turned aside (around the vertical one) | `0` |
| `perspective` | px, how near the eye is for `rotateX` and `rotateY`; smaller is more dramatic | `1000` |
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
| `range` | `"through"` | `through`: entering to leaving. `in`: until centred. `out`: centred to leaving. `hold`: a pinned element's own hold, caught to let go (`through` when it is not pinned) |
| `trigger` | the element | another element whose passage drives it; a pinned trigger drives it across its hold |
| `split` | none | the pieces `from` and `to` apply to in turn: a text's `lines`, `words` or `chars`; `children`, each element inside (a formation, with `order`, `outward`, `vary`, `origin`); or `slices` (1.15) |
| `slices` | `4` | slices: how many vertical slices a one-line text is cut into, 2 to 12. Each shows its strip of a copy of the words, so together they read as the text (after Codrops' Sliced Text Effect, MIT; see [THIRD-PARTY.md](THIRD-PARTY.md)). The pieces take `order`, `outward` and `vary` as a formation's do; `outward` parts the copies from the centre, the middle slices furthest, and sends a vertical start up and down in turn. A screen reader reads the words once, from a copy only it sees. Sizes are in em, so the slices follow the text's size at every width |
| `whole` | `false` | slices: the slices move whole, as strips; otherwise the words move inside slices that stay in place |
| `order`, `outward`, `vary`, `origin` | `start`, off, `0`, `center` | children, slices, and (1.15) a text's `words` or `chars`: which piece goes first (`start`, `end`, `center`, `edges`, `random`); each starting away from the centre on its side (a text's pieces on one axis as far as each is from the centre); how much each start differs (a text's pieces may also move the other way, scattering); the point each turns about (`top`, `bottom`, `left`, `right`, or `behind`, 1em behind it in depth) |
| `mask` | none | (1.15) a text's lines, words or letters: each starts out of its own box on this side (`top`, `bottom`, `left`, `right`), hidden by it, and slides into view; letters each get a box of their own. On top of `from` |
| `flipbook` | off | (1.17) the element's children are frames shown one at a time across the range, picked by the scroll: a product turning as the page goes by. `true` steps from frame to frame (30 to 60 renders); `"blend"` crosses each into the next (a few views, stacked in one place: the later one is drawn over the earlier). The range and `ease` work as for any scroll; on a pin, `range: "hold"`. Under reduced motion the first frame stays |

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
| `fade` | `0` | px: both ends of the box that clips the element (its parent) fade out along the axis it moves on, so a marquee's words come from nothing and go into nothing |
| `upright` | `false` | the element's children are turned back by the loop's rotation, so they stay level while it turns: a ring of pictures orbiting with every picture upright |
| `flipbook` | `0` | seconds: the element's children are shown one at a time, each for this long, round and round (a burst of pictures); the element itself still moves by `from` and `to` |
| `keys` | none | steps between `from` and `to` |

## pin

Holds the element in place while the page scrolls.

| Field | Default | |
|---|---|---|
| `distance` | `600` | px of scrolling |
| `top` | `0` | px from the top of the view |

## loader

The element covers the page as it opens, plays the appears inside it, holds,
then leaves; every appear outside it waits until it has gone, and the page
cannot scroll meanwhile. `{"loader": true}` takes the defaults. One per
page. Under reduced motion it is gone at once. Put `{"loop": {"flipbook":
0.5}}` on a box of pictures inside it for a burst of them, and `{"appear":
{"effect": "roll"}}` on a number for a counter.

| Field | Default | |
|---|---|---|
| `hold` | `2.5` | seconds it stays after the page opens |
| `leave` | `0.6` | seconds it takes to leave |
| `effect` | `"fade"` | `fade`, or `blur` to blur away as it fades |
| `once` | `false` | plays once a visit: a later page in the same session skips it (`sessionStorage`) |

## cursor

The element becomes the page's cursor: taken out of the flow, centred on the
pointer and following it a little behind. `{"cursor": true}` takes the
defaults. Hidden until the pointer first moves and on devices that cannot
hover (a phone), so the page reads the same there. Under reduced motion it
follows with no lag.

| Field | Default | |
|---|---|---|
| `lag` | `0.12` | seconds it takes to catch up with the pointer, 0 to 2 |
| `hide` | `true` | hides the page's own cursor over the root and everything in it (`data-sw-cursor-hidden` on the root, with a rule); it shows again over a field being typed in |
| `blend` | `"normal"` | `difference` keeps it visible over any colour |
| `links` | none | a state it moves to over a link, a button or a field, eased over 0.25 s: `{"scale": 2.5}` |

## rollover

A button's hover effect, played while the pointer is on the control (the
nearest link or button around the element, or `trigger`) or it has keyboard
focus, and back when it leaves. CSS transitions, so leaving halfway reverses
from where it is. One effect as an object, or a list with one of each.

```html
<a href="/start"><span data-scrollwork='{"rollover": {"effect": "roll"}}'>Get started</span></a>
<button data-scrollwork='{"rollover": {"effect": "wipe", "color": "#A6F4C5", "ink": "#000"}}'>Contact</button>
<button data-scrollwork='{"rollover": [{"effect": "roll"}, {"effect": "wipe", "color": "#FF6B02"}]}'>Get started</button>
<button data-scrollwork='{"rollover": {"effect": "wipe", "direction": "pointer", "color": "#D4FF3A", "ink": "#000"}}'>Let's talk</button>
```

| Field | Default | |
|---|---|---|
| `effect` | `"roll"` | `roll`: the letters move out of a one-line window one after another as a copy moves in. `wipe`: a colour sweeps across the element. |
| `direction` | roll `"up"`, wipe `"right"` | roll: `up` or `down`. wipe: the way the colour travels, `right` (from the left edge), `left`, `up` (from the bottom), `down`, `center` (outward), or `pointer`: a ripple, a circle of the colour growing from where the pointer comes in (from the centre for keyboard focus) and going back toward where it leaves |
| `duration` | roll `0.2`, wipe `0.8` | seconds a letter, or the wipe, takes (0 to 5) |
| `stagger` | `0.02` | roll: seconds between letters (0 to 0.5) |
| `ease` | roll `"ease-in-out-quad"`, wipe `"out"` | a curve by name (see Curves); Elastic and Bounce ease out instead |
| `color` | (required for a wipe) | the colour that sweeps across, a layer above the element's own background |
| `ink` | none | wipe: the colour its words and icons take |
| `trigger` | the nearest link or button | the id of the element whose hover plays it |

A roll is for one line of text: the element's words, split into letters, in
a window as tall as the line, its own children set aside and given back on
stop. A screen reader hears the words once. Text an `appear` already splits is
not rolled. Under reduced motion the letters stay and a wipe's colours change
at once; a tap on a touch screen plays neither.

## hover and press

`{ "hover": { "scale": 1.04 } }` and `{ "press": { "scale": 0.96 } }` are
states. Add `"animation": { "curve": "out", "duration": 0.25 }` to change how
they move (press defaults to 0.12 s). Keyboard focus shows the hover state;
Enter and Space show the press state.

`"source"` plays it while another element is hovered or pressed: `"parent"`, the
element holding it, or another element's id. A card's picture that grows while
the card is hovered, and while the keyboard is on a link inside the card:

```html
<a class="card" href="/work">Work
  <img src="phones.png" alt="" data-scrollwork='{"hover": {"scale": 1.06, "y": -12, "source": "parent"}}'>
</a>
```

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
| `source` | the element itself | where the trigger is heard: `"parent"`, or another element's id. A `hover` heard on another element also plays while the keyboard is anywhere inside it |

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

## origin

The point an element's motions turn and grow around: its appear, scroll, loop
and states. `center` (the default), `top`, `bottom`, `left`, `right`,
`top-left`, `top-right`, `bottom-left` or `bottom-right`.

```html
<div class="card" data-scrollwork='{"origin": "top", "scroll": {"from": {}, "to": {"rotate": 12}}}'>…</div>
```

Only the motion turns about it: an element your CSS rests at an angle stays
where it is, and turns from there. A split scroll's own `origin` is the point
its pieces turn about, each in its own box.

## hidden

(1.17) The element is hidden at rest and its interactions bring it in: a glow
that shows while a card is hovered, a caption on focus. Their opacity counts
from nothing up instead of as a share of the element's own.

```html
<div class="card">
  <div class="glow" data-scrollwork='{"hidden": true, "hover": {"opacity": 1, "source": "parent"}}'></div>
</div>
```

Without interactions it simply stays hidden. Before the script runs the
element shows as its CSS draws it; hide it there too if it must never flash.
Given back on stop.

## fade

The element's edges fade to nothing, in px from each edge: a window that words
or pictures scroll through, with no hard line where they are cut.

```html
<div class="window" data-scrollwork='{"fade": {"top": 40, "bottom": 40}}'>…</div>
```

`top`, `right`, `bottom` and `left`, from 0. Both directions at once keep only
what both leave. It is a mask on the element, given back on stop. A loop's own
`fade` fades the box around a marquee; this one fades the element itself.

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
`SPRINGS` holds four presets as `[stiffness, damping, mass]`: `gentle`
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

### distort

Pixel distortion, after Codrops' Distorted Pixels (MIT, © Codrops; see
[THIRD-PARTY.md](THIRD-PARTY.md)). The picture is cut into a grid of cells;
the pointer moving over the element pushes the cells near it along its own
direction, and each cell eases back to its place. Big cells read as blocks,
many small ones as a liquid smear. At rest the picture is itself and nothing
draws; it stops drawing once every cell is back.

| Field | Default | |
|---|---|---|
| `on` | `"hover"` | what pushes the cells: `hover`, the pointer while it is over the element (or the sweep while it has keyboard focus); `appear` also opens scrambled, each cell pushed at random (from `seed`), and settles as the element comes into view; `always`, the sweep all the time; `scroll`, the sweep as hard as the page scrolls fast |
| `intensity` | `1` | multiplies `strength` |
| `speed` | `1` | runs its settling faster or slower |
| `grid` | `50` | cells across and down, 2 to 1000, whole |
| `mouse` | `0.25` | the pointer's reach, a fraction of the grid, 0 to 1 |
| `strength` | `0.11` | how far a push moves the cells, 0 to 1 |
| `relaxation` | `0.9` | what a cell keeps of its offset each frame (at 60 a second), 0 to 0.999: 0.9 settles in about half a second, 0.96 lingers |
| `in`, `out` | `0.2`, `0.6` | seconds for the hover to come in and go out |

**The sweep (1.13.1).** The cells only move when something moves over them.
When no pointer does (on `always`, on `scroll`, or on `hover` when the element
is hovered with no pointer over it: keyboard focus, or a host app playing it),
a stand-in moves instead: a slow Lissajous path across the middle of the
picture, its phase set by `seed`, at `speed`. A real pointer moving over the
picture takes over at once, and the sweep comes back 0.6 s after its last
move. A hover effect under a pointer that rests stays still, as in the
original. The pointer is followed over the whole element, even under words or
a shade laid over the picture.

Codrops' demos: `{"grid": 50, "mouse": 0.25, "strength": 0.11}` (demo 1, the
defaults), `{"grid": 607, "mouse": 0.11, "strength": 0.36, "relaxation":
0.96}` (demo 2) and `{"grid": 15, "mouse": 0.13, "strength": 0.15}` (demos 3
and 4). A picture effect, read as `glitch` reads it (its `background-image`,
with CORS). The offsets are an RG32F texture, sampled nearest, which WebGL2
reads without an extension. Under reduced motion the picture shows as it is.

### bulge

A bulge (1.15.0), after Codrops' 3D Bulge Text Effect (MIT, © Codrops; see
[THIRD-PARTY.md](THIRD-PARTY.md)). Around the pointer the picture swells
towards the eye: a dome that magnifies what is under it, falling off to
nothing at its rim, lit from the top left. The dome follows the pointer a
little behind. At rest the element is itself and nothing draws.

On an element with no background picture and words in it (a heading), the
words are its picture: each word is drawn where the page laid it out, in its
own element's font, weight, size, colour, letter spacing and case, once the
page's fonts have loaded, and again when the element changes size. While the
bulge is drawn the element's own words are made transparent
(`-webkit-text-fill-color`, class `ux-motion-fx-text`); they stay in the page
for screen readers, selection and search, and show again as it settles. The
dome swells inside the element's box only: give a heading room around its
words. A text element's effect follows the pointer over its box even when its
words take no pointer events of their own.

| Field | Default | |
|---|---|---|
| `on` | `"hover"` | `hover`, the pointer while it is over the element (or a slow sweep while it has keyboard focus); `appear`, `always` and `scroll` swell it along the sweep |
| `intensity` | `1` | multiplies `strength` |
| `speed` | `1` | the sweep's pace |
| `reach` | `0.2` | the dome's radius, a fraction of the element's width, 0.02 to 1 |
| `strength` | `0.6` | how far it magnifies, 0 to 1 |
| `shade` | `0.5` | how much its slopes are lit and shaded, 0 to 1 |
| `trail` | `0.5` | seconds the dome takes to catch up with the pointer, 0 to 5 |
| `in`, `out` | `0.3`, `0.6` | seconds for the hover to come in and go out |

### Playing an effect on demand

A host app that shows an effect without a reader to hover it (a design tool's
play button) mounts the element on its own surface with `on: "always"`:

```js
import { createSurface, readFx } from 'scrollwork/fx';
const surface = createSurface({ win: window, wake: () => requestAnimationFrame(frame) });
surface.add(el, readFx([{ type: 'distort', on: 'always' }], console.warn, 'demo'));
// each frame: surface.draw(now, dt, () => signals); keep going while it returns true
```

Every effect then plays as it would with the pointer over it; a distortion
follows the sweep. `surface.remove(el)` stops it, and the element shows its
picture again. A host's `t0` is its clock's start: set to the frame's time each
frame, it holds the effect on its first frame (a distortion stays at rest).

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
