// The Scrollwork spec: what a page asks to move, and how. These are the same
// shapes uxdeck's Prototype tab writes, so a design exported from uxdeck and a
// page written by hand speak one language.

/** The spec's format. A spec without a version is read as version 1. */
export const SPEC_VERSION = 1;

/** An element's state at the start or end of a motion. Identity is x 0, y 0, scale 1, rotate 0, opacity 1, blur 0. */
export interface MotionState {
  /** px */
  x: number;
  /** px */
  y: number;
  scale: number;
  /** one axis on top of `scale`: 1 is the element's own width (or height), 0 is nothing */
  scaleX?: number;
  scaleY?: number;
  /** degrees */
  rotate: number;
  /** degrees, in 3D: tipped back (around the horizontal axis) and turned aside (around the vertical one); 0 when unset */
  rotateX?: number;
  rotateY?: number;
  /** px: how near the eye is for `rotateX` and `rotateY`, smaller is more dramatic; 1000 when unset */
  perspective?: number;
  /** 0 to 1, multiplies the element's own opacity */
  opacity: number;
  /** px */
  blur: number;
  /** a background colour to move to (any CSS colour); the element's own when unset */
  fill?: string;
  /** a text colour to move to */
  ink?: string;
  /** a picture to show in place of the element's own, by URL: an <img>'s src, any other element's background-image. Swapped halfway through the motion */
  image?: string;
  /**
   * percent of the element hidden from each side, 0 to 100 (a clip-path
   * inset): `{ top: 100, right: 100 }` is nothing, opening from the
   * bottom-left corner as it moves to `{}`
   */
  clip?: { top?: number; right?: number; bottom?: number; left?: number };
}

/** The easing functions of easings.net, by family: `ease-in-sine` to `ease-in-out-bounce`. */
export type EasingFamily = 'sine' | 'quad' | 'cubic' | 'quart' | 'quint' | 'expo' | 'circ' | 'back' | 'elastic' | 'bounce';
export type EasingName = `ease-${'in' | 'out' | 'in-out'}-${EasingFamily}`;

/**
 * Named curves. `smooth` is cubic-bezier(0.87, 0, 0.13, 1); `back` eases out
 * past the end and settles. The thirty of easings.net are named as there,
 * `ease-out-quart`, `ease-in-out-bounce`.
 */
export type MotionEase = 'smooth' | 'out' | 'in-out' | 'expo' | 'back' | 'linear' | 'in' | 'in-back' | 'in-out-back' | EasingName;

/** A step on a motion's timeline: the state `at` percent of the way (of the duration for appear, of the range for scroll). */
export interface MotionKey {
  at: number;
  state: MotionState;
}

/** `roll`: text only, each digit rolls up a column of digits to its value (an odometer); the other characters slide up through a mask */
export type AppearEffect = 'fade' | 'slide-up' | 'mask' | 'blur' | 'scale' | 'custom' | 'roll';
export type TextSplit = 'none' | 'lines' | 'words' | 'chars';

/** Appear: plays once the element (or its trigger) comes into view. */
export interface AppearMotion {
  effect: AppearEffect;
  /** text only: animate the block, or each line, word or letter */
  split: TextSplit;
  /** seconds */
  duration: number;
  /** seconds */
  delay: number;
  /** seconds between lines, words or letters */
  stagger: number;
  ease: MotionEase;
  /** the custom effect's starting state */
  from: MotionState;
  /** starts when the trigger's top is this far into the viewport, 0 to 100 percent of its height */
  offset: number;
  /** play again every time it comes back into view */
  replay: boolean;
  /** steps between the starting state and the element at rest */
  keys?: MotionKey[];
  /** another element whose arrival starts it; the element itself when unset */
  trigger?: string;
  /** roll: how many times each digit goes round 0 to 9 before landing on its value (1 when unset) */
  turns?: number;
}

/**
 * Loop: the element moves from one state to another over and over, for as
 * long as the page is open (a marquee, a slow spin, a pulse). It plays only
 * while the element is on screen, and not at all under reduced motion.
 */
export interface LoopMotion {
  /** where each turn starts; the element at rest when unset */
  from: MotionState;
  to: MotionState;
  /** seconds per turn */
  duration: number;
  ease: MotionEase;
  /** go there and back (from, to, from) instead of starting over at `from` */
  yoyo: boolean;
  /** seconds before the first turn */
  delay: number;
  /**
   * px: the two ends of the box that clips the element (its parent) fade
   * out, along the axis the loop moves on, so a marquee's words come out of
   * nothing and go into nothing. 0 for none.
   */
  fade: number;
  /**
   * the element's children are turned the other way by the loop's rotation,
   * so they stay level while it turns: a ring of pictures that orbits with
   * every picture upright. Nothing when the loop does not rotate.
   */
  upright: boolean;
  /**
   * seconds: the element's children are shown one at a time, each for this
   * long, round and round (a burst of pictures, stop motion); `from`, `to`
   * and `duration` still move the element itself. 0 for none.
   */
  flipbook: number;
  /** steps between `from` and `to` */
  keys?: MotionKey[];
}

/**
 * A loader: the element covers the page as it opens, plays its own appears,
 * holds, then leaves; every appear outside it waits until it has gone, and
 * the page cannot scroll meanwhile. One per page. Under reduced motion it
 * leaves at once.
 */
export interface LoaderMotion {
  /** seconds it stays after the page opens, before leaving */
  hold: number;
  /** seconds it takes to leave */
  leave: number;
  /** how it leaves: fading, or blurring away as it fades */
  effect: 'fade' | 'blur';
  /** plays once a visit: a later page in the same session skips it (sessionStorage) */
  once: boolean;
}

/** `hold`: while the element (or its trigger) is pinned, from the start of its hold to the end; `through` when nothing is pinned */
export type ScrollRange = 'through' | 'in' | 'out' | 'hold';

/** While scrolling: parallax, and values scrubbed by the scroll position. */
export interface ScrollMotion {
  /** parallax, -100 to 100: positive moves slower than the page (farther away), negative faster (nearer) */
  speed: number;
  /** parallax inside a clipping box: scaled up just enough that the drift never shows the box's edge (a photo filling a cell) */
  cover?: boolean;
  from: MotionState;
  to: MotionState;
  /** through: from entering to leaving; in: until centred; out: from centred to leaving */
  range: ScrollRange;
  /** steps between the start and the end */
  keys?: MotionKey[];
  /** another element whose passage drives it; a pinned trigger drives it across its hold */
  trigger?: string;
  /** the curve across the range; linear when unset */
  ease?: MotionEase;
  /**
   * from and to apply to each piece in turn as the page scrolls, rather than
   * to the block: a text's lines, words or letters (words lighting up as they
   * are read), or `children`, each element inside it (pictures flying into
   * their grid while it is pinned)
   */
  split?: ScrollSplit;
  /** with split: the share of the range each piece takes to change, 0.05 to 1 (0.3); smaller is one after another, larger together */
  spread?: number;
  /** with split: which piece goes first: in order, from the end, from the centre out, from the edges in, or at random */
  order?: ScrollOrder;
  /**
   * children: each child's start takes its side of the centre. A start that
   * moves across and down spreads from the centre (a grid gathering from all
   * round); one that moves one way only keeps it for all (rising from
   * below). Turns (rotate, rotateX, rotateY) open out, as far as the child is
   * from the centre (a fan).
   */
  outward?: boolean;
  /** children, or a text's words or letters: 0 to 1, how much each piece's start differs from the next (seeded, so the same each time); rotations may turn either way */
  vary?: number;
  /** children, or a text's words or letters: the point each one turns and scales about */
  origin?: ScrollOrigin;
  /**
   * slices: how many vertical slices a one-line text is cut into, 2 to 12 (4).
   * Each slice shows its strip of a copy of the words; together they read as
   * the text (after Codrops' Sliced Text Effect). `outward` pushes the copies
   * away from the centre, the inner ones furthest, and sends a vertical start
   * up and down in turn.
   */
  slices?: number;
  /** slices: the slices move whole, as strips; otherwise the words move inside slices that stay in place */
  whole?: boolean;
  /**
   * a text's words or letters: each starts out of its own box on this side,
   * hidden by it, and slides into view (letters each in a box of their own);
   * on top of `from`
   */
  mask?: 'top' | 'bottom' | 'left' | 'right';
}

/** What a scroll motion moves in turn: a text's lines, words or letters, the element's children, or slices of a one-line text. */
export type ScrollSplit = TextSplit | 'children' | 'slices';
export type ScrollOrder = 'start' | 'end' | 'center' | 'edges' | 'random';
/** `behind`: a point behind the piece, in depth (letters swinging round it) */
export type ScrollOrigin = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'behind';

/** Pin: the element holds its place on screen for a stretch of scrolling. */
export interface PinMotion {
  /** px of scrolling it stays in place */
  distance: number;
  /** px from the top of the viewport where it holds */
  top: number;
}

/**
 * A custom cursor: the element is taken out of the page's flow and follows
 * the pointer, centred on it, a little behind. Hidden until the pointer first
 * moves, and on devices that cannot hover; the page's own cursor can be
 * hidden under it (but shows again over a field being typed in). Under
 * reduced motion it follows with no lag.
 */
export interface CursorMotion {
  /** seconds it takes to catch up with the pointer; 0 sticks to it */
  lag: number;
  /** hide the page's own cursor while it is on screen */
  hide: boolean;
  /** how it mixes with what is under it: `difference` keeps it visible on any colour */
  blend: 'normal' | 'difference';
  /** the state it moves to while the pointer is over a link, a button or a field (a bigger ring); eased over a quarter of a second */
  links?: MotionState;
}

/**
 * A control's hover effect, played while the pointer is on the control (or
 * the keyboard's focus is), and back when it leaves. `roll`: the label's
 * letters roll out one after another as a copy rolls in behind them (a text
 * element, one line). `wipe`: a colour sweeps across the element from a side
 * as its words take another colour. The control is the nearest link or
 * button around the element, or `trigger`. Nothing moves under reduced
 * motion (a wipe's colours change at once) or on a touch screen.
 */
export interface RolloverMotion {
  /** scramble: each letter flickers through random characters, one after another, before landing on its own */
  effect: 'roll' | 'wipe' | 'scramble';
  /**
   * where it moves. roll: up (out the top, the copy from below) or down; wipe: the way the colour travels (right
   * starts at the left edge), center, outward, or `pointer`: a ripple, a circle of the colour growing from where the
   * pointer comes in and going back toward where it leaves (from the centre for the keyboard's focus)
   */
  direction: 'up' | 'down' | 'left' | 'right' | 'center' | 'pointer';
  /** seconds each letter, or the wipe, takes */
  duration: number;
  /** roll: seconds between letters */
  stagger: number;
  ease: MotionEase;
  /** wipe: the colour that sweeps across */
  color?: string;
  /** wipe: the words' colour once it has */
  ink?: string;
  /** the id of the element whose hover plays it; the nearest link or button around it when unset */
  trigger?: string;
  /** scramble: random characters each letter shows before its own (3) */
  turns?: number;
  /** scramble: the characters it draws from; letters and symbols when unset */
  glyphs?: string;
  /** scramble: a block of the text's colour on each letter as it starts, like a terminal's cursor */
  cursor?: boolean;
  /** scramble: colours the random characters take, one at random each time; the text's own when unset */
  colors?: string[];
  /** scramble: when it plays: on hover (and keyboard focus), as it comes into view, or both */
  on?: 'hover' | 'appear' | 'both';
}

/**
 * What starts an interaction: a click, a drag, while hovering or pressing, a
 * key, the pointer entering, leaving, going down or up, or a delay after
 * start. `none` keeps the interaction and does nothing.
 */
/** `media-end` and `media-time` listen to a video or audio: the element itself, or the first one inside it */
export type InteractionTrigger = 'none' | 'click' | 'drag' | 'hover' | 'press' | 'key' | 'mouseenter' | 'mouseleave' | 'mousedown' | 'mouseup' | 'delay' | 'media-end' | 'media-time';

export type OverlayPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'manual';

/**
 * What an interaction does. `change` moves the element to a state; the
 * screen actions (navigate, back, overlay, swap, close) hand their target to
 * the matching option of `start()`; `scroll` glides the page to an element;
 * `url` opens a web or mail address.
 */
export type InteractionAction =
  | { type: 'none' }
  /** `preserveScroll`: the page's navigate callback is asked to keep the scroll position */
  | { type: 'navigate'; frameId: string; preserveScroll?: boolean }
  | { type: 'change'; state: MotionState }
  | { type: 'back' }
  /** `offset`: stop this many px above the element (a sticky header's height) */
  | { type: 'scroll'; targetId: string; offset?: number }
  | { type: 'url'; url: string; newTab: boolean }
  /** `manual` places it at `offset` from the element that opened it; `backdrop` is the colour behind it */
  | { type: 'overlay'; frameId: string; position: OverlayPosition; closeOnOutside: boolean; background: boolean; offset?: { x: number; y: number }; backdrop?: string }
  | { type: 'swap'; frameId: string }
  | { type: 'close' }
  /**
   * An action the page defines (a design tool's variables, a cart, a
   * conditional): Scrollwork binds its trigger and delay, then hands `name`
   * and `data` to the `custom` option, which does the rest.
   */
  | { type: 'custom'; name: string; data?: unknown };

export type TransitionType = 'instant' | 'dissolve' | 'smart' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out' | 'curtain';
export type TransitionDirection = 'left' | 'right' | 'top' | 'bottom';

/** How an interaction moves: instantly, or along a curve (named, or a custom cubic bezier). */
export interface InteractionAnimation {
  kind: 'instant' | 'animate';
  /** `spring` plays `spring` (stiffness, damping, mass) over `duration`, which should be its settle time (easing.ts spring) */
  curve: MotionEase | 'custom' | 'spring';
  spring?: [number, number, number];
  /** custom curve: x1, y1, x2, y2 (x is clamped to 0 to 1, as in CSS) */
  bezier?: [number, number, number, number];
  /** seconds */
  duration: number;
  /** for screen changes, handed to the navigate option */
  transition?: TransitionType;
  direction?: TransitionDirection;
  /** a curtain's panel colour, #RRGGBB, handed on with the transition */
  cover?: string;
}

export interface Interaction {
  id: string;
  trigger: InteractionTrigger;
  /** for the key trigger: the key, as KeyboardEvent.key ("ArrowRight", "k", " ") */
  key?: string;
  /** media-time: the moment, in seconds, the video or audio plays past */
  at?: number;
  /** seconds before the action starts */
  delay: number;
  action: InteractionAction;
  animation: InteractionAnimation;
  /**
   * where the trigger is heard, when not on the element itself: `parent` (the element holding it), or the id of
   * another element. A card's picture that moves while the card is hovered (and while the keyboard is inside it).
   */
  source?: string;
}

/** The point an element turns and grows around: its centre, a side's middle, or a corner. */
export type MotionOrigin = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** px each edge of an element fades out over, to nothing at the edge (a window whose content scrolls through it) */
export interface EdgeFade {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * An effect for a plugin (scrollwork/fx): the core carries it through as
 * written and the plugin reads it. `on` says what drives it.
 */
export interface FxSpec {
  type: string;
  on?: 'hover' | 'appear' | 'always' | 'scroll';
  [key: string]: unknown;
}

/** One element's motion. */
export interface MotionItem {
  /** the value of the `attr` option on the element */
  id: string;
  /** the element is text: appear can split it into lines, words or letters */
  text: boolean;
  appear?: AppearMotion;
  scroll?: ScrollMotion;
  pin?: PinMotion;
  loop?: LoopMotion;
  /** the element follows the pointer as the page's cursor */
  cursor?: CursorMotion;
  /** the element covers the page as it opens and leaves after a hold; appears outside it wait */
  loader?: LoaderMotion;
  /** hover effects: its letters roll, a colour wipes across it, or both (one of each) */
  rollover?: RolloverMotion[];
  interactions?: Interaction[];
  /** effects played by a plugin given to `start()` (scrollwork/fx); nothing without one */
  fx?: FxSpec[];
  /** the point its motions turn and grow around (its rotate, scale and 3D tips); the centre when unset. Its own resting rotation stays as it is */
  origin?: MotionOrigin;
  /** its edges fade out (a mask), for as long as the engine runs */
  fade?: EdgeFade;
}

/** What the engine knows about an element this frame, for a plugin. */
export interface Signals {
  /** appear progress 0 to 1; 1 when it has no appear, or under reduced motion */
  appear: number;
  /** how far through its scroll range, 0 to 1; 0 without a scroll motion */
  scroll: number;
  /** the picture a state is moving to, and how far along (the swap shows at 0.5); null when none */
  image: { url: string; k: number } | null;
  /** the page's scroll speed, px per second, positive downwards, smoothed */
  velocity: number;
  /** the frame's clock (ms) and the time since the last frame (ms) */
  now: number;
  dt: number;
}

export interface PluginContext {
  root: HTMLElement;
  win: Window;
  /** the engine is driven by seek(): there is no loop of its own */
  seekOnly: boolean;
  /** the elements the spec names that were found, with their items */
  items: Array<{ item: MotionItem; el: HTMLElement }>;
  /** whether the reader asked for less motion, now */
  reduced(): boolean;
  /** ask for a frame: something changed that the engine does not know about (a pointer moved) */
  wake(): void;
}

export interface PluginHandle {
  /** called at the end of every frame the engine draws; return true while something is still in flight, to keep the loop awake */
  frame(read: (el: HTMLElement) => Signals, now: number, dt: number): boolean;
  stop(): void;
}

/** Something that plays alongside the engine, on the elements it moves (scrollwork/fx). */
export interface Plugin {
  name: string;
  /** null when it cannot run here (no WebGL): the page plays without it */
  mount(ctx: PluginContext): PluginHandle | null;
}

/** A page's motion. */
export interface MotionSpec {
  /** the spec format; missing means 1 */
  version?: number;
  items: MotionItem[];
  /** smooth wheel scrolling for the page */
  smooth: boolean;
}

export interface MotionOptions {
  /** the attribute that names elements, matched against each item's `id` */
  attr: string;
  /** where elements are looked up */
  root: HTMLElement;
  /** the scrolling element; null scrolls the window */
  scroller: HTMLElement | null;
  /** prefers-reduced-motion: elements show their final state, nothing drifts; time (delays) is kept */
  reduced: boolean;
  /** follow prefers-reduced-motion as it changes while the page is open; `reduced` is the starting value */
  followReduced?: boolean;
  /** split text into lines, words and letters */
  split: boolean;
  /** seek mode: no loop and no listeners, the state comes from seek() */
  seekOnly?: boolean;
  /** warn in the console about a spec it cannot fully read (default true) */
  warn?: boolean;
  /**
   * pin with position: sticky where the layout allows, so iOS moves pins with
   * its own scroll instead of a frame late. The element is moved into a track
   * of its own while it plays, so leave this off on a page a framework renders
   * (React, Vue): it would find the element gone from where it put it. Off by default
   */
  sticky?: boolean;
  /** with smooth scrolling, keep sideways swipes from reaching the browser (which may read them as "back"); off by default */
  holdSideways?: boolean;
  navigate?: (target: string, ix?: Interaction) => void;
  back?: (ix?: Interaction) => void;
  overlay?: (target: string, ix: Interaction) => void;
  swap?: (target: string, ix: Interaction) => void;
  close?: (ix: Interaction) => void;
  /**
   * A custom action's trigger fired (`start`): do what `name` says. Held by
   * hovering or pressing, it hears `end` when that stops, to undo itself.
   * Without this option, custom actions do nothing.
   */
  custom?: (name: string, data: unknown, ix: Interaction, phase: 'start' | 'end') => void;
  /** plugins mounted with the engine (scrollwork/fx); each sees every frame */
  plugins?: Plugin[];
}

export interface MotionControl {
  /** stop everything and give every element back as it was */
  stop(): void;
  /**
   * The state at a scroll position, with a viewport this tall (seek mode).
   * Without a clock an appear is shown finished once its trigger has arrived.
   * With one (`performance.now()`), an appear that arrives plays in time from
   * that moment, and leaving its start resets it; seek again each frame while
   * this returns true, which says something is still in flight. `bottom` is
   * the furthest the page scrolls (the root's height less the screen when
   * unset): there, every appear whose trigger is on screen plays.
   */
  seek(y: number, height: number, now?: number, bottom?: number): boolean;
  /** back to the top, every appear ready to play again */
  replay(): void;
}
