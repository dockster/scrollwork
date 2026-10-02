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
import type { Fx, FxType, TexState } from './types.js';
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
  /** the clock when it was added: each host's time starts at 0 */
  t0: number;
  shown: boolean;
  /** what to undo on stop */
  position: string | null;
  off: Array<() => void>;
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

const SHADERS: Record<FxType, string> = { glitch: GLITCH };
/** effects that leave the picture as it is at k 0: at rest the host's own picture shows and nothing draws */
const IDLE_IDENTITY: Record<FxType, boolean> = { glitch: true };
const STYLE = '.ux-motion-fx{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;display:block}';
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

  const show = (h: Host) => {
    if (h.shown) return;
    h.view.style.display = '';
    h.shown = true;
  };
  const hide = (h: Host) => {
    if (!h.shown) return;
    h.view.style.display = 'none';
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
    const k = dpr() * scale();
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

  const renderHost = (h: Host, ks: number[], now: number): boolean => {
    const [w, hh] = bitmapSize(h);
    if (off.width !== w || off.height !== hh) {
      off.width = w;
      off.height = hh;
    }
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
      const values: Record<string, number | [number, number]> = {
        u_res: [w, hh],
        u_fit: i === 0 ? fit : [1, 1],
        u_pointer: [h.px, h.py],
        u_time: t,
        u_k: ks[i],
        u_seed: fx.seed,
        u_intensity: fx.intensity,
        u_speed: fx.speed,
      };
      for (const key in fx) {
        const v = (fx as unknown as Record<string, unknown>)[key];
        if (typeof v === 'number' && !(key in values) && key !== 'seed' && key !== 'intensity' && key !== 'speed') values['u_' + key] = v;
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
      el.appendChild(view);
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
        t0: win.performance.now(),
        shown: false,
        position,
        off: [],
      };
      const on = (type: string, fn: (ev: Event) => void) => {
        el.addEventListener(type, fn);
        h.off.push(() => el.removeEventListener(type, fn));
      };
      const enter = () => {
        h.hoverTo = 1;
        wake();
      };
      const leave = () => {
        h.hoverTo = 0;
        wake();
      };
      on('pointerenter', enter);
      on('pointerleave', leave);
      // keyboard focus gets the same effect as the pointer
      on('focusin', enter);
      on('focusout', leave);
      on('pointermove', (ev) => {
        const e = ev as PointerEvent;
        const b = el.getBoundingClientRect();
        if (b.width && b.height) {
          h.px = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
          h.py = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
        }
        wake();
      });
      hosts.set(el, h);
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
      if (h.tex) gl.deleteTexture(h.tex);
      if (h.position !== null) el.style.position = h.position;
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
        if (reduced || !h.visible || !h.w || !h.h || h.texState === 'failed' || h.texState === 'loading' || doc.hidden) {
          hide(h);
          continue;
        }
        const s = read(h.el);
        const ks = h.fx.map((f) => drive(f, h, s));
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
