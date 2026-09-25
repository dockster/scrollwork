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
  /** degrees */
  rotate: number;
  /** 0 to 1, multiplies the element's own opacity */
  opacity: number;
  /** px */
  blur: number;
}

/** Named curves. `smooth` is cubic-bezier(0.87, 0, 0.13, 1); `back` eases out past the end and settles. */
export type MotionEase = 'smooth' | 'out' | 'in-out' | 'expo' | 'back' | 'linear' | 'in' | 'in-back' | 'in-out-back';

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
export type InteractionTrigger = 'none' | 'click' | 'drag' | 'hover' | 'press' | 'key' | 'mouseenter' | 'mouseleave' | 'mousedown' | 'mouseup' | 'delay';

export type OverlayPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * What an interaction does. `change` moves the element to a state; the
 * screen actions (navigate, back, overlay, swap, close) hand their target to
 * the matching option of `start()`; `scroll` glides the page to an element;
 * `url` opens a web or mail address.
 */
export type InteractionAction =
  | { type: 'none' }
  | { type: 'navigate'; frameId: string }
  | { type: 'change'; state: MotionState }
  | { type: 'back' }
  | { type: 'scroll'; targetId: string }
  | { type: 'url'; url: string; newTab: boolean }
  | { type: 'overlay'; frameId: string; position: OverlayPosition; closeOnOutside: boolean; background: boolean }
  | { type: 'swap'; frameId: string }
  | { type: 'close' };

export type TransitionType = 'instant' | 'dissolve' | 'smart' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out';
export type TransitionDirection = 'left' | 'right' | 'top' | 'bottom';

/** How an interaction moves: instantly, or along a curve (named, or a custom cubic bezier). */
export interface InteractionAnimation {
  kind: 'instant' | 'animate';
  curve: MotionEase | 'custom';
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
  /** seconds before the action starts */
  delay: number;
  action: InteractionAction;
  animation: InteractionAnimation;
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
  /** with smooth scrolling, keep sideways swipes from reaching the browser (which may read them as "back"); off by default */
  holdSideways?: boolean;
  navigate?: (target: string, ix?: Interaction) => void;
  back?: (ix?: Interaction) => void;
  overlay?: (target: string, ix: Interaction) => void;
  swap?: (target: string, ix: Interaction) => void;
  close?: (ix: Interaction) => void;
}

export interface MotionControl {
  /** stop everything and give every element back as it was */
  stop(): void;
  /** the state at a scroll position, with a viewport this tall (seek mode) */
  seek(y: number, height: number): void;
  /** back to the top, every appear ready to play again */
  replay(): void;
}
