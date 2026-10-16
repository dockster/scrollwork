// The surface: one WebGL2 context for a whole root, drawing every effect host
// in turn. Each host gets a small canvas of its own inside it (a bitmap
// renderer, which costs no GL context) and receives its frame as an image
// bitmap, so the effect sits exactly where the host is, under the host's
// border radius and in its stacking order, and the page's own layout, scroll
// and transforms carry it. Browsers allow about sixteen live WebGL contexts;
// this uses one.
//
// Without WebGL2, OffscreenCanvas or the bitmap renderer, createSurface()
// returns null and the page shows its pictures as they are.

import { program, setUniforms, texture, triangle, type Program } from './gl.js';
import { GLITCH } from './shaders/glitch.js';
import { DITHER } from './shaders/dither.js';
import { DISTORT } from './shaders/distort.js';
import { BULGE } from './shaders/bulge.js';
import { rgbaOf } from './spec.js';
import type { BulgeFx, DistortFx, Fx, FxType, TexState } from './types.js';
import type { Signals } from '../types.js';

export interface SurfaceOptions {
  win: Window;
  /** extra scale on every bitmap (a design canvas's zoom); 1 when unset */
  scale?: () => number;
  /** hosts drawn per frame at most; the rest show their picture as it is (default 32) */
  limit?: number;
  /** longest side of a bitmap, px (default 2048) */
  maxTexture?: number;
  /** the reader asked for less motion: no effect draws, every host shows its picture */
  reduced?: () => boolean;
  /** something changed that needs a frame (the pointer moved over a host) */
  wake?: () => void;
  warn?: (message: string) => void;
}

export interface Host {
  el: HTMLElement;
  fx: Fx[];
  /** the canvas inside the host that shows the frames */
  view: HTMLCanvasElement;
  bmr: ImageBitmapRenderingContext;
  tex: WebGLTexture | null;
  texState: TexState;
  /** the picture's size, for fitting */
  tw: number;
  th: number;
  fit: 'cover' | 'contain';
  /** the host's CSS size */
  w: number;
  h: number;
  visible: boolean;
  /** hover 0..1, approaching hoverTo over the first effect's in/out seconds */
  hover: number;
  hoverTo: number;
  /** the pointer within the host, 0..1 */
  px: number;
  py: number;
  /** where the pointer was a moment ago (the trail's tail), 0..1 */
  lx: number;
  ly: number;
  /** drawn one bitmap pixel per CSS pixel and scaled up without smoothing (dither's dots) */
  crisp: boolean;
  /** follows the pointer anywhere over it, even under what covers it (a field drawn behind the page) */
  field: boolean;
  /** the clock when it was added: each host's time starts at 0 */
  t0: number;
  shown: boolean;
  /** a pixel distortion's grid, when the host has one (distort) */
  dist: Distortion | null;
  /** the pointer is over it (tracked for a distortion, even under what covers it) */
  inside: boolean;
  /** a bulge, when the host has one: its dome follows the eased pointer (lx, ly) */
  bulge: BulgeFx | null;
  /** its words are its picture: drawn into a bitmap of its size (a text host with a bulge) */
  text: boolean;
  /** when a real pointer last moved over it (performance.now()); a bulge sweeps on its own until one does */
  real: number;
  /** what to undo on stop */
  position: string | null;
  /** a field's host is isolated so its view can sit behind its children; the inline value it had */
  isolation: string | null;
  off: Array<() => void>;
}

/**
 * A pixel distortion's state (after Codrops' Distorted Pixels, MIT): a
 * size x size grid of x, y offsets, uploaded as an RG32F texture each frame it
 * moves, and the pointer's last move, in host fractions.
 */
export interface Distortion {
  fx: DistortFx;
  size: number;
  /** x, y per cell, row by row from the bottom */
  data: Float32Array;
  tex: WebGLTexture | null;
  /** the texture holds a grid of this size */
  texSize: number;
  vx: number;
  vy: number;
  /** the pointer's last position over the host, for its velocity; null after it left */
  prev: [number, number] | null;
  /** nothing is offset and nothing pushes: the picture shows as it is */
  settled: boolean;
  /** when a real pointer last moved over it (performance.now()); the sweep waits a moment after */
  real: number;
  /** the sweep's last point and its clock, seconds; null when it did not run the frame before */
  sweep: [number, number, number] | null;
}

/** ms after a real pointer's last move before the sweep takes over again */
const REAL = 600;

/**
 * Where the sweep is at t seconds: a slow Lissajous path across the middle of
 * the picture, its phase set by the seed, standing in for a pointer when none
 * moves (on always, on scroll, and when the host is hovered or played without
 * one), so the cells have something to follow.
 */
export const sweepAt = (seed: number, t: number): [number, number] => {
  const ph = seed * 1.7;
  return [0.5 + 0.36 * Math.sin(t * 1.9 + ph), 0.5 + 0.3 * Math.sin(t * 2.7 + ph * 0.6 + 1.3)];
};

/** offsets smaller than this are nothing (0.02 of it is under a thousandth of the picture) */
const REST = 0.02;

/** A small seeded random, so the opening scramble is the same for a seed. */
const seeded = (seed: number) => {
  let t = (seed * 2654435761) >>> 0 || 1;
  return () => {
    t ^= t << 13;
    t ^= t >>> 17;
    t ^= t << 5;
    return (t >>> 0) / 4294967296;
  };
};

/**
 * A grid for a distortion. On `appear` it opens scrambled, every cell pushed
 * at random as Codrops' regenerateGrid does, and settles into the picture as
 * the host comes into view; otherwise it starts at rest.
 */
const distortion = (fx: DistortFx): Distortion => {
  const size = fx.grid;
  const data = new Float32Array(size * size * 2);
  if (fx.on === 'appear') {
    const rnd = seeded(fx.seed + 1);
    for (let i = 0; i < data.length; i++) data[i] = rnd() * 255 - 125;
  }
  return { fx, size, data, tex: null, texSize: 0, vx: 0, vy: 0, prev: null, settled: fx.on !== 'appear', real: -1e9, sweep: null };
};

/**
 * One frame of a distortion: every offset relaxes, the cells within the
 * pointer's reach are pushed along its last move (k: how far the effect is
 * driven), and the move fades. The original's numbers, at 60 frames a second:
 * `speed` runs its clock faster or slower. True while anything is offset.
 */
export function stepDistortion(d: Distortion, k: number, px: number, py: number, aspect: number, dt: number): boolean {
  const { fx, size, data } = d;
  const frames = (Math.min(dt, 100) / (1000 / 60)) * fx.speed;
  const keep = Math.pow(fx.relaxation, frames);
  let most = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] *= keep);
    const a = v < 0 ? -v : v;
    if (a > most) most = a;
  }
  const push = fx.strength * fx.intensity * k * 100;
  const moving = Math.abs(d.vx) + Math.abs(d.vy) > 1e-5;
  if (push > 0 && moving) {
    const gx = size * px;
    const gy = size * (1 - py);
    const reach = size * fx.mouse;
    const reach2 = reach * reach;
    // only the cells that can be within reach: the box around the pointer, the x reach widened by the aspect
    const rx = Math.ceil(reach * Math.sqrt(Math.max(aspect, 1e-6)));
    const i0 = Math.max(0, Math.floor(gx - rx));
    const i1 = Math.min(size - 1, Math.ceil(gx + rx));
    const j0 = Math.max(0, Math.floor(gy - reach));
    const j1 = Math.min(size - 1, Math.ceil(gy + reach));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const dist = (gx - i) ** 2 / aspect + (gy - j) ** 2;
        if (dist >= reach2) continue;
        const power = Math.min(10, Math.max(0, reach / Math.sqrt(dist)));
        const at = 2 * (i + size * j);
        data[at] += push * d.vx * power;
        data[at + 1] -= push * d.vy * power;
        const a = Math.max(Math.abs(data[at]), Math.abs(data[at + 1]));
        if (a > most) most = a;
      }
    }
  }
  const fade = Math.pow(0.9, frames);
  d.vx *= fade;
  d.vy *= fade;
  if (most < REST && !(Math.abs(d.vx) + Math.abs(d.vy) > 1e-5 && push > 0)) {
    data.fill(0);
    d.vx = d.vy = 0;
    d.settled = true;
    return false;
  }
  d.settled = false;
  return true;
}

export interface Surface {
  add(el: HTMLElement, fx: Fx[]): Host | null;
  remove(el: HTMLElement): void;
  /** draw every host that needs it; true while something is still in flight */
  draw(now: number, dt: number, read: (el: HTMLElement) => Signals): boolean;
  pause(on: boolean): void;
  /** sizes or the scale changed: every bitmap is measured again on the next frame */
  refresh(): void;
  stop(): void;
  readonly hosts: ReadonlyMap<HTMLElement, Host>;
}

const SHADERS: Record<FxType, string> = { glitch: GLITCH, dither: DITHER, distort: DISTORT, bulge: BULGE };
/** effects that leave the picture as it is at k 0: at rest the host's own picture shows and nothing draws */
const IDLE_IDENTITY: Record<FxType, boolean> = { glitch: true, dither: false, distort: true, bulge: true };
const STYLE = '.ux-motion-fx{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;display:block}.ux-motion-fx.is-crisp{image-rendering:pixelated}.ux-motion-fx.is-field{z-index:-1}.ux-motion-fx-text,.ux-motion-fx-text *{-webkit-text-fill-color:transparent!important;text-shadow:none!important}';
/** hosts that cannot hold a child canvas */
const NO_CHILD = /^(IMG|VIDEO|CANVAS|INPUT|TEXTAREA|SELECT|svg|IFRAME|BR|HR)$/;

/** the first url() of a background-image, or '' */
const urlIn = (bg: string): string => {
  const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(bg);
  return m ? m[1] : '';
};

export function createSurface(o: SurfaceOptions): Surface | null {
  const win = o.win;
  const doc = win.document;
  // the window's constructors, typed as the global ones (a Window type has no OffscreenCanvas of its own)
  const g = win as unknown as typeof globalThis;
  if (typeof g.OffscreenCanvas === 'undefined' || typeof g.ImageBitmapRenderingContext === 'undefined') return null;
  const off = new g.OffscreenCanvas(1, 1);
  const gl = off.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  // the view canvases are bitmap renderers: proven once here, before any host is touched
  const probe = doc.createElement('canvas');
  if (!probe.getContext('bitmaprenderer')) return null;

  const warn = o.warn || ((m: string) => typeof console !== 'undefined' && console.warn(m));
  const scale = o.scale || (() => 1);
  const limit = o.limit ?? 32;
  const maxTexture = o.maxTexture ?? 2048;
  const wake = o.wake || (() => {});
  const hosts = new Map<HTMLElement, Host>();
  let paused = false;
  let lost = false;
  let stopped = false;

  // one stylesheet per document, left in place: another surface on the page shares it
  if (!doc.querySelector('style[data-scrollwork-fx]')) {
    const st = doc.createElement('style');
    st.setAttribute('data-scrollwork-fx', '');
    st.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(st);
  }

  // ── GL state: programs by effect, the triangle, two textures to stack effects through ──
  let programs = new Map<FxType, Program>();
  let vao = triangle(gl);
  type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
  let targets: Target[] = [];
  const programFor = (type: FxType): Program | null => {
    let p = programs.get(type);
    if (p) return p;
    try {
      p = program(gl, SHADERS[type]) || undefined;
    } catch (err) {
      warn(String(err));
      return null;
    }
    if (p) programs.set(type, p);
    return p || null;
  };
  /** a texture to draw into, sized to the host, for every effect but the last of a stack */
  const target = (i: number, w: number, h: number): Target | null => {
    let t = targets[i];
    if (!t) {
      const tex = texture(gl);
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) return null;
      t = targets[i] = { tex, fbo, w: 0, h: 0 };
    }
    if (t.w !== w || t.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      t.w = w;
      t.h = h;
    }
    return t;
  };

  off.addEventListener('webglcontextlost', (ev: Event) => {
    ev.preventDefault();
    lost = true;
    for (const h of hosts.values()) hide(h);
  });
  off.addEventListener('webglcontextrestored', () => {
    lost = false;
    programs = new Map();
    targets = [];
    vao = triangle(gl);
    for (const h of hosts.values()) {
      h.tex = null;
      h.texState = 'none';
      if (h.dist) h.dist.tex = null;
      loadPicture(h);
    }
    wake();
  });

  // ── the picture each host shows, uploaded once ──
  const loadPicture = (h: Host) => {
    const cs = win.getComputedStyle(h.el);
    let bg = cs.backgroundImage;
    let size = cs.backgroundSize;
    if (bg === 'none') {
      // a picture drawn by a pseudo-element (uxdeck's adjusted images)
      const before = win.getComputedStyle(h.el, '::before');
      bg = before.backgroundImage;
      size = before.backgroundSize;
    }
    const url = urlIn(bg);
    h.fit = size === 'contain' ? 'contain' : 'cover';
    if (!url && h.bulge && (h.el.textContent || '').trim()) {
      // its words are drawn once the page's fonts are in (renderHost draws them at the bitmap's size)
      h.text = true;
      h.tw = 0;
      h.texState = fontsIn ? 'ready' : 'loading';
      return;
    }
    if (!url) {
      h.texState = 'none';
      return;
    }
    h.texState = 'loading';
    const img = new g.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (stopped || lost) return;
      try {
        const tex = h.tex || texture(gl);
        if (!tex) throw new Error('no texture');
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        h.tex = tex;
        h.tw = img.naturalWidth;
        h.th = img.naturalHeight;
        h.texState = 'ready';
      } catch {
        // a picture served without CORS cannot be read: the host keeps it as it is
        h.texState = 'failed';
      }
      wake();
    };
    img.onerror = () => {
      h.texState = 'failed';
    };
    img.src = url;
  };

  // ── a text host's words, drawn into its picture ──
  // Each word is drawn where the page laid it out (a range's box), in its own element's font, colour and
  // letter spacing, so the lines break as they do on the page; nothing is read from other origins.
  let fontsIn = !doc.fonts;
  const textIn = () => {
    for (const h of hosts.values())
      if (h.text) {
        h.tw = 0;
        h.texState = 'ready';
      }
    wake();
  };
  if (doc.fonts) {
    doc.fonts.ready.then(() => {
      fontsIn = true;
      textIn();
    });
    doc.fonts.addEventListener('loadingdone', textIn);
  }
  const caseOf = (t: string, how: string) => (how === 'uppercase' ? t.toUpperCase() : how === 'lowercase' ? t.toLowerCase() : how === 'capitalize' ? t.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase()) : t);
  const drawText = (h: Host, w: number, hh: number): boolean => {
    const b = h.el.getBoundingClientRect();
    const cw = h.el.offsetWidth;
    const ch = h.el.offsetHeight;
    if (!b.width || !b.height || !cw || !ch) return false;
    const c = new g.OffscreenCanvas(w, hh);
    const x = c.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!x) return false;
    // drawn in the element's own CSS px (its font sizes are), from boxes measured on screen (a zoomed canvas, a scaled preview)
    const zx = b.width / cw;
    const zy = b.height / ch;
    x.scale(w / cw, hh / ch);
    const range = doc.createRange();
    const walk = doc.createTreeWalker(h.el, 4);
    for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
      const el = t.parentElement;
      if (!el) continue;
      const cs = win.getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      x.fillStyle = cs.color;
      (x as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      x.textBaseline = 'alphabetic';
      const re = /\S+/g;
      for (let m = re.exec(t.data); m; m = re.exec(t.data)) {
        range.setStart(t, m.index);
        range.setEnd(t, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || !r.width) continue;
        const word = caseOf(m[0], cs.textTransform);
        const mt = x.measureText(word);
        const asc = mt.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8;
        const desc = mt.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.2;
        x.fillText(word, (r.left - b.left) / zx, (r.top - b.top) / zy + (r.height / zy - asc - desc) / 2 + asc);
      }
    }
    try {
      const tex = h.tex || texture(gl);
      if (!tex) return false;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      h.tex = tex;
      h.tw = w;
      h.th = hh;
      return true;
    } catch {
      return false;
    }
  };

  // ── watching hosts: on screen or not, resized ──
  const io =
    typeof g.IntersectionObserver === 'function'
      ? new g.IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              const h = hosts.get(en.target as HTMLElement);
              if (h) h.visible = en.isIntersecting;
            }
            wake();
          },
          { rootMargin: '10%' }
        )
      : null;
  const ro =
    typeof g.ResizeObserver === 'function'
      ? new g.ResizeObserver((entries) => {
          for (const en of entries) {
            const h = hosts.get(en.target as HTMLElement);
            if (!h) continue;
            const r = en.contentRect;
            h.w = r.width;
            h.h = r.height;
          }
          wake();
        })
      : null;
  const dpr = () => win.devicePixelRatio || 1;
  let dprQuery = win.matchMedia ? win.matchMedia(`(resolution: ${dpr()}dppx)`) : null;
  const onDpr = () => {
    dprQuery?.removeEventListener('change', onDpr);
    dprQuery = win.matchMedia(`(resolution: ${dpr()}dppx)`);
    dprQuery.addEventListener('change', onDpr);
    wake();
  };
  dprQuery?.addEventListener('change', onDpr);
  const onVisibility = () => !doc.hidden && wake();
  doc.addEventListener('visibilitychange', onVisibility);

  // A field is usually drawn behind the page's words and pictures, which take
  // the pointer's events: it follows the pointer over the whole window instead.
  // So does a distortion, whose picture often has words or a shade laid over it.
  let pointerOn = false;
  const onPointer = (ev: PointerEvent) => {
    for (const h of hosts.values()) {
      const d = h.dist;
      if (!(h.field || d || h.bulge) || !h.visible) continue;
      const b = h.el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const x = (ev.clientX - b.left) / b.width;
      const y = (ev.clientY - b.top) / b.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (d) {
        // pushed by the pointer's move since its last event, in host fractions
        if (inside) {
          // a move, not the pointer arriving: it takes over from the sweep (a click on a host app's
          // play button over the picture does not)
          if (d.prev && (x !== d.prev[0] || y !== d.prev[1])) {
            d.vx = x - d.prev[0];
            d.vy = y - d.prev[1];
            d.settled = false;
            d.real = win.performance.now();
          }
          h.px = x;
          h.py = y;
          h.hoverTo = 1;
        } else if (h.inside && !h.el.contains(doc.activeElement)) h.hoverTo = 0;
        // leaving and coming back is not a move across the gap
        d.prev = inside ? [x, y] : null;
        h.inside = inside;
      } else if (h.bulge) {
        // a bulge on a text: its words often take no pointer of their own (a design tool's preview), so it
        // follows the pointer over its box, as a distortion does
        if (inside) {
          if (h.hover === 0 && h.hoverTo === 0) {
            h.lx = x;
            h.ly = y;
          }
          h.px = x;
          h.py = y;
          h.hoverTo = 1;
          h.real = win.performance.now();
        } else if (h.inside && !h.el.contains(doc.activeElement)) h.hoverTo = 0;
        h.inside = inside;
      }
      if (!h.field) continue;
      if (inside) {
        // coming back in: the trail starts where the pointer is, not where it left
        if (h.hoverTo === 0 && h.hover === 0) {
          h.lx = x;
          h.ly = y;
        }
        h.px = x;
        h.py = y;
      }
      h.hoverTo = inside ? 1 : 0;
    }
    wake();
  };
  const onPointerOut = (ev: PointerEvent) => {
    // left the window altogether
    if (ev.relatedTarget) return;
    for (const h of hosts.values())
      if (h.field || h.dist || h.bulge) {
        h.hoverTo = 0;
        h.inside = false;
        if (h.dist) h.dist.prev = null;
      }
    wake();
  };
  const listenPointer = () => {
    if (pointerOn) return;
    pointerOn = true;
    win.addEventListener('pointermove', onPointer, { passive: true });
    doc.addEventListener('pointerout', onPointerOut);
  };

  // a text host's own words are hidden only while its bulge is drawn over them (they stay in the page)
  const show = (h: Host) => {
    if (h.shown) return;
    h.view.style.display = '';
    if (h.text) h.el.classList.add('ux-motion-fx-text');
    h.shown = true;
  };
  const hide = (h: Host) => {
    if (!h.shown) return;
    h.view.style.display = 'none';
    h.el.classList.remove('ux-motion-fx-text');
    h.shown = false;
  };

  /** how far an effect is driven this frame, 0 to 1 */
  const drive = (fx: Fx, h: Host, s: Signals): number => {
    switch (fx.on) {
      case 'hover':
        return h.hover;
      case 'appear':
        return 1 - s.appear;
      case 'scroll':
        return Math.min(1, Math.abs(s.velocity) / 1200);
      default:
        return 1;
    }
  };

  /** the bitmap's size for a host: its CSS size at device and extra scale, kept within the cap */
  const bitmapSize = (h: Host): [number, number] => {
    const k = (h.crisp ? 1 : dpr()) * scale();
    let w = Math.round(h.w * k);
    let hh = Math.round(h.h * k);
    const m = Math.max(w, hh);
    if (m > maxTexture) {
      w = Math.round((w * maxTexture) / m);
      hh = Math.round((hh * maxTexture) / m);
    }
    return [Math.max(1, w), Math.max(1, hh)];
  };

  const fitOf = (h: Host, w: number, hh: number): [number, number] => {
    if (!h.tw || !h.th) return [1, 1];
    const ta = h.tw / h.th;
    const ha = w / hh;
    const wide = ta > ha;
    if (h.fit === 'contain') return wide ? [1, ta / ha] : [ha / ta, 1];
    return wide ? [ha / ta, 1] : [1, ta / ha];
  };

  /** a distortion's grid uploaded, as RG32F (WebGL2 samples float textures when nearest-filtered), on texture unit 1 */
  const offsets = (d: Distortion, p: Program) => {
    gl.activeTexture(gl.TEXTURE1);
    if (!d.tex) {
      d.tex = gl.createTexture();
      d.texSize = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, d.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (d.texSize !== d.size) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, d.size, d.size, 0, gl.RG, gl.FLOAT, d.data);
      d.texSize = d.size;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, d.size, d.size, gl.RG, gl.FLOAT, d.data);
    const loc = p.uniforms.get('u_offsets');
    if (loc) gl.uniform1i(loc, 1);
    gl.activeTexture(gl.TEXTURE0);
  };

  const renderHost = (h: Host, ks: number[], now: number): boolean => {
    const [w, hh] = bitmapSize(h);
    if (off.width !== w || off.height !== hh) {
      off.width = w;
      off.height = hh;
    }
    if (h.text && (h.tw !== w || h.th !== hh) && !drawText(h, w, hh)) return false;
    gl.viewport(0, 0, w, hh);
    gl.bindVertexArray(vao);
    const fit = fitOf(h, w, hh);
    const t = (now - h.t0) / 1000;
    let source = h.tex;
    for (let i = 0; i < h.fx.length; i++) {
      const fx = h.fx[i];
      const p = programFor(fx.type);
      if (!p) return false;
      const last = i === h.fx.length - 1;
      const tgt = last ? null : target(i % 2, w, hh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null);
      gl.useProgram(p.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      const uni = p.uniforms.get('u_tex');
      if (uni) gl.uniform1i(uni, 0);
      if (fx.type === 'distort' && h.dist) offsets(h.dist, p);
      const values: Record<string, number | readonly number[]> = {
        u_res: [w, hh],
        u_fit: i === 0 ? fit : [1, 1],
        u_pointer: [h.px, h.py],
        u_lag: [h.lx, h.ly],
        u_hover: h.hover,
        u_unit: h.w ? w / h.w : 1,
        u_hasTex: i === 0 ? (h.texState === 'ready' ? 1 : 0) : 1,
        u_time: t,
        u_k: ks[i],
        u_seed: fx.seed,
        u_intensity: fx.intensity,
        u_speed: fx.speed,
      };
      for (const key in fx) {
        const v = (fx as unknown as Record<string, unknown>)[key];
        if (typeof v === 'number' && !(key in values) && key !== 'seed' && key !== 'intensity' && key !== 'speed') values['u_' + key] = v;
        else if (typeof v === 'string' && key !== 'type' && key !== 'on') {
          // a colour as four numbers; a choice as its place in the list (mode: bayer 0, halftone 1)
          const c = rgbaOf(v);
          values['u_' + key] = c || (v === 'halftone' ? 1 : 0);
        }
      }
      setUniforms(gl, p, values);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (tgt) source = tgt.tex;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // the view's own size follows the bitmap's: a bitmap renderer keeps its element's size otherwise
    if (h.view.width !== w || h.view.height !== hh) {
      h.view.width = w;
      h.view.height = hh;
    }
    h.bmr.transferFromImageBitmap(off.transferToImageBitmap());
    return true;
  };

  const approach = (p: number, to: number, seconds: number, dt: number) => {
    if (seconds <= 0) return to;
    const step = dt / (seconds * 1000);
    return p < to ? Math.min(to, p + step) : Math.max(to, p - step);
  };

  return {
    hosts,
    add(el, fx) {
      if (stopped || !fx.length || hosts.has(el) || NO_CHILD.test(el.tagName)) return null;
      const view = doc.createElement('canvas');
      view.className = 'ux-motion-fx';
      view.setAttribute('aria-hidden', 'true');
      view.style.display = 'none';
      const bmr = view.getContext('bitmaprenderer');
      if (!bmr) return null;
      const cs = win.getComputedStyle(el);
      let position: string | null = null;
      if (cs.position === 'static') {
        position = el.style.position;
        el.style.position = 'relative';
      }
      // A field (dither) fills a box whose children are the page's content: its
      // view goes behind them and over the box's own fill. The host is isolated
      // so the view cannot fall behind the host itself. A picture effect draws
      // over its picture, which has no children to cover.
      const field = fx.some((f) => f.type === 'dither');
      let isolation: string | null = null;
      if (field) {
        view.classList.add('is-crisp', 'is-field');
        if (cs.isolation !== 'isolate') {
          isolation = el.style.isolation;
          el.style.isolation = 'isolate';
        }
        el.insertBefore(view, el.firstChild);
      } else el.appendChild(view);
      const r = el.getBoundingClientRect();
      const h: Host = {
        el,
        fx,
        view,
        bmr,
        tex: null,
        texState: 'none',
        tw: 0,
        th: 0,
        fit: 'cover',
        w: r.width,
        h: r.height,
        visible: !io,
        hover: 0,
        hoverTo: 0,
        px: 0.5,
        py: 0.5,
        lx: 0.5,
        ly: 0.5,
        crisp: fx.some((f) => f.type === 'dither'),
        field: fx.some((f) => f.type === 'dither'),
        t0: win.performance.now(),
        dist: null,
        bulge: fx.find((f): f is BulgeFx => f.type === 'bulge') || null,
        text: false,
        real: -1e9,
        inside: false,
        shown: false,
        position,
        isolation,
        off: [],
      };
      const on = (type: string, fn: (ev: Event) => void) => {
        el.addEventListener(type, fn);
        h.off.push(() => el.removeEventListener(type, fn));
      };
      // a real pointer over it (not focus, not an event a host app sent): a distortion waits for it to move
      const enter = (ev: Event) => {
        if (ev.isTrusted && ev.type === 'pointerenter') h.inside = true;
        h.hoverTo = 1;
        wake();
      };
      const leave = (ev: Event) => {
        if (ev.isTrusted && ev.type === 'pointerleave') h.inside = false;
        h.hoverTo = 0;
        wake();
      };
      // A field fills the box as it shows: a host that scrolls (a carousel)
      // would carry an absolute view off with its content, so the view follows
      // the scroll and stays where the box is (the Aspen team cards, 1.9.2)
      if (field) {
        const hold = () => {
          view.style.translate = el.scrollLeft || el.scrollTop ? `${el.scrollLeft}px ${el.scrollTop}px` : '';
        };
        on('scroll', hold);
        hold();
      }
      on('pointerenter', enter);
      on('pointerleave', leave);
      // keyboard focus gets the same effect as the pointer
      on('focusin', enter);
      on('focusout', leave);
      const distortFx = fx.find((f): f is DistortFx => f.type === 'distort');
      if (distortFx) h.dist = distortion(distortFx);
      on('pointermove', (ev) => {
        const e = ev as PointerEvent;
        const b = el.getBoundingClientRect();
        if (b.width && b.height) {
          h.px = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
          h.py = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
          if (h.bulge && e.isTrusted) {
            // coming in from rest, the dome rises where the pointer is rather than sliding from the last place
            if (h.hover === 0) {
              h.lx = h.px;
              h.ly = h.py;
            }
            h.real = win.performance.now();
          }
        }
        wake();
      });
      hosts.set(el, h);
      if (h.field || h.dist || h.bulge) listenPointer();
      io?.observe(el);
      ro?.observe(el);
      loadPicture(h);
      return h;
    },
    remove(el) {
      const h = hosts.get(el);
      if (!h) return;
      hosts.delete(el);
      io?.unobserve(el);
      ro?.unobserve(el);
      for (const f of h.off) f();
      h.view.remove();
      el.classList.remove('ux-motion-fx-text');
      if (h.tex) gl.deleteTexture(h.tex);
      if (h.dist?.tex) gl.deleteTexture(h.dist.tex);
      if (h.position !== null) el.style.position = h.position;
      if (h.isolation !== null) el.style.isolation = h.isolation;
    },
    draw(now, dt, read) {
      if (stopped || lost || paused) return false;
      const reduced = o.reduced ? o.reduced() : false;
      let moving = false;
      let drawn = 0;
      for (const h of hosts.values()) {
        if (h.hover !== h.hoverTo) {
          h.hover = approach(h.hover, h.hoverTo, h.hoverTo > h.hover ? h.fx[0].in : h.fx[0].out, dt);
          if (h.hover !== h.hoverTo) moving = true;
        }
        // a bulge with no pointer moving it (always, on scroll or appear, or hovered without one: keyboard
        // focus, a design tool's play) sweeps on its own path, as a distortion does; a real pointer takes over
        const bf = h.bulge;
        if (bf && now - h.real > REAL && (bf.on !== 'hover' || (h.hoverTo > 0 && !h.inside))) {
          [h.px, h.py] = sweepAt(bf.seed, ((now - h.t0) / 1000) * bf.speed * 0.6);
          if (h.hover > 0 || bf.on !== 'hover') moving = true;
        }
        if ((h.field || bf) && (h.lx !== h.px || h.ly !== h.py)) {
          // the trail's tail catches up with the pointer over `trail` seconds (a bulge's dome is that tail)
          const lag = (h.fx.find((f) => f.type === 'dither' || f.type === 'bulge') as { trail?: number } | undefined)?.trail ?? 0.35;
          const keep = lag > 0 ? Math.pow(0.01, dt / (lag * 1000)) : 0;
          h.lx = h.px + (h.lx - h.px) * keep;
          h.ly = h.py + (h.ly - h.py) * keep;
          if (Math.abs(h.lx - h.px) + Math.abs(h.ly - h.py) < 0.0005) {
            h.lx = h.px;
            h.ly = h.py;
          } else moving = true;
        }
        if (reduced || !h.visible || !h.w || !h.h || h.texState === 'failed' || h.texState === 'loading' || doc.hidden) {
          hide(h);
          continue;
        }
        const s = read(h.el);
        // a distortion is drawn while its grid is offset; the drive decides how hard the pointer pushes it
        const ks = h.fx.map((f) => {
          const k = drive(f, h, s);
          const d = h.dist;
          if (f.type !== 'distort' || !d) return k;
          let x = h.px;
          let y = h.py;
          // No pointer moving it: on always, on scroll, or hovered without one (keyboard focus, a host
          // app's play), the sweep moves it instead; a real pointer takes over while it moves
          if (now - d.real > REAL && (f.on === 'always' || f.on === 'scroll' || (f.on === 'hover' && h.hoverTo > 0 && !h.inside))) {
            const t = ((now - h.t0) / 1000) * f.speed;
            [x, y] = sweepAt(f.seed, t);
            const was = d.sweep;
            // a jump in its clock (a held host let go, a host back on screen) is not a move
            // pushed twice as hard as a pointer at its pace would: a calm path that still reads at a glance
            if (was && t >= was[2] && t - was[2] < 0.25) {
              d.vx = (x - was[0]) * 2;
              d.vy = (y - was[1]) * 2;
            }
            d.sweep = [x, y, t];
            // its first frame has no move yet: the next one will
            if (k > 0) moving = true;
          } else d.sweep = null;
          stepDistortion(d, k, x, y, h.w ? h.h / h.w : 1, dt);
          return d.settled ? 0 : 1;
        });
        // at rest the picture itself shows: nothing to draw, nothing to keep awake
        if (ks.every((k, i) => k <= 0 && IDLE_IDENTITY[h.fx[i].type])) {
          hide(h);
          continue;
        }
        if (drawn >= limit) {
          hide(h);
          continue;
        }
        drawn++;
        if (renderHost(h, ks, now)) {
          show(h);
          // its pattern moves with time while it is driven at all
          moving = true;
        } else hide(h);
      }
      return moving;
    },
    pause(on) {
      paused = on;
      if (!on) wake();
    },
    refresh() {
      for (const h of hosts.values()) {
        const r = h.el.getBoundingClientRect();
        if (r.width && r.height) {
          h.w = r.width / (scale() || 1);
          h.h = r.height / (scale() || 1);
        }
      }
      wake();
    },
    stop() {
      stopped = true;
      for (const el of Array.from(hosts.keys())) this.remove(el);
      io?.disconnect();
      ro?.disconnect();
      if (pointerOn) {
        win.removeEventListener('pointermove', onPointer);
        doc.removeEventListener('pointerout', onPointerOut);
      }
      dprQuery?.removeEventListener('change', onDpr);
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const t of targets) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      for (const p of programs.values()) gl.deleteProgram(p.prog);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };
}
