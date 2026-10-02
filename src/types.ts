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

export type AppearEffect = 'fade' | 'slide-up' | 'mask' | 'blur' | 'scale' | 'custom';
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
}

export type ScrollRange = 'through' | 'in' | 'out';

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
}

/** Pin: the element holds its place on screen for a stretch of scrolling. */
export interface PinMotion {
  /** px of scrolling it stays in place */
  distance: number;
  /** px from the top of the viewport where it holds */
  top: number;
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

export type TransitionType = 'instant' | 'dissolve' | 'smart' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out';
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
  interactions?: Interaction[];
  /** effects played by a plugin given to `start()` (scrollwork/fx); nothing without one */
  fx?: FxSpec[];
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
   * this returns true, which says something is still in flight.
   */
  seek(y: number, height: number, now?: number): boolean;
  /** back to the top, every appear ready to play again */
  replay(): void;
}
