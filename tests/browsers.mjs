#!/usr/bin/env node
// Scrollwork in real browsers: Chromium, WebKit and Firefox. The built files
// (dist/) are served from a pretend origin, one page per behaviour: the
// declarative engine (the same checks uxdeck runs on it) and the version 1 API.
//
// Usage: npm run build && npm run test:browsers   (BROWSERS=chromium,webkit,firefox)

import { readFileSync } from 'node:fs';
import * as pw from 'playwright';

const ORIGIN = 'http://scrollwork.test';
const DIST = (f) => readFileSync(new URL(`../dist/${f}`, import.meta.url));
const BROWSERS = (process.env.BROWSERS || 'chromium,webkit,firefox').split(',');
/** the version the build stamps in, from package.json */
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const still = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0 };
const appear = (o = {}) => ({ effect: 'fade', split: 'none', duration: 0.4, delay: 0, stagger: 0.05, ease: 'out', offset: 0, replay: false, from: { ...still, opacity: 0 }, ...o });
const change = (trigger, state, o = {}) => ({ id: 'ix-' + trigger, trigger, delay: 0, action: { type: 'change', state: { ...still, ...state } }, animation: { kind: 'animate', curve: 'out', duration: 0.2 }, ...o });

/** A page with the engine loaded from dist; `body` is its markup, and `counting` wraps rAF first to count frames. */
const page = async (browser, body, { reduced = false, counting = false, head = '', script = '<script src="/scrollwork.min.js"></script>' } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  const errors = [];
  const warnings = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  const count = counting
    ? `<script>window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => { window.__frames++; return raf(f); };</script>`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}</style>${count}${head}</head><body>${body}${script}</body></html>`;
  await p.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const file = path.slice(1);
    if (['scrollwork.min.js', 'scrollwork.js', 'scrollwork.mjs', 'scrollwork-fx.min.js', 'scrollwork-fx.js', 'fx.mjs', 'scrollwork-extras.min.js', 'scrollwork-extras.js', 'extras.mjs'].includes(file)) return route.fulfill({ contentType: 'text/javascript', body: DIST(file) });
    return route.fulfill({ status: 404, body: '' });
  });
  await p.goto(`${ORIGIN}/`);
  return { p, ctx, errors, warnings };
};

for (const name of BROWSERS) {
  const browser = await pw[name].launch();
  const tag = (s) => `[${name}] ${s}`;

  // ── the wheel over a box that scrolls ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<div style="height:3000px"><div id="box" style="margin:50px;width:400px;height:200px;overflow:auto"><div style="height:1200px">inner</div></div></div>`
    );
    await p.evaluate(() => {
      document.documentElement.setAttribute('data-scrollwork-smooth', '');
      window.sw = window.Scrollwork.auto();
    });
    await p.mouse.move(200, 150);
    await p.mouse.wheel(0, 300);
    await sleep(700);
    const inner = await p.evaluate(() => ({ box: document.getElementById('box').scrollTop, page: window.scrollY }));
    check(tag('a box that scrolls takes the wheel'), inner.box > 100 && inner.page === 0, JSON.stringify(inner));
    await p.mouse.move(800, 500);
    await p.mouse.wheel(0, 400);
    await sleep(900);
    const outer = await p.evaluate(() => window.scrollY);
    check(tag('outside it, the page still glides'), outer > 100, String(outer));
    check(tag('no errors (wheel)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── the author's styles ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<style>.shift{translate:100px 0}</style>
       <div id="a" style="opacity:.6" data-scrollwork='{"appear":{"effect":"fade","duration":0.3}}'>inline opacity</div>
       <div id="b" class="shift" data-scrollwork='{"appear":{"effect":"slide-up","duration":1.2}}'>class translate</div>`
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(350);
    const mid = await p.evaluate(() => getComputedStyle(document.getElementById('b')).translate);
    check(tag('a CSS translate is kept while moving'), /100px/.test(mid), mid);
    await sleep(1300);
    const end = await p.evaluate(() => ({ a: getComputedStyle(document.getElementById('a')).opacity, b: getComputedStyle(document.getElementById('b')).translate }));
    check(tag('inline opacity .6 ends at .6, not 1'), Math.abs(parseFloat(end.a) - 0.6) < 0.02, end.a);
    check(tag('and the class translate at rest'), /^100px/.test(end.b), end.b);
    await p.evaluate(() => window.sw.stop());
    const after = await p.evaluate(() => document.getElementById('a').style.opacity);
    check(tag('stop() puts the inline value back'), after === '0.6', after);
    check(tag('no errors (styles)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── key triggers ──
  {
    const { p, ctx, errors } = await page(browser, `<button id="btn">press me</button><div id="t" data-m="t">target</div>`);
    await p.evaluate(
      ({ ix }) => {
        window.clicks = 0;
        document.getElementById('btn').addEventListener('click', () => window.clicks++);
        window.sw = window.Scrollwork.start({ items: [{ id: 't', text: false, interactions: [ix] }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false });
      },
      { ix: change('key', { opacity: 0.2 }, { key: ' ', animation: { kind: 'instant', curve: 'out', duration: 0 } }) }
    );
    await p.focus('#btn');
    await p.keyboard.press('Space');
    await sleep(200);
    const onButton = await p.evaluate(() => ({ clicks: window.clicks, op: getComputedStyle(document.getElementById('t')).opacity }));
    check(tag('Space on a focused button presses the button'), onButton.clicks === 1, JSON.stringify(onButton));
    check(tag('and leaves the trigger alone'), onButton.op === '1', onButton.op);
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('Space');
    await sleep(200);
    const onPage = await p.evaluate(() => getComputedStyle(document.getElementById('t')).opacity);
    check(tag('Space on the page fires the trigger'), Math.abs(parseFloat(onPage) - 0.2) < 0.02, onPage);
    check(tag('no errors (keys)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a loader on the page covers the window, whatever size its CSS gives it ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<style>.screen{width:1440px;height:900px;background:#fff}</style><div id="ld" class="screen" data-m="ld">loading</div><div style="height:2000px">page</div>`
    );
    await p.evaluate(() => {
      window.sw = window.Scrollwork.start({ items: [{ id: 'ld', text: false, loader: { hold: 0.4, leave: 0.2, effect: 'fade', once: false } }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false });
    });
    await sleep(100);
    const up = await p.evaluate(() => {
      const r = document.getElementById('ld').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, mark: document.body.hasAttribute('data-sw-loading') };
    });
    check(tag('a loader drawn 1440x900 covers the window'), up.w === up.vw && up.h === up.vh, JSON.stringify(up));
    check(tag('the root is marked while it holds'), up.mark);
    await sleep(1000);
    const gone = await p.evaluate(() => ({ mark: document.body.hasAttribute('data-sw-loading'), display: getComputedStyle(document.getElementById('ld')).display }));
    check(tag('and unmarked once it has left'), !gone.mark && gone.display === 'none', JSON.stringify(gone));
    check(tag('no errors (loader size)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── reduced motion keeps delays ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="t" data-m="t">splash</div>`, { reduced: true });
    await p.evaluate(
      ({ ix }) => {
        window.sw = window.Scrollwork.start({ items: [{ id: 't', text: false, interactions: [ix] }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: true, split: false });
      },
      { ix: change('delay', { opacity: 0.3 }, { delay: 0.8 }) }
    );
    await sleep(150);
    const early = await p.evaluate(() => getComputedStyle(document.getElementById('t')).opacity);
    await sleep(1000);
    const late = await p.evaluate(() => getComputedStyle(document.getElementById('t')).opacity);
    check(tag('under reduced motion a delay still waits'), early === '1' && Math.abs(parseFloat(late) - 0.3) < 0.02, `${early} then ${late}`);
    check(tag('no errors (delay)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── reduced motion followed live ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<div style="height:1400px"></div><div id="late" data-scrollwork='{"appear":{"effect":"slide-up","duration":3}}'>far down</div><div style="height:1400px"></div>`
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(200);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(100);
    await p.evaluate(() => window.scrollTo(0, 1200));
    await sleep(300);
    const op = await p.evaluate(() => getComputedStyle(document.getElementById('late')).opacity);
    check(tag('reduced motion turned on mid-visit: the next appear shows at once'), op === '1', op);
    check(tag('no errors (live reduced)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── split text ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<h1 id="h" data-scrollwork='{"appear":{"effect":"fade","split":"chars","duration":0.2}}'>Hello world</h1>
       <h2 id="em" data-scrollwork='{"appear":{"effect":"fade","split":"words","duration":0.2}}'>Hello <em>there</em> friend</h2>
       <p id="link" data-scrollwork='{"appear":{"effect":"fade","split":"words","duration":0.2}}'>Read <a href="#x">the guide</a> first</p>`
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(100);
    const a11y = await p.evaluate(() => {
      const h = document.getElementById('h');
      const link = document.getElementById('link');
      return {
        said: h.querySelector('.ux-motion-said')?.textContent,
        hidden: [...h.querySelectorAll('.ux-motion-word')].every((w) => w.getAttribute('aria-hidden') === 'true'),
        emWords: document.getElementById('em').querySelectorAll('.ux-motion-word').length,
        linkSaid: !!link.querySelector('.ux-motion-said'),
        linkHidden: [...link.querySelectorAll('.ux-motion-word')].some((w) => w.hasAttribute('aria-hidden')),
      };
    });
    check(tag('split letters are hidden from screen readers'), a11y.hidden, JSON.stringify(a11y));
    check(tag('and the words are said once, whole'), a11y.said === 'Hello world', String(a11y.said));
    check(tag('text with <em> inside is still split'), a11y.emWords === 3, String(a11y.emWords));
    check(tag('text holding a link is not hidden'), !a11y.linkSaid && !a11y.linkHidden);
    await p.evaluate(() => window.sw.stop());
    const back = await p.evaluate(() => ({ h: document.getElementById('h').innerHTML, em: document.getElementById('em').innerHTML }));
    check(tag('stop() gives the text back as it was'), back.h === 'Hello world' && back.em === 'Hello <em>there</em> friend', JSON.stringify(back));
    check(tag('no errors (split)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a word wider than its line breaks where the element's CSS lets it (1.9.3) ──
  {
    const box = 'width:200px;font:60px/1 sans-serif;margin:0';
    const { p, ctx, errors } = await page(
      browser,
      `<h2 id="plain" style="${box};word-break:break-word">PLACINGPLACING</h2>
       <h2 id="lines" style="${box};word-break:break-word" data-scrollwork='{"appear":{"effect":"mask","split":"lines","duration":0.2}}'>PLACINGPLACING</h2>
       <h2 id="chars" style="${box};overflow-wrap:anywhere" data-scrollwork='{"appear":{"effect":"fade","split":"chars","duration":0.2}}'>PLACINGPLACING</h2>
       <h2 id="keep" style="${box}" data-scrollwork='{"appear":{"effect":"mask","split":"lines","duration":0.2}}'>PLACINGPLACING</h2>
       <h2 id="fits" style="${box};word-break:break-word" data-scrollwork='{"appear":{"effect":"mask","split":"lines","duration":0.2}}'>A B</h2>`
    );
    const plain = await p.evaluate(() => document.getElementById('plain').offsetHeight);
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(500);
    const m = await p.evaluate(() => Object.fromEntries(['lines', 'chars', 'keep', 'fits'].map((id) => {
      const el = document.getElementById(id);
      return [id, { h: el.offsetHeight, w: el.scrollWidth }];
    })));
    check(tag('a word too wide for the line breaks as it does unsplit (lines, mask)'), m.lines.h === plain && m.lines.w <= 200, `${JSON.stringify(m.lines)} vs ${plain}`);
    check(tag('and split into letters'), m.chars.h === plain && m.chars.w <= 200, `${JSON.stringify(m.chars)} vs ${plain}`);
    check(tag('without break-word the word stays whole, as before'), m.keep.h === 60 && m.keep.w > 200, JSON.stringify(m.keep));
    check(tag('words that fit are not broken'), m.fits.h === 60, JSON.stringify(m.fits));
    check(tag('no errors (word break)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a scroller that is not positioned ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<div style="height:1500px"></div><div id="sc" style="height:400px;overflow:auto"><div style="height:100px"></div><div id="in" data-m="in">inside</div><div style="height:2000px"></div></div>`
    );
    await p.evaluate(
      ({ a }) => {
        window.sw = window.Scrollwork.start({ items: [{ id: 'in', text: false, appear: a }], smooth: false }, { attr: 'data-m', root: document.getElementById('sc'), scroller: document.getElementById('sc'), reduced: false, split: false });
      },
      { a: appear({ duration: 0.2, offset: 15 }) }
    );
    await sleep(500);
    const op = await p.evaluate(() => getComputedStyle(document.getElementById('in')).opacity);
    check(tag('in view inside a static scroller, it plays'), op === '1', op);
    check(tag('no errors (scroller)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── the loop rests ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<div id="a" data-scrollwork='{"appear":{"effect":"fade","duration":0.2}}'>top</div><div style="height:1200px"></div><div id="b" data-scrollwork='{"appear":{"effect":"fade","duration":0.2}}'>below</div><div style="height:1200px"></div>`,
      { counting: true }
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(800);
    const f0 = await p.evaluate(() => window.__frames);
    await sleep(1000);
    const f1 = await p.evaluate(() => window.__frames);
    check(tag('nothing moving: the loop rests'), f1 - f0 <= 2, `${f1 - f0} frames in a second`);
    await p.evaluate(() => window.scrollTo(0, 1000));
    await sleep(600);
    const woke = await p.evaluate(() => ({ frames: window.__frames, op: getComputedStyle(document.getElementById('b')).opacity }));
    check(tag('a scroll wakes it, and what arrived plays'), woke.frames > f1 && woke.op === '1', JSON.stringify(woke));
    check(tag('no errors (rest)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── an upright ring rests off screen (1.15.1): the children it turns back are its own writes, not a change to the
  // page; before, each one woke the engine for another frame, for ever, on screen or off ──
  {
    const kids = Array.from({ length: 6 }, (_, i) => `<i style="position:absolute;left:${40 + i * 20}px;top:40px;width:16px;height:16px;background:#000"></i>`).join('');
    const { p, ctx, errors } = await page(
      browser,
      `<div id="ring" style="position:relative;width:200px;height:200px" data-scrollwork='{"loop":{"to":{"rotate":360},"duration":6,"upright":true}}'>${kids}</div><div style="height:3000px"></div>`,
      { counting: true }
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(500);
    const turning = await p.evaluate(() => [getComputedStyle(document.getElementById('ring')).rotate, getComputedStyle(document.querySelector('#ring i')).rotate]);
    check(tag('upright ring: on screen it turns and its children turn back'), parseFloat(turning[0]) > 0 && Math.abs(parseFloat(turning[0]) + parseFloat(turning[1])) < 1, JSON.stringify(turning));
    await p.evaluate(() => window.scrollTo(0, 2000));
    await sleep(800);
    const f0 = await p.evaluate(() => window.__frames);
    await sleep(1000);
    const f1 = await p.evaluate(() => window.__frames);
    check(tag('upright ring: scrolled away, the loop rests'), f1 - f0 <= 2, `${f1 - f0} frames in a second`);
    check(tag('no errors (upright rest)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }


  // ── 1.17.0: a flipbook picked by the scroll (stepped and blended), and a layer hidden until its card is hovered ──
  {
    const frames = (id, mode) => `<div id="${id}" style="position:relative;height:300px;width:300px" data-scrollwork='{"scroll":{"flipbook":${JSON.stringify(mode)},"range":"through"}}'>${[0, 1, 2, 3, 4].map((i) => `<div style="position:absolute;inset:0;background:hsl(${i * 60},70%,50%)">${i}</div>`).join('')}</div>`;
    const body = `<div style="height:900px"></div>${frames('step', true)}<div style="height:200px"></div>${frames('mix', 'blend')}
      <div id="card" style="margin-top:200px;width:300px;height:200px;position:relative;background:#eee"><div id="glow" style="position:absolute;inset:0;background:gold" data-scrollwork='{"hidden":true,"hover":{"opacity":1,"source":"parent"}}'></div></div><div style="height:1400px"></div>`;
    const { p, ctx, errors } = await page(browser, body, { script: '<script src="/scrollwork.min.js" data-auto></script>' });
    await sleep(300);
    const shown = (id) => p.evaluate((i) => [...document.getElementById(i).children].map((c) => (c.style.visibility === 'hidden' ? '-' : c.style.opacity || '1')).join(' '), id);
    const atY = async (y) => { await p.evaluate((v) => window.scrollTo(0, v), y); await sleep(250); };
    await atY(0);
    const s0 = await shown('step');
    await atY(1100);
    const s1 = await shown('step');
    check(tag('scroll flipbook: one frame shows at a time, a later one further down the page'), s0.split(' ').filter((x) => x !== '-').length === 1 && s0 !== s1 && s1.split(' ').filter((x) => x !== '-').length === 1, `${s0} | ${s1}`);
    await atY(1500);
    const m1 = await shown('mix');
    const vis = m1.split(' ').filter((x) => x !== '-');
    check(tag('scroll flipbook blend: two neighbours show, the later one part-way in'), vis.length >= 1 && vis.length <= 2 && (vis.length === 1 || (parseFloat(vis[1]) > 0 && parseFloat(vis[1]) < 1)), m1);
    const glow0 = await p.evaluate(() => getComputedStyle(document.getElementById('glow')).opacity);
    await p.evaluate(() => document.getElementById('card').scrollIntoView({ block: 'center' }));
    await sleep(200);
    const b = await p.locator('#card').boundingBox();
    await p.mouse.move(b.x + 10, b.y + 10);
    await sleep(450);
    const glow1 = await p.evaluate(() => getComputedStyle(document.getElementById('glow')).opacity);
    await p.mouse.move(2, 2);
    await sleep(450);
    const glow2 = await p.evaluate(() => getComputedStyle(document.getElementById('glow')).opacity);
    check(tag('hidden: out of sight at rest, in on the card\'s hover, out again on leaving'), parseFloat(glow0) === 0 && parseFloat(glow1) > 0.95 && parseFloat(glow2) === 0, `${glow0} -> ${glow1} -> ${glow2}`);
    await p.evaluate(() => window.scrollwork && window.scrollwork.stop && window.scrollwork.stop());
    const back = await p.evaluate(() => [document.getElementById('glow').style.opacity, [...document.getElementById('step').children].map((c) => c.style.visibility).join(',')]);
    check(tag('stop: the frames and the hidden layer are given back'), back[0] === '' && !/hidden/.test(back[1]), JSON.stringify(back));
    check(tag('1.17 page: no errors'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { p, ctx } = await page(browser, `<div id="rm" style="position:relative;height:300px" data-scrollwork='{"scroll":{"flipbook":"blend"}}'><div>a</div><div>b</div><div>c</div></div><div style="height:2000px"></div>`, { reduced: true, script: '<script src="/scrollwork.min.js" data-auto></script>' });
    await sleep(300);
    await p.evaluate(() => window.scrollTo(0, 600));
    await sleep(250);
    const v = await p.evaluate(() => [...document.getElementById('rm').children].map((c) => c.style.visibility === 'hidden' ? '-' : 'on').join(' '));
    check(tag('scroll flipbook under reduced motion: the first frame stays'), v === 'on - -', v);
    await ctx.close();
  }
  // ── 1.16.0: a pivot for an element's motion (its corner stays put as it turns; an element resting at an angle
  // does not move when the engine starts), an edge fade, a hover heard on the card around a picture, and the ripple ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<div id="tilted" style="position:absolute;left:300px;top:80px;width:120px;height:60px;background:#888;rotate:12deg"><i id="tc" style="position:absolute;left:0;top:0;width:2px;height:2px"></i></div>
       <div id="pv" style="position:absolute;left:100px;top:300px;width:200px;height:80px;background:#444"><i id="pc" style="position:absolute;left:0;top:0;width:2px;height:2px"></i></div>
       <div id="fd" style="position:absolute;left:500px;top:300px;width:200px;height:200px;background:#000"></div>
       <div id="card" style="position:absolute;left:100px;top:450px;width:300px;height:180px;background:#ddd"><button id="lnk">Open</button><div id="pic" style="position:absolute;right:10px;bottom:10px;width:80px;height:80px;background:#06c"></div></div>
       <button id="rip" style="position:absolute;left:500px;top:560px;width:200px;height:56px;border:0;background:#111;color:#fff">Let's talk</button>`
    );
    const corner = (id) => p.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }, id);
    const tilted0 = await corner('tc');
    await p.evaluate(() => {
      const ix = { id: 'h', trigger: 'hover', delay: 0, action: { type: 'change', state: { x: 0, y: 0, scale: 1.3, rotate: 0, opacity: 1, blur: 0 } }, animation: { kind: 'animate', curve: 'linear', duration: 0.2 }, source: 'parent' };
      window.sw = window.Scrollwork.start(
        {
          items: [
            { id: 'tilted', text: false, origin: 'top', loop: { from: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0 }, to: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0 }, duration: 4, ease: 'linear', yoyo: false, fade: 0, upright: false, flipbook: 0 } },
            { id: 'pv', text: false, origin: 'top-left', appear: { effect: 'custom', split: 'none', duration: 2, delay: 0, stagger: 0, ease: 'linear', offset: 0, replay: false, from: { x: 0, y: 0, scale: 1, rotate: 60, opacity: 1, blur: 0 } } },
            { id: 'fd', text: false, fade: { top: 30, bottom: 30, left: 20 } },
            { id: 'pic', text: false, interactions: [ix] },
            { id: 'rip', text: false, rollover: [{ effect: 'wipe', direction: 'pointer', color: 'rgb(212, 255, 58)', ink: 'rgb(0, 0, 0)', duration: 0.6, stagger: 0, ease: 'linear' }] },
          ],
          smooth: false,
        },
        { attr: 'id', root: document.body, scroller: null, reduced: false, split: false }
      );
    });
    await sleep(300);
    check(tag('pivot: an element resting at an angle keeps its place when the engine starts'), JSON.stringify(await corner('tc')) === JSON.stringify(tilted0), `${tilted0} -> ${await corner('tc')}`);
    const pv0 = await p.evaluate(() => ({ t: document.getElementById('pv').style.transform }));
    const c1 = await corner('pc');
    await sleep(600);
    const c2 = await corner('pc');
    // the 2 px marker turns with it, so its own box moves a pixel or two; turned about its centre, the corner would move ~100 px
    check(tag('pivot: it turns about its top-left corner, which stays put'), /translate\(-50%, -50%\).*rotate\(/.test(pv0.t) && Math.abs(c1[0] - 100) <= 3 && Math.abs(c1[1] - 300) <= 3 && Math.abs(c2[0] - 100) <= 3 && Math.abs(c2[1] - 300) <= 3, `${pv0.t} | ${c1} | ${c2}`);
    const mask = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('fd')); return { img: s.maskImage || s.webkitMaskImage, comp: s.maskComposite || s.webkitMaskComposite }; });
    check(tag('fade: the edges named fade, one gradient for each axis, kept where they meet'), (mask.img.match(/linear-gradient/g) || []).length === 2 && /intersect|source-in/.test(mask.comp), JSON.stringify(mask));
    const scaleOf = () => p.evaluate(() => getComputedStyle(document.getElementById('pic')).scale);
    await p.mouse.move(130, 470);
    await sleep(350);
    const over = await scaleOf();
    await p.mouse.move(900, 50);
    await sleep(350);
    const away = await scaleOf();
    check(tag('source: hovering the card, not the picture, moves the picture, and leaving puts it back'), parseFloat(over) > 1.25 && (away === 'none' || parseFloat(away) === 1), `${over} -> ${away}`);
    // a key first, so the browser treats the focus as the keyboard's (WebKit's Tab skips buttons by default, as Safari's)
    await p.keyboard.press('Shift');
    await p.evaluate(() => document.getElementById('lnk').focus());
    await sleep(350);
    const focused = await p.evaluate(() => [document.activeElement?.id, getComputedStyle(document.getElementById('pic')).scale]);
    check(tag('source: the keyboard inside the card moves it too'), focused[0] === 'lnk' && parseFloat(focused[1]) > 1.25, JSON.stringify(focused));
    await p.evaluate(() => document.activeElement.blur());
    // the ripple: in from the left edge's middle; halfway through, the circle is centred on that point
    await p.mouse.move(470, 588);
    await p.mouse.move(505, 588, { steps: 2 });
    await sleep(300);
    const mid = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('rip')); const size = parseFloat(s.backgroundSize); const [x, y] = s.backgroundPosition.split(',')[0].split(' ').map(parseFloat); return { size, cx: x + size / 2, cy: y + size / 2 }; });
    check(tag('ripple: it grows as a circle centred where the pointer came in'), mid.size > 20 && Math.abs(mid.cx - 5) < 4 && Math.abs(mid.cy - 28) < 4, JSON.stringify(mid));
    await sleep(500);
    const full = await p.evaluate(() => ({ size: parseFloat(getComputedStyle(document.getElementById('rip')).backgroundSize), ink: getComputedStyle(document.getElementById('rip')).color }));
    check(tag('ripple: it covers the button, the words in their hover colour'), full.size >= 2 * Math.hypot(200, 56) - 2 && full.ink === 'rgb(0, 0, 0)', JSON.stringify(full));
    await p.mouse.move(695, 570);
    await p.mouse.move(760, 540, { steps: 2 });
    await sleep(300);
    const out = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('rip')); const size = parseFloat(s.backgroundSize); const [x, y] = s.backgroundPosition.split(',')[0].split(' ').map(parseFloat); return { size, cx: x + size / 2, cy: y + size / 2 }; });
    check(tag('ripple: leaving, it shrinks toward where the pointer went out'), out.size < full.size && out.cx > 150, JSON.stringify(out));
    // inside a parent scaled to half (a zoomed canvas): the circle is still centred on the point, in the button's own px
    await p.mouse.move(900, 50);
    await sleep(700);
    // the page scaled to half from its corner, as a zoomed canvas is: the button is at 250, 280 on screen, 100 by 28
    await p.evaluate(() => { document.body.style.transformOrigin = '0 0'; document.body.style.transform = 'scale(0.5)'; });
    await p.mouse.move(244, 294);
    await p.mouse.move(256, 294, { steps: 2 });
    await sleep(300);
    const zoomed = await p.evaluate(() => { const s = getComputedStyle(document.getElementById('rip')); const size = parseFloat(s.backgroundSize); const [x, y] = s.backgroundPosition.split(',')[0].split(' ').map(parseFloat); return { size, cx: x + size / 2, cy: y + size / 2 }; });
    check(tag('ripple: scaled on screen, it still grows from the point the pointer came in, in its own px'), zoomed.cx > -2 && zoomed.cx < 16 && Math.abs(zoomed.cy - 28) < 4, JSON.stringify(zoomed));
    await p.evaluate(() => { document.body.style.transform = ''; document.body.style.transformOrigin = ''; });
    await p.evaluate(() => window.sw.stop());
    const back = await p.evaluate(() => ({ mask: document.getElementById('fd').style.maskImage, t: document.getElementById('pv').style.transform, bg: document.getElementById('rip').style.backgroundImage }));
    // the button's own inline background (a shorthand, read back as initial) is what comes back
    check(tag('stop: the fade, the pivot and the ripple are taken away'), !back.mask && !back.t && !/gradient/.test(back.bg), JSON.stringify(back));
    check(tag('no errors (1.16.0)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a curve outside 0 to 1 ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="t" data-m="t" style="width:100px;height:40px;background:#888">hover</div>`);
    await p.evaluate(
      ({ ix }) => {
        window.sw = window.Scrollwork.start({ items: [{ id: 't', text: false, interactions: [ix] }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false });
      },
      { ix: change('hover', { x: 40 }, { animation: { kind: 'animate', curve: 'custom', bezier: [0.5, 0, 1.6, 1], duration: 0.2 } }) }
    );
    // the pointer starts at the page's corner, which is this element: from
    // outside first, or entering it is not an entry on every platform
    await p.mouse.move(600, 500);
    await p.hover('#t');
    await sleep(500);
    const tr = await p.evaluate(() => getComputedStyle(document.getElementById('t')).translate);
    check(tag('a curve with x past 1 still lands'), /^40px/.test(tr), tr);
    check(tag('no errors (curve)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── animate() ──
  {
    const { p, ctx, errors } = await page(browser, `<style>.c{translate:0 -50%;width:80px;height:40px;background:#888}</style><div class="c" id="a">a</div><div class="c" id="b">b</div><div id="k" style="opacity:.5">k</div>`);
    await p.evaluate(() => {
      window.a = window.Scrollwork.animate('.c', { x: [0, 200] }, { duration: 1, ease: 'linear', stagger: 0.5 });
      window.done = false;
      window.a.finished.then(() => (window.done = true));
    });
    await p.waitForTimeout(500);
    const mid = await p.evaluate(() => ({ a: getComputedStyle(document.getElementById('a')).translate, b: getComputedStyle(document.getElementById('b')).translate }));
    const ax = parseFloat(mid.a);
    check(tag('animate: moves over time, added to the CSS translate'), ax > 60 && ax < 150 && /-50%|px/.test(mid.a.split(' ')[1] || ''), JSON.stringify(mid));
    check(tag('animate: stagger starts the second later'), parseFloat(mid.b) < ax, JSON.stringify(mid));
    await p.waitForTimeout(1300);
    const end = await p.evaluate(() => ({ done: window.done, a: getComputedStyle(document.getElementById('a')).translate, progress: window.a.progress }));
    check(tag('animate: ends at the last frame, finished resolves'), end.done && /^200px/.test(end.a) && end.progress === 1, JSON.stringify(end));
    await p.evaluate(() => {
      window.k = window.Scrollwork.animate('#k', { opacity: [1, 0] }, { autoplay: false, ease: 'linear' });
      window.k.seek(0.5);
    });
    const half = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('k')).opacity));
    check(tag('animate: seek(0.5) is half way, on the element\'s own opacity'), half > 0.1 && half < 0.4, String(half));
    await p.evaluate(() => window.k.cancel());
    const back = await p.evaluate(() => document.getElementById('k').style.opacity);
    check(tag('animate: cancel() gives the author\'s inline value back'), back === '0.5', back);
    await p.evaluate(() => {
      window.r = window.Scrollwork.animate('#a', { y: [0, 100] }, { duration: 0.3, ease: 'linear', repeat: 1, yoyo: true });
    });
    await p.waitForTimeout(800);
    const yoyo = await p.evaluate(() => getComputedStyle(document.getElementById('a')).translate);
    check(tag('animate: repeat with yoyo comes back'), !/100px/.test(yoyo.split(' ')[1] || ''), yoyo);
    check(tag('no errors (animate)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── animate() under reduced motion ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="a">a</div>`, { reduced: true });
    await p.evaluate(() => {
      window.a = window.Scrollwork.animate('#a', { y: [40, 0], opacity: [0, 1] }, { duration: 2, delay: 0.5, repeat: Infinity });
    });
    await p.waitForTimeout(150);
    const before = await p.evaluate(() => getComputedStyle(document.getElementById('a')).opacity);
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({ op: getComputedStyle(document.getElementById('a')).opacity, playing: window.a.playing }));
    check(tag('reduced: the delay is kept, then the end state at once, no loop'), before === '0' && after.op === '1' && !after.playing, `${before} then ${JSON.stringify(after)}`);
    check(tag('no errors (animate reduced)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── inView() ──
  {
    const { p, ctx, errors } = await page(browser, `<div style="height:1400px"></div><div id="t" style="height:100px">t</div><div style="height:1400px"></div>`);
    await p.evaluate(() => {
      window.log = [];
      window.Scrollwork.inView('#t', () => {
        window.log.push('in');
        return () => window.log.push('out');
      });
    });
    await p.waitForTimeout(200);
    const none = await p.evaluate(() => window.log.join(','));
    await p.evaluate(() => window.scrollTo(0, 1000));
    await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    const log = await p.evaluate(() => window.log.join(','));
    check(tag('inView: nothing until it arrives, then in and out'), none === '' && log === 'in,out', `${none} | ${log}`);
    check(tag('no errors (inView)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── scroll() ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="bar" style="position:fixed;top:0;left:0;width:100px;height:4px;background:#000"></div><div style="height:3000px"></div>`);
    await p.evaluate(() => {
      window.progress = -1;
      window.Scrollwork.scroll((v) => (window.progress = v));
      window.bar = window.Scrollwork.animate('#bar', { x: [0, 500] }, { autoplay: false, ease: 'linear' });
      window.Scrollwork.scroll(window.bar);
    });
    await p.waitForTimeout(100);
    const top = await p.evaluate(() => window.progress);
    await p.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
    await p.waitForTimeout(250);
    const half = await p.evaluate(() => ({ p: window.progress, x: getComputedStyle(document.getElementById('bar')).translate }));
    check(tag('scroll: 0 at the top, half way at half way'), top === 0 && Math.abs(half.p - 0.5) < 0.02, `${top} then ${JSON.stringify(half)}`);
    check(tag('scroll: an animation is scrubbed by it'), Math.abs(parseFloat(half.x) - 250) < 12, half.x);
    check(tag('no errors (scroll)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── the ES module, data-auto, and warnings ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="m">m</div>`, {
      script: `<script type="module">import { animate, version } from '/scrollwork.mjs'; window.esm = version; animate('#m', { x: 30 }, { duration: 0.1 });</script>`,
    });
    await p.waitForTimeout(400);
    const esm = await p.evaluate(() => ({ v: window.esm, x: getComputedStyle(document.getElementById('m')).translate }));
    check(tag('the ES module imports and plays'), esm.v === VERSION && /^30px/.test(esm.x), JSON.stringify(esm));
    check(tag('no errors (esm)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { p, ctx, errors, warnings } = await page(browser, `<h2 id="h" data-scrollwork='{"appear":{"effect":"fade","ease":"bounce","duration":0.2}}'>Hi</h2><div data-scrollwork='{appear:}'>broken</div>`, {
      script: '<script src="/scrollwork.min.js" data-auto></script>',
    });
    await p.waitForTimeout(500);
    const run = await p.evaluate(() => ({ running: !!window.scrollwork, op: getComputedStyle(document.getElementById('h')).opacity }));
    check(tag('data-auto plays the page'), run.running && run.op === '1', JSON.stringify(run));
    const said = warnings.join('\n');
    check(tag('a bad ease and broken JSON are said in the console'), /\[scrollwork\]/.test(said) && /bounce/.test(said) && /not valid JSON/.test(said), said.slice(0, 160));
    check(tag('no errors (auto)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── no flash while the script loads (the sw-pending pattern) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    let release;
    const gate = new Promise((r) => (release = r));
    const head = `<style>html.sw-pending [data-scrollwork*='"appear"'] { opacity: 0 }</style><script>document.documentElement.classList.add('sw-pending'); setTimeout(function () { document.documentElement.classList.remove('sw-pending'); }, 3000);</script>`;
    await p.route(`${ORIGIN}/**`, async (route) => {
      if (route.request().url().endsWith('/')) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${head}</head><body><h1 id="h" data-scrollwork='{"appear":{"effect":"fade","duration":0.3}}'>Hello</h1><p id="plain">Not animated</p><script src="/scrollwork.min.js" data-auto></script></body></html>` });
      await gate;
      return route.fulfill({ contentType: 'text/javascript', body: DIST('scrollwork.min.js') });
    });
    const nav = p.goto(`${ORIGIN}/`);
    await p.waitForTimeout(600);
    const waiting = await p.evaluate(() => ({ h: getComputedStyle(document.getElementById('h')).opacity, plain: getComputedStyle(document.getElementById('plain')).opacity }));
    check(tag('while the script loads, what will appear stays hidden, the rest shows'), waiting.h === '0' && waiting.plain === '1', JSON.stringify(waiting));
    release();
    await nav;
    await p.waitForTimeout(700);
    const shown = await p.evaluate(() => ({ h: getComputedStyle(document.getElementById('h')).opacity, pending: document.documentElement.classList.contains('sw-pending') }));
    check(tag('then it appears, at its full opacity'), shown.h === '1' && !shown.pending, JSON.stringify(shown));
    check(tag('no errors (flash)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── animate(): the review's cases (2026-09-25) ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="a">a</div><div id="b" style="opacity:.6" data-scrollwork='{"appear":{"effect":"fade","duration":0.1}}'>b</div><div id="c">c</div>`);
    // a ping-pong written through onComplete keeps going
    await p.evaluate(() => {
      window.n = 0;
      const a = window.Scrollwork.animate('#a', { x: [0, 100] }, { duration: 0.2, ease: 'linear', onComplete: () => { window.n++; if (window.n < 3) a.reverse(); } });
      window.pp = a;
    });
    await p.waitForTimeout(1000);
    const pp = await p.evaluate(() => ({ n: window.n, playing: window.pp.playing, x: getComputedStyle(document.getElementById('a')).translate }));
    check(tag('animate: reverse() from onComplete plays back, and ends again'), pp.n === 3 && !pp.playing && /^100px/.test(pp.x), JSON.stringify(pp));
    // a finished animate does not stop stop() from giving the element back
    await p.evaluate(async () => {
      await window.Scrollwork.animate('#b', { scale: [1, 1.2, 1] }, { duration: 0.1 }).finished;
      window.sw = window.Scrollwork.auto();
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => window.sw.stop());
    const b = await p.evaluate(() => document.getElementById('b').style.opacity);
    check(tag('after a finished animate, stop() still restores the author opacity'), b === '0.6', b);
    // the page changing a style after an animation: that is the author's value now
    await p.evaluate(async () => {
      await window.Scrollwork.animate('#c', { x: [0, 10] }, { duration: 0.05 }).finished;
      document.getElementById('c').style.opacity = '0.3';
      const a2 = window.Scrollwork.animate('#c', { y: [0, 10] }, { duration: 0.05 });
      await a2.finished;
      a2.cancel();
    });
    const c = await p.evaluate(() => document.getElementById('c').style.opacity);
    check(tag('a style the page set between animations is kept'), c === '0.3', c);
    // finish() twice: one onComplete
    const once = await p.evaluate(() => {
      let calls = 0;
      const a = window.Scrollwork.animate('#a', { y: 5 }, { duration: 1, onComplete: () => calls++ });
      a.finish();
      a.finish();
      return calls;
    });
    check(tag('finish() twice completes once'), once === 1, String(once));
    // an endless loop, finished, shows its end and says 1
    const inf = await p.evaluate(() => {
      const a = window.Scrollwork.animate('#a', { rotate: [0, 90] }, { duration: 0.3, repeat: Infinity, ease: 'linear' });
      a.finish();
      return { rotate: getComputedStyle(document.getElementById('a')).rotate, progress: a.progress };
    });
    check(tag('repeat: Infinity, finish() shows the end state'), inf.rotate === '90deg' && inf.progress === 1, JSON.stringify(inf));
    // chained starts keep one frame loop, not two: one update per frame the page draws,
    // whatever the display's rate (headless Firefox follows a 120 Hz screen while it is awake)
    await p.evaluate(() => {
      window.updates = 0;
      window.frames = 0;
      const t0 = performance.now();
      const count = () => {
        window.frames++;
        if (performance.now() - t0 < 1000) requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
      const next = () => window.Scrollwork.animate('#a', { x: [0, 1] }, { duration: 1.5, onUpdate: () => window.updates++ });
      window.Scrollwork.animate('#a', { x: [0, 1] }, { duration: 0.05, onComplete: next });
    });
    await p.waitForTimeout(1100);
    const { per, frames } = await p.evaluate(() => ({ per: window.updates, frames: window.frames }));
    check(tag('an animation started from onComplete runs on the one loop'), frames > 20 && per <= frames * 1.25, `${per} updates in ${frames} frames`);
    check(tag('no errors (review cases)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // reduced motion: onComplete may refer to the animation it belongs to
    const { p, ctx, errors } = await page(browser, `<div id="a">a</div>`, { reduced: true });
    const r = await p.evaluate(async () => {
      let seen = -1;
      const a = window.Scrollwork.animate('#a', { x: 100 }, { onComplete: () => (seen = a.progress) });
      await a.finished;
      return seen;
    });
    check(tag('reduced motion: onComplete can use the animation (no crash)'), r === 1 && errors.length === 0, `${r} ${errors.join(' | ')}`);
    // an animation that ignores reduced motion keeps following the scroll
    await p.setContent(`<div style="height:3000px"></div><div id="bar">bar</div>`);
    await p.addScriptTag({ content: DIST('scrollwork.min.js').toString() });
    await p.evaluate(() => {
      window.bar = window.Scrollwork.animate('#bar', { x: [0, 400] }, { autoplay: false, ease: 'linear', reducedMotion: 'never' });
      window.Scrollwork.scroll(window.bar);
      window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2);
    });
    await p.waitForTimeout(300);
    const x = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('bar')).translate));
    check(tag("reducedMotion: 'never' keeps following the scroll"), Math.abs(x - 200) < 12, String(x));
    await ctx.close();
  }
  {
    // auto() again after the page changed: no two elements share an id, and stop() takes them back
    const { p, ctx, errors } = await page(browser, `<div id="A" data-scrollwork='{"appear":{"effect":"fade","duration":0.1}}'>A</div><div id="B" data-scrollwork='{"appear":{"effect":"fade","duration":0.1}}'>B</div>`);
    const ids = await p.evaluate(() => {
      const one = window.Scrollwork.auto();
      one.stop();
      const cleared = !document.querySelector('[data-sw-id]');
      const c = document.createElement('div');
      c.id = 'C';
      c.setAttribute('data-scrollwork', '{"appear":{"effect":"fade","delay":5}}');
      c.textContent = 'C';
      document.body.prepend(c);
      window.two = window.Scrollwork.auto();
      const got = ['A', 'B', 'C'].map((id) => document.getElementById(id).getAttribute('data-sw-id'));
      return { cleared, unique: new Set(got).size === 3, got };
    });
    check(tag('stop() takes back the ids auto() gave'), ids.cleared, JSON.stringify(ids));
    check(tag('a second auto() gives every element its own id'), ids.unique, JSON.stringify(ids.got));
    await p.waitForTimeout(400);
    const c = await p.evaluate(() => getComputedStyle(document.getElementById('C')).opacity);
    check(tag("and the new element keeps its own delay (not another's motion)"), c === '0', c);
    check(tag('no errors (ids)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── the second review's cases (2026-09-25) ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="a">a</div><div id="b">b</div><div id="h" style="opacity:.6" data-scrollwork='{"hover":{"scale":1.1}}'>h</div><div id="two" style="opacity:.5">two</div>`);
    // a callback that throws does not stop animations started after it
    await p.evaluate(() => {
      // the first update runs inside animate() itself; the second is the loop's
      let calls = 0;
      window.Scrollwork.animate('#a', { x: [0, 10] }, { duration: 0.3, onUpdate: () => { if (++calls === 2) throw new Error('page bug'); } });
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.later = window.Scrollwork.animate('#b', { x: [0, 50] }, { duration: 0.2, ease: 'linear' }); });
    await p.waitForTimeout(500);
    const later = await p.evaluate(() => ({ x: getComputedStyle(document.getElementById('b')).translate, playing: window.later.playing, progress: window.later.progress }));
    check(tag('one throwing callback does not freeze later animations'), /^50px/.test(later.x) && later.progress === 1 && !later.playing, JSON.stringify(later));
    check(tag('and the error is still reported'), errors.some((e) => /page bug/.test(e)), errors.join(' | '));
    // an element auto() drives and animate() touches: cancel, then stop, keeps the author's opacity
    const one = await p.evaluate(() => {
      const sw = window.Scrollwork.auto();
      window.Scrollwork.animate('#h', { y: [0, 10] }, { duration: 1 }).cancel();
      const mid = document.getElementById('h').style.opacity;
      sw.stop();
      return { mid, end: document.getElementById('h').style.opacity };
    });
    check(tag('cancel() on an element auto() drives, then stop(): the author opacity stays'), one.end === '0.6', JSON.stringify(one));
    // two animations at once on one element, both cancelled
    const two = await p.evaluate(() => {
      const x = window.Scrollwork.animate('#two', { x: [0, 10] }, { duration: 1 });
      const y = window.Scrollwork.animate('#two', { y: [0, 10] }, { duration: 1 });
      x.cancel();
      y.cancel();
      return document.getElementById('two').style.opacity;
    });
    check(tag('two animations on one element, both cancelled: the author opacity stays'), two === '0.5', two);
    await ctx.close();
  }
  {
    // reduced motion: a pause and seek straight after animate() are kept
    const { p, ctx } = await page(browser, `<div id="a">a</div>`, { reduced: true });
    const r = await p.evaluate(async () => {
      let completed = false;
      const a = window.Scrollwork.animate('#a', { x: [0, 100] }, { onComplete: () => (completed = true) });
      a.pause();
      a.seek(0);
      await new Promise((res) => setTimeout(res, 50));
      return { completed, playing: a.playing, done: a.progress };
    });
    // with no duration there is nothing to move through: the element shows its
    // end whatever the position; what must hold is the pause (no completion)
    check(tag('reduced motion: a pause() right after animate() holds, onComplete does not fire'), !r.completed && !r.playing, JSON.stringify(r));
    await ctx.close();
  }
  {
    // two auto() runs overlapping: stopping the first leaves the second its ids
    const { p, ctx, errors } = await page(browser, `<div id="x" data-scrollwork='{"hover":{"scale":1.1}}'>x</div>`);
    const ids = await p.evaluate(() => {
      const first = window.Scrollwork.auto();
      const second = window.Scrollwork.auto();
      first.stop();
      const during = document.getElementById('x').getAttribute('data-sw-id');
      second.stop();
      const after = document.getElementById('x').getAttribute('data-sw-id');
      return { during, after };
    });
    check(tag('overlapping auto(): the id stays while a run still uses it'), !!ids.during && ids.after === null, JSON.stringify(ids));
    check(tag('no errors (overlap)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── layout changes with no scroll and no resize (known limit, fixed 2026-09-25) ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<style>.gone{display:none}</style><section style="height:3000px"><div id="spacer" style="height:900px"></div><div id="banner" style="height:500px">banner</div><div id="late" data-scrollwork='{"appear":{"effect":"fade","duration":0.2}}'>late</div></section>`
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await p.waitForTimeout(400);
    const before = await p.evaluate(() => getComputedStyle(document.getElementById('late')).opacity);
    // the page collapses the spacer: the section keeps its height, nothing resizes
    await p.evaluate(() => (document.getElementById('spacer').style.height = '50px'));
    await p.waitForTimeout(150);
    const halfway = await p.evaluate(() => getComputedStyle(document.getElementById('late')).opacity);
    // and a class hides the banner: now it is in view
    await p.evaluate(() => document.getElementById('banner').classList.add('gone'));
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => getComputedStyle(document.getElementById('late')).opacity);
    check(tag('an element moved into view by the page, with no scroll or resize, appears'), before === '0' && after === '1', `${before} ${halfway} ${after}`);
    check(tag('no errors (layout change)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── seek with a clock: an appear plays in time, and a seek back readies it (1.5.0) ──
  {
    const { p, ctx, errors } = await page(browser, `<div style="height:2000px"></div><div id="t" data-m="t" style="height:100px">late</div><div style="height:2000px"></div>`);
    const r = await p.evaluate(() => {
      const sw = window.Scrollwork.start({ items: [{ id: 't', text: false, appear: { effect: 'fade', duration: 0.4, delay: 0, stagger: 0, ease: 'linear', offset: 0, replay: false } }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false, seekOnly: true });
      const op = () => getComputedStyle(document.getElementById('t')).opacity;
      const out = {};
      // no clock: above the start it waits, past it, it is shown finished
      sw.seek(0, 800); out.waiting = op();
      out.snapped = sw.seek(1500, 800); out.snappedOp = op();
      // a clock: back above the start readies it, then arriving plays from that moment
      sw.seek(0, 800, 1000); out.readied = op();
      out.moving = sw.seek(1500, 800, 1000); out.start = op();
      out.half = sw.seek(1500, 800, 1200); out.halfOp = op();
      out.done = sw.seek(1500, 800, 1500); out.doneOp = op();
      // and it stays finished while the position holds
      out.still = sw.seek(1500, 800, 3000);
      sw.stop();
      return out;
    });
    check(tag('seek without a clock snaps an arrived appear to its end'), r.waiting === '0' && r.snapped === false && r.snappedOp === '1', JSON.stringify(r));
    check(tag('seek with a clock back above the start readies the appear'), r.readied === '0', r.readied);
    check(tag('seek with a clock plays the arrival in time'), r.moving === true && r.start === '0' && parseFloat(r.halfOp) > 0.3 && parseFloat(r.halfOp) < 0.7 && r.done === false && r.doneOp === '1', JSON.stringify(r));
    check(tag('and reports nothing in flight once finished'), r.still === false);
    check(tag('no errors (timed seek)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ── the end of the page: an appear in the screen's bottom 15% still plays (1.10.0) ──
  {
    const html = `<style>body{margin:0}</style><div style="height:2000px"></div><div id="f" data-m="f" style="height:60px">footer</div>`;
    const item = { id: 'f', text: false, appear: { effect: 'fade', duration: 0.2, delay: 0, stagger: 0, ease: 'linear', offset: 15, replay: false } };
    const { p, ctx, errors } = await page(browser, html);
    const r = await p.evaluate(async (item) => {
      const sw = window.Scrollwork.start({ items: [item], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false });
      const op = () => getComputedStyle(document.getElementById('f')).opacity;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await wait(100);
      const before = op();
      // scrolled to the very end: the footer's top is on screen but below the 15% line
      window.scrollTo(0, document.documentElement.scrollHeight);
      await wait(600);
      const top = document.getElementById('f').getBoundingClientRect().top;
      const out = { before, after: op(), top, line: innerHeight * 0.85 };
      sw.stop();
      return out;
    }, item);
    check(tag('live: an appear below the offset line at the end of the page plays'), r.before === '0' && r.top > r.line && r.after === '1', JSON.stringify(r));
    // seek mode: the same at the bottom it is told, and not a pixel before
    const s = await p.evaluate((item) => {
      window.scrollTo(0, 0);
      const sw = window.Scrollwork.start({ items: [item], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false, seekOnly: true });
      const op = () => getComputedStyle(document.getElementById('f')).opacity;
      sw.seek(1200, 800, undefined, 1260); const short = op();
      sw.seek(1260, 800, undefined, 1260); const end = op();
      sw.seek(1260, 800); const derived = op();
      sw.stop();
      return { short, end, derived };
    }, item);
    check(tag('seek: plays at the bottom it is given, waits short of it'), s.short === '0' && s.end === '1', JSON.stringify(s));
    check(tag('seek: the bottom defaults to the root height less the screen'), s.derived === '1', JSON.stringify(s));
    check(tag('no errors (end of page)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { p, ctx, errors } = await page(browser, `<div id="a">a</div>`);
    const back = await p.evaluate(async () => {
      const a = window.Scrollwork.animate('#a', { x: [0, 100] }, { duration: 0.2, delay: 0.8, ease: 'linear' });
      await a.finished;
      const t0 = performance.now();
      a.reverse();
      await a.finished;
      return { ms: Math.round(performance.now() - t0), x: getComputedStyle(document.getElementById('a')).translate };
    });
    check(tag('reverse() ends when it is back at the start, not after the delay again'), back.ms < 500 && !/100px/.test(back.x), JSON.stringify(back));
    check(tag('no errors (reverse)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // durations and curves from CSS variables: the design's tokens (vars.ts)
  {
    const { p, ctx, errors, warnings } = await page(
      browser,
      `<style>:root{--dur:3000ms;--ease-brand:cubic-bezier(0.2,0,0,1)}</style>
       <div id="t" data-scrollwork='{"appear":{"effect":"fade","duration":"var(--dur)"}}'>slow, from the token</div>
       <div id="c" data-scrollwork='{"appear":{"effect":"fade","duration":3}}'>slow, written as a number</div>
       <div id="f" data-scrollwork='{"appear":{"effect":"fade","duration":"var(--missing, 0.2)"}}'>quick, from the fallback</div>
       <button id="h" data-scrollwork='{"interactions":[{"trigger":"hover","action":{"type":"change","state":{"scale":1.2}},"animation":{"curve":"var(--ease-brand)","duration":"var(--dur)"}}]}'>hover</button>`
    );
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(1000);
    const o = await p.evaluate(() => ({ t: +getComputedStyle(document.getElementById('t')).opacity, c: +getComputedStyle(document.getElementById('c')).opacity, f: +getComputedStyle(document.getElementById('f')).opacity }));
    // the default 0.8s would be done by now; 3000ms from the variable moves as 3 written out does
    check(tag('a duration from a CSS variable plays as the number would'), o.t < 0.97 && Math.abs(o.t - o.c) < 0.05, JSON.stringify(o));
    check(tag('a missing variable takes its fallback: 0.2s is done'), o.f > 0.98, String(o.f));
    check(tag('a bezier token plays as a curve, with no warning'), !warnings.some((w) => /--ease-brand|--dur/.test(w)), warnings.join(' | '));
    check(tag('no errors (variables)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── scrollwork/fx: glitch on hover draws inside the host, rests, and leaves nothing behind (1.8.0) ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const body = `<div style="height:40px"></div>
      <div id="h" style="width:300px;height:200px;background:url(PICTURE) center / cover" data-scrollwork='{"fx":[{"type":"glitch","intensity":1,"in":0.05,"out":0.05}]}'></div>
      <div id="a" style="width:300px;height:200px;margin-top:40px;background:url(PICTURE) center / cover" data-scrollwork='{"fx":[{"type":"glitch","on":"always"}]}'></div>
      <div style="height:1200px"></div>`;
    // a picture the page draws itself: a two-colour gradient, so a read-back can tell a frame from nothing
    const picture = `<script>(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, '#1b4fd8'); gr.addColorStop(1, '#f2b134'); x.fillStyle = gr; x.fillRect(0, 0, 60, 40); window.__pic = c.toDataURL(); })();</script>`;
    const { p, ctx, errors } = await page(browser, picture + body.replace(/PICTURE/g, '') , { counting: true, script: fxScript });
    const able = await p.evaluate(() => {
      for (const el of document.querySelectorAll('#h, #a')) el.style.backgroundImage = `url(${window.__pic})`;
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (!able) {
      check(tag('fx: no WebGL2 here, the page plays without it'), errors.length === 0, errors.join(' | '));
    } else {
      await sleep(400);
      const views = await p.evaluate(() => ({
        h: document.querySelectorAll('#h > canvas.ux-motion-fx').length,
        a: document.querySelectorAll('#a > canvas.ux-motion-fx').length,
        hShown: getComputedStyle(document.querySelector('#h > canvas.ux-motion-fx')).display,
        aShown: getComputedStyle(document.querySelector('#a > canvas.ux-motion-fx')).display,
        pos: getComputedStyle(document.getElementById('h')).position,
      }));
      check(tag('fx: each host holds one view canvas; at rest a hover effect shows nothing, an always-on one draws'), views.h === 1 && views.a === 1 && views.hShown === 'none' && views.aShown === 'block' && views.pos === 'relative', JSON.stringify(views));
      const f0 = await p.evaluate(() => window.__frames);
      await sleep(500);
      const f1 = await p.evaluate(() => window.__frames);
      check(tag('fx: an always-on effect keeps the loop awake'), f1 - f0 > 10, `${f1 - f0} frames in half a second`);
      // the frame has colour in it: the picture was read and drawn, not left blank
      const px = await p.evaluate(() => {
        const v = document.querySelector('#a > canvas.ux-motion-fx');
        const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
        const x = c.getContext('2d'); x.drawImage(v, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
        return { lit: lit / (d.length / 4), w: v.width, h: v.height };
      });
      check(tag('fx: the drawn frame is a picture, sized to the host at device pixels'), px.lit > 0.95 && px.w >= 300 && px.h >= 200, JSON.stringify(px));
      await p.mouse.move(150, 140);
      await sleep(300);
      const hovered = await p.evaluate(() => getComputedStyle(document.querySelector('#h > canvas.ux-motion-fx')).display);
      check(tag('fx: hovering draws the effect over the host'), hovered === 'block', hovered);
      await p.mouse.move(800, 600);
      await sleep(400);
      const left = await p.evaluate(() => getComputedStyle(document.querySelector('#h > canvas.ux-motion-fx')).display);
      check(tag('fx: leaving hides it again, the picture itself shows'), left === 'none', left);
      // out of view, an always-on effect rests
      await p.evaluate(() => window.scrollTo(0, 1400));
      await sleep(600);
      const g0 = await p.evaluate(() => window.__frames);
      await sleep(600);
      const g1 = await p.evaluate(() => window.__frames);
      check(tag('fx: scrolled away, the loop rests'), g1 - g0 <= 3, `${g1 - g0} frames in 0.6s`);
      const after = await p.evaluate(() => {
        window.sw.stop();
        return { views: document.querySelectorAll('canvas.ux-motion-fx').length, pos: document.getElementById('h').style.position, style: !!document.querySelector('style[data-scrollwork-fx]') };
      });
      check(tag('fx: stop() removes the views and gives the host its position back'), after.views === 0 && after.pos === '' && after.style, JSON.stringify(after));
    }
    check(tag('no errors (fx)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── scrollwork/fx under reduced motion: nothing draws ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const { p, ctx, errors } = await page(browser, `<div id="a" style="width:200px;height:100px;background:#246 url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==) center / cover" data-scrollwork='{"fx":[{"type":"glitch","on":"always"}]}'></div>`, { reduced: true, script: fxScript });
    await p.evaluate(() => (window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] })));
    await sleep(400);
    const shown = await p.evaluate(() => Array.from(document.querySelectorAll('canvas.ux-motion-fx')).filter((v) => getComputedStyle(v).display !== 'none').length);
    check(tag('fx: reduced motion shows the picture as it is'), shown === 0 && errors.length === 0, `${shown} drawn, ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ── scrollwork/fx distort: the pointer pushes the picture's cells, which ease back (1.13.0, Codrops' Distorted Pixels) ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    // stripes 10px wide, red and blue: a pushed cell shows the other colour where the picture had one
    const picture = `<script>(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = c.getContext('2d'); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#1030f0' : '#f01030'; x.fillRect(i * 10, 0, 10, 40); } window.__pic = c.toDataURL(); window.__picCanvas = c; })();</script>`;
    const body = `<div style="height:40px"></div><div id="d" style="width:300px;height:200px;margin-left:20px;background:url() center / cover" data-scrollwork='{"fx":[{"type":"distort","in":0.01,"grid":20,"mouse":0.4,"strength":0.6}]}'></div><div style="height:1200px"></div>`;
    const { p, ctx, errors } = await page(browser, picture + body, { counting: true, script: fxScript });
    const able = await p.evaluate(() => {
      document.getElementById('d').style.backgroundImage = `url(${window.__pic})`;
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (!able) {
      check(tag('distort: no WebGL2 here, the page plays without it'), errors.length === 0, errors.join(' | '));
    } else {
      await sleep(400);
      const view = () => p.evaluate(() => getComputedStyle(document.querySelector('#d > canvas.ux-motion-fx')).display);
      check(tag('distort: at rest nothing draws, the picture shows itself'), (await view()) === 'none');
      // how far the drawn frame is from the picture as it is: pixels whose colour is clearly the other stripe's
      const apart = () =>
        p.evaluate(() => {
          const v = document.querySelector('#d > canvas.ux-motion-fx');
          const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
          const x = c.getContext('2d'); x.drawImage(v, 0, 0);
          const got = x.getImageData(0, 0, c.width, c.height).data;
          const r = document.createElement('canvas'); r.width = v.width; r.height = v.height;
          const y = r.getContext('2d'); y.drawImage(window.__picCanvas, 0, 0, r.width, r.height);
          const want = y.getImageData(0, 0, r.width, r.height).data;
          let off = 0;
          for (let i = 0; i < got.length; i += 4) if (Math.abs(got[i] - want[i]) > 140 && Math.abs(got[i + 2] - want[i + 2]) > 140) off++;
          return off / (got.length / 4);
        });
      // sweep across it, quickly, left to right
      await p.mouse.move(40, 140);
      await p.mouse.move(300, 140, { steps: 8 });
      await sleep(60);
      check(tag('distort: moving over it draws'), (await view()) === 'block');
      const moved = await apart();
      check(tag('distort: the drawn frame is the picture pushed about, not the picture'), moved > 0.01, `${(moved * 100).toFixed(1)}% of the pixels moved`);
      await p.mouse.move(800, 700);
      await sleep(2500);
      check(tag('distort: it settles back, and the picture shows itself again'), (await view()) === 'none');
      const g0 = await p.evaluate(() => window.__frames);
      await sleep(500);
      const g1 = await p.evaluate(() => window.__frames);
      check(tag('distort: settled, the loop rests'), g1 - g0 <= 3, `${g1 - g0} frames in 0.5s`);
      const after = await p.evaluate(() => {
        window.sw.stop();
        return document.querySelectorAll('canvas.ux-motion-fx').length;
      });
      check(tag('distort: stop() removes its view'), after === 0);
    }
    check(tag('no errors (distort)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── distort with no pointer moving it: the sweep (1.13.1). Always and scroll move on their own;
  //    a hover host reached by the keyboard (or played by a host app) moves too; a picture with
  //    words laid over it still follows the pointer across them ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const picture = `<script>(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = c.getContext('2d'); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#1030f0' : '#f01030'; x.fillRect(i * 10, 0, 10, 40); } window.__pic = c.toDataURL(); window.__picCanvas = c; })();</script>`;
    const box = 'width:300px;height:200px;background:url() center / cover';
    const body = `<div id="al" style="${box}" data-scrollwork='{"fx":[{"type":"distort","on":"always","grid":20,"mouse":0.4,"strength":0.6}]}'></div>
      <div id="fo" tabindex="0" style="${box};margin-top:20px" data-scrollwork='{"fx":[{"type":"distort","in":0.01,"grid":20,"mouse":0.4,"strength":0.6}]}'></div>
      <div style="position:relative;width:300px;margin:20px 0 0 340px"><div id="cv" style="${box}" data-scrollwork='{"fx":[{"type":"distort","in":0.01,"grid":20,"mouse":0.4,"strength":0.6}]}'></div><p style="position:absolute;inset:0;margin:0">words over the picture</p></div>
      <div id="sc" style="${box};margin-top:20px" data-scrollwork='{"fx":[{"type":"distort","on":"scroll","grid":20,"mouse":0.4,"strength":0.6}]}'></div><div style="height:2400px"></div>`;
    const { p, ctx, errors } = await page(browser, picture + body, { counting: true, script: fxScript });
    const able = await p.evaluate(() => {
      for (const id of ['al', 'fo', 'cv', 'sc']) document.getElementById(id).style.backgroundImage = `url(${window.__pic})`;
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (!able) {
      check(tag('distort sweep: no WebGL2 here, the page plays without it'), errors.length === 0, errors.join(' | '));
    } else {
      const view = (id) => p.evaluate((id) => getComputedStyle(document.querySelector(`#${id} > canvas.ux-motion-fx`)).display, id);
      // the share of the drawn frame that is clearly the other stripe's colour
      const apart = (id) =>
        p.evaluate((id) => {
          const v = document.querySelector(`#${id} > canvas.ux-motion-fx`);
          const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
          const x = c.getContext('2d'); x.drawImage(v, 0, 0);
          const got = x.getImageData(0, 0, c.width, c.height).data;
          const r = document.createElement('canvas'); r.width = v.width; r.height = v.height;
          const y = r.getContext('2d'); y.drawImage(window.__picCanvas, 0, 0, r.width, r.height);
          const want = y.getImageData(0, 0, r.width, r.height).data;
          let off = 0;
          for (let i = 0; i < got.length; i += 4) if (Math.abs(got[i] - want[i]) > 140 && Math.abs(got[i + 2] - want[i + 2]) > 140) off++;
          return off / (got.length / 4);
        }, id);
      await sleep(900);
      check(tag('distort sweep: always, with no pointer at all, draws the picture pushed about'), (await view('al')) === 'block' && (await apart('al')) > 0.01, `${((await apart('al')) * 100).toFixed(1)}% moved`);
      const f0 = await p.evaluate(() => window.__frames);
      await sleep(400);
      const f1 = await p.evaluate(() => window.__frames);
      check(tag('distort sweep: always keeps the loop awake'), f1 - f0 > 8, `${f1 - f0} frames in 0.4s`);
      // the pointer arriving and resting there (a click on a host app's play button over the picture) is not a move
      await p.mouse.move(150, 100);
      await sleep(400);
      check(tag('distort sweep: a pointer arriving without moving leaves the sweep going'), (await view('al')) === 'block', await view('al'));
      await p.mouse.move(900, 650);
      check(tag('distort sweep: a hover one with no pointer rests, the picture shows itself'), (await view('fo')) === 'none' && (await view('cv')) === 'none');
      await p.evaluate(() => document.getElementById('fo').focus());
      await sleep(600);
      check(tag('distort sweep: reached by the keyboard, it moves on its own'), (await view('fo')) === 'block' && (await apart('fo')) > 0.01, `${((await apart('fo')) * 100).toFixed(1)}% moved`);
      await p.evaluate(() => document.getElementById('fo').blur());
      await sleep(2500);
      check(tag('distort sweep: let go, it settles back and hides'), (await view('fo')) === 'none');
      // across the words laid over the picture: the words take the events, the picture still follows
      const b = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      await p.mouse.move(b.x + 10, b.y + b.h / 2);
      await p.mouse.move(b.x + b.w - 10, b.y + b.h / 2, { steps: 8 });
      await sleep(60);
      check(tag('distort sweep: under words laid over it, the pointer still pushes the cells'), (await view('cv')) === 'block', await view('cv'));
      await p.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
      await sleep(2500);
      check(tag('distort sweep: a pointer resting over a hover one leaves it still (no sweep under a real pointer)'), (await view('cv')) === 'none', await view('cv'));
      // scroll: still at rest, moving while the page scrolls fast
      check(tag('distort sweep: on scroll, at rest it shows the picture'), (await view('sc')) === 'none');
      const during = await p.evaluate(async () => {
        let shown = 0;
        for (let i = 0; i < 24; i++) {
          window.scrollBy(0, i < 12 ? 40 : -40);
          await new Promise((r) => requestAnimationFrame(r));
          const v = document.querySelector('#sc > canvas.ux-motion-fx');
          if (getComputedStyle(v).display === 'block') shown++;
        }
        return shown;
      });
      check(tag('distort sweep: on scroll, the scroll speed moves it'), during > 0, `${during} of 24 frames drawn`);
      await p.evaluate(() => window.sw.stop());
    }
    check(tag('no errors (distort sweep)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── distort on scroll alone on the page (1.13.2): nothing else keeps the loop awake, so each
  //    wheel step wakes it; the step that woke it must count as speed, or the picture never moves ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const picture = `<script>(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = c.getContext('2d'); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#1030f0' : '#f01030'; x.fillRect(i * 10, 0, 10, 40); } window.__pic = c.toDataURL(); })();</script>`;
    const body = `<div style="height:60px"></div><div id="so" style="width:300px;height:200px;background:url() center / cover" data-scrollwork='{"fx":[{"type":"distort","on":"scroll","grid":20,"mouse":0.4,"strength":0.6}]}'></div><div style="height:2400px"></div>`;
    const { p, ctx, errors } = await page(browser, picture + body, { script: fxScript });
    const able = await p.evaluate(() => {
      document.getElementById('so').style.backgroundImage = `url(${window.__pic})`;
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (!able) {
      check(tag('distort scroll alone: no WebGL2 here, the page plays without it'), errors.length === 0, errors.join(' | '));
    } else {
      await sleep(600);
      const view = () => p.evaluate(() => getComputedStyle(document.querySelector('#so > canvas.ux-motion-fx')).display);
      check(tag('distort scroll alone: at rest it shows the picture'), (await view()) === 'none');
      // the page scrolled a step at a time, the loop resting between steps
      const stepped = await p.evaluate(async () => {
        let shown = 0;
        for (let i = 0; i < 16; i++) {
          window.scrollBy(0, 30);
          for (let f = 0; f < 3; f++) {
            await new Promise((r) => requestAnimationFrame(r));
            if (getComputedStyle(document.querySelector('#so > canvas.ux-motion-fx')).display === 'block') shown++;
          }
        }
        return shown;
      });
      check(tag('distort scroll alone: scrolled step by step, the scroll speed moves it'), stepped > 0, `${stepped} of 48 frames drawn`);
      await sleep(2500);
      await p.evaluate(() => window.scrollTo(0, 0));
      await sleep(2500);
      // a real wheel
      await p.mouse.move(150, 150);
      let wheeled = 0;
      for (let i = 0; i < 10; i++) {
        await p.mouse.wheel(0, 60);
        await sleep(30);
        if ((await view()) === 'block') wheeled++;
      }
      check(tag('distort scroll alone: a wheel moves it'), wheeled > 0, `${wheeled} of 10 wheel steps drawn`);
      await sleep(3000);
      check(tag('distort scroll alone: the page still, it settles back'), (await view()) === 'none');
      await p.evaluate(() => window.sw.stop());
    }
    check(tag('no errors (distort scroll alone)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── distort under reduced motion: the picture as it is, nothing moves ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const { p, ctx, errors } = await page(browser, `<div id="a" style="width:200px;height:100px;background:#246 url(data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==) center / cover" data-scrollwork='{"fx":[{"type":"distort","on":"appear"}]}'></div>`, { reduced: true, script: fxScript });
    await p.evaluate(() => (window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] })));
    await p.mouse.move(10, 10);
    await p.mouse.move(150, 60, { steps: 6 });
    await sleep(400);
    const shown = await p.evaluate(() => Array.from(document.querySelectorAll('canvas.ux-motion-fx')).filter((v) => getComputedStyle(v).display !== 'none').length);
    check(tag('distort: reduced motion shows the picture as it is'), shown === 0 && errors.length === 0, `${shown} drawn, ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ── roll: each digit is a wheel that lands on its value; the words stay the words (1.9.0) ──
  {
    const { p, ctx, errors } = await page(browser, `<div style="height:20px"></div><p id="n" style="font:48px/1.1 sans-serif" data-scrollwork='{"text":true,"appear":{"effect":"roll","duration":0.6,"stagger":0.05,"offset":0}}'>$1M-2M 500+</p><div style="height:1500px"></div>`, { counting: true });
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    const early = await p.evaluate(() => ({ cols: document.querySelectorAll('#n .ux-motion-roll').length, rows: Array.from(document.querySelectorAll('#n .ux-motion-roll')).map((c) => c.children.length), said: document.querySelector('#n .ux-motion-said')?.textContent }));
    check(tag('roll: one wheel per digit, as long as a turn and the digit; the whole text said once'), early.cols === 5 && early.rows.join(',') === '13,14,17,12,12' && early.said === '$1M-2M 500+', JSON.stringify(early));
    await sleep(1400);
    const landed = await p.evaluate(() =>
      Array.from(document.querySelectorAll('#n .ux-motion-roll')).map((c) => {
        const win = c.parentElement.getBoundingClientRect();
        const row = Array.from(c.children).find((r) => Math.abs(r.getBoundingClientRect().top - win.top) < 2);
        return row ? row.textContent : '?';
      }).join('')
    );
    check(tag('roll: every wheel shows its own digit at the end'), landed === '12500', landed);
    const back = await p.evaluate(() => {
      window.sw.stop();
      return { html: document.getElementById('n').innerHTML, text: document.getElementById('n').textContent };
    });
    check(tag('roll: stop() gives the text back as it was'), back.html === '$1M-2M 500+', back.html);
    check(tag('no errors (roll)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── loop: plays while on screen, rests off it, nothing under reduced motion (1.9.0) ──
  {
    const body = `<div id="m" style="width:200px;height:40px;background:#123" data-scrollwork='{"loop":{"to":{"x":-100},"duration":1}}'></div><div style="height:3000px"></div>`;
    const { p, ctx, errors } = await page(browser, body, { counting: true });
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(300);
    const xs = [];
    for (let i = 0; i < 4; i++) {
      xs.push(await p.evaluate(() => document.getElementById('m').getBoundingClientRect().left));
      await sleep(170);
    }
    const moved = xs.some((x, i) => i && x !== xs[i - 1]);
    check(tag('loop: the element keeps moving'), moved && xs.every((x) => x <= 0.5 && x >= -100.5), xs.map((x) => x.toFixed(1)).join(' '));
    await p.evaluate(() => window.scrollTo(0, 2000));
    await sleep(500);
    const f0 = await p.evaluate(() => window.__frames);
    await sleep(600);
    const f1 = await p.evaluate(() => window.__frames);
    check(tag('loop: scrolled away, the loop rests'), f1 - f0 <= 3, `${f1 - f0} frames`);
    const after = await p.evaluate(() => {
      window.sw.stop();
      const el = document.getElementById('m');
      return { translate: el.style.translate, left: el.getBoundingClientRect().left };
    });
    check(tag('loop: stop() puts the element back'), after.translate === '' && after.left === 0, JSON.stringify(after));
    check(tag('no errors (loop)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
    const r = await page(browser, body, { reduced: true });
    await r.p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(500);
    const still = await r.p.evaluate(() => document.getElementById('m').getBoundingClientRect().left);
    check(tag('loop: reduced motion holds it at rest'), still === 0, String(still));
    await r.ctx.close();
  }

  // ── scrollwork/fx dither: a crisp field of dots that the pointer thins out (1.9.0) ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const body = `<div id="d" style="position:relative;width:400px;height:300px;background:#fff" data-scrollwork='{"fx":[{"type":"dither","intensity":1,"radius":80,"trail":0.05,"in":0.05}]}'><p id="over" style="position:absolute;inset:0;margin:0">words over the field</p></div><div style="height:1500px"></div>`;
    const { p, ctx, errors } = await page(browser, body, { counting: true, script: fxScript });
    const able = await p.evaluate(() => {
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (!able) check(tag('dither: no WebGL2 here, the page plays without it'), errors.length === 0, errors.join(' | '));
    else {
      await sleep(400);
      const v = await p.evaluate(() => {
        const c = document.querySelector('#d > canvas.ux-motion-fx');
        return { shown: getComputedStyle(c).display, crisp: c.classList.contains('is-crisp'), w: c.width, h: c.height };
      });
      check(tag('dither: draws at one bitmap pixel per CSS pixel, crisp'), v.shown === 'block' && v.crisp && v.w === 400 && v.h === 300, JSON.stringify(v));
      const ink = (x0, y0, size) =>
        p.evaluate(([x0, y0, size]) => {
          const v = document.querySelector('#d > canvas.ux-motion-fx');
          const c = document.createElement('canvas');
          c.width = v.width;
          c.height = v.height;
          const g = c.getContext('2d');
          g.drawImage(v, 0, 0);
          const d = g.getImageData(x0, y0, size, size).data;
          let dark = 0, tint = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 200 && d[i] < 40 && d[i + 1] < 40) dark++;
            if (d[i + 3] > 20 && d[i + 1] > d[i] + 10) tint++;
          }
          return { dark: dark / (size * size), tint: tint / (size * size) };
        }, [x0, y0, size]);
      const before = await ink(170, 120, 60);
      check(tag('dither: only dots and clear paper, some of them inked'), before.dark > 0.05 && before.dark < 0.95, JSON.stringify(before));
      const f0 = await p.evaluate(() => window.__frames);
      await sleep(400);
      const f1 = await p.evaluate(() => window.__frames);
      check(tag('dither: always on, the cloud keeps drifting'), f1 - f0 > 8, `${f1 - f0} frames`);
      // the words cover the field: the pointer still reaches it
      await p.mouse.move(200, 150);
      await sleep(250);
      await p.mouse.move(201, 151);
      await sleep(250);
      const near = await ink(170, 120, 60);
      check(tag('dither: under the pointer, through what covers it, the dots thin and the paper takes the accent'), near.dark < before.dark * 0.9 && near.tint > 0.2, JSON.stringify({ before, near }));
      // the field is behind the box's content: the words over it are what the pointer and the eye find
      const order = await p.evaluate(() => {
        const host = document.getElementById('d');
        const v = host.querySelector(':scope > canvas.ux-motion-fx');
        const r = document.getElementById('over').getBoundingClientRect();
        const top = document.elementFromPoint(r.left + 5, r.top + 5);
        return { first: host.firstElementChild === v, z: getComputedStyle(v).zIndex, iso: getComputedStyle(host).isolation, top: top && top.id };
      });
      check(tag('dither: a field sits behind the box’s children, over its fill'), order.first && order.z === '-1' && order.iso === 'isolate' && order.top === 'over', JSON.stringify(order));
      const after = await p.evaluate(() => {
        window.sw.stop();
        const host = document.getElementById('d');
        return { views: document.querySelectorAll('canvas.ux-motion-fx').length, iso: host.style.isolation };
      });
      check(tag('dither: stop() removes the view and the isolation'), after.views === 0 && after.iso === '', JSON.stringify(after));
    }
    check(tag('no errors (dither)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a field on a box that scrolls sideways (a carousel) stays on the box (1.9.2) ──
  {
    const fxScript = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-fx.min.js"></script>';
    const body = `<div id="s" style="display:flex;width:400px;height:200px;overflow-x:auto;overflow-y:hidden;background:#fff" data-scrollwork='{"fx":[{"type":"dither","intensity":1}]}'><div style="flex:0 0 1200px;height:200px"></div></div>`;
    const { p, ctx, errors } = await page(browser, body, { script: fxScript });
    const able = await p.evaluate(() => {
      const can = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2') && !!document.createElement('canvas').getContext('bitmaprenderer');
      window.sw = window.Scrollwork.auto(document.body, { plugins: [window.ScrollworkFx.fx] });
      return can;
    });
    if (able) {
      await sleep(300);
      const at = () =>
        p.evaluate(() => {
          const host = document.getElementById('s');
          const v = host.querySelector(':scope > canvas.ux-motion-fx');
          const a = host.getBoundingClientRect(), b = v.getBoundingClientRect();
          return { dx: Math.round(b.left - a.left), w: Math.round(b.width), scroll: host.scrollLeft };
        });
      const before = await at();
      await p.evaluate(() => { document.getElementById('s').scrollLeft = 300; });
      await sleep(150);
      const after = await at();
      check(tag('dither: on a box that scrolls sideways, the field stays on the box'), before.dx === 0 && after.scroll === 300 && after.dx === 0 && after.w === 400, JSON.stringify({ before, after }));
    }
    check(tag('no errors (dither in a scroller)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── rollovers: a letter roll and a wipe on a control's hover and focus (1.12.0) ──
  {
    const body = `<p style="padding:40px">
        <a id="cta" href="#x" style="display:inline-flex;padding:14px 24px;background:#fff;color:#020108;font:16px/1.2 sans-serif;text-decoration:none">
          <span id="lbl" data-scrollwork='{"rollover":{"effect":"roll"}}'>Get started</span></a>
        <button id="wipe" style="margin-left:40px;padding:14px 24px;border:0;border-radius:0;background-color:rgb(17, 17, 17);color:rgb(255, 255, 255);font:16px sans-serif"
          data-scrollwork='{"rollover":{"effect":"wipe","color":"rgb(166, 244, 197)","ink":"rgb(0, 0, 0)"}}'>Contact</button>
        <button id="up" style="margin-left:40px;padding:14px 24px;border:0;background:#111;color:#fff"
          data-scrollwork='{"rollover":{"effect":"wipe","color":"#ff6b02","direction":"up"}}'>Up</button>
        <button id="both" style="margin-left:40px;padding:14px 24px;border:0;background:rgb(255, 255, 255);color:rgb(2, 1, 8);font:16px/1.2 sans-serif"
          data-scrollwork='{"rollover":[{"effect":"roll"},{"effect":"wipe","color":"rgb(255, 107, 2)","duration":0.2}]}'>Get started</button>
        <span id="bad" data-scrollwork='{"rollover":{"effect":"wipe"}}'>no colour</span>
        <button id="painted" style="margin-left:40px;padding:14px 24px;border:0;background:#111;color:rgb(255, 255, 255)"
          data-scrollwork='{"appear":{"effect":"fade","duration":0.1},"rollover":{"effect":"wipe","color":"#A6F4C5","ink":"rgb(0, 0, 0)","duration":0.2}}'><span>Talk to us</span></button></p>`;
    const { p, ctx, errors, warnings } = await page(browser, body);
    const before = await p.evaluate(() => ({ cta: document.getElementById('cta').outerHTML, wipe: document.getElementById('wipe').style.cssText }));
    await p.evaluate(() => (window.sw = window.Scrollwork.auto()));
    await sleep(100);
    const letters = () =>
      p.evaluate(() => {
        const ty = (c) => new DOMMatrix(getComputedStyle(c).transform).f;
        const lbl = document.getElementById('lbl');
        const top = lbl.querySelector('.sw-roll').getBoundingClientRect().top;
        return {
          label: [...lbl.querySelectorAll('.sw-roll-label .sw-roll-char')].map((c) => Math.round(ty(c))),
          copyTop: [...lbl.querySelectorAll('.sw-roll-copy .sw-roll-char')].map((c) => Math.round(c.getBoundingClientRect().top - top)),
          h: Math.round(lbl.querySelector('.sw-roll').getBoundingClientRect().height),
        };
      });
    const made = await p.evaluate(() => {
      const lbl = document.getElementById('lbl');
      return { chars: lbl.querySelectorAll('.sw-roll-label .sw-roll-char').length, copies: lbl.querySelectorAll('.sw-roll-copy .sw-roll-char').length, hidden: lbl.querySelector('.sw-roll').getAttribute('aria-hidden'), said: lbl.querySelector('.sw-roll-said')?.textContent };
    });
    check(tag('roll: the label in letters, a copy behind it, hidden from a screen reader that hears the words once'), made.chars === 10 && made.copies === 10 && made.hidden === 'true' && made.said === 'Get started', JSON.stringify(made));
    const rest = await letters();
    check(tag('roll: at rest the letters sit still and the copy waits below, out of the window'), rest.label.every((y) => y === 0) && rest.copyTop.every((y) => y >= rest.h - 1), JSON.stringify(rest));
    // the pointer on the button's padding, not on the letters: the control plays it
    const box = await p.locator('#cta').boundingBox();
    await p.mouse.move(box.x + 6, box.y + box.height / 2);
    await sleep(110);
    const mid = await letters();
    check(tag('roll: hovering the control (not the words) starts it, first letter ahead of the last'), mid.label[0] < mid.label[9] && mid.label[0] < 0, JSON.stringify(mid.label));
    await sleep(600);
    const over = await letters();
    check(tag('roll: every letter goes out the top as the copy comes into the window'), over.label.every((y) => Math.abs(y + over.h) <= 1) && over.copyTop.every((y) => Math.abs(y) <= 1), JSON.stringify(over));
    await p.mouse.move(5, 5);
    await sleep(700);
    const back = await letters();
    check(tag('roll: leaving puts them back'), back.label.every((y) => y === 0), JSON.stringify(back.label));
    // the keyboard: focus shows it as hover does
    // a key, then the focus on the link: keyboard focus (:focus-visible) in all three. Not Tab itself:
    // WebKit leaves links out of the Tab order (macOS's own setting, Option-Tab reaches them)
    await p.keyboard.press('Shift');
    await p.evaluate(() => document.getElementById('cta').focus());
    await sleep(700);
    const focused = await letters();
    check(tag('roll: keyboard focus plays it'), focused.label.every((y) => y < 0), JSON.stringify(focused.label));
    await p.evaluate(() => document.getElementById('cta').blur());
    await sleep(700);
    check(tag('roll: and moving the focus on puts it back'), (await letters()).label.every((y) => y === 0));
    // that Tab reached the wipe's button and, rightly, played it: the focus leaves before the wipe's own checks
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await sleep(1000);

    // the wipe
    const w = () => p.evaluate(() => { const b = document.getElementById('wipe'); const cs = getComputedStyle(b); return { size: cs.backgroundSize.split(',')[0].trim(), pos: cs.backgroundPosition.split(',')[0].trim(), color: cs.color, fill: cs.backgroundColor }; });
    const w0 = await w();
    check(tag('wipe: at rest the colour is a sliver at the left, the button its own colour'), w0.size === '0% 100%' && /^0%|^left/.test(w0.pos) && w0.color === 'rgb(255, 255, 255)' && w0.fill === 'rgb(17, 17, 17)', JSON.stringify(w0));
    const wb = await p.locator('#wipe').boundingBox();
    await p.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
    await sleep(250);
    const w1 = await w();
    await sleep(900);
    const w2 = await w();
    check(tag('wipe: hovered, the colour grows across from the left as the words turn black'), parseFloat(w1.size) > 0 && parseFloat(w1.size) < 100 && w2.size === '100% 100%' && w2.color === 'rgb(0, 0, 0)' && w2.fill === 'rgb(17, 17, 17)', JSON.stringify({ w1, w2 }));
    await p.mouse.move(5, 5);
    await sleep(1000);
    const w3 = await w();
    check(tag('wipe: leaving takes it back'), w3.size === '0% 100%' && w3.color === 'rgb(255, 255, 255)', JSON.stringify(w3));
    const up = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById('up')); return { size: cs.backgroundSize, pos: cs.backgroundPosition }; });
    check(tag('wipe up: it rises from the bottom edge'), up.size === '100% 0%' && /50% 100%|center bottom/.test(up.pos), JSON.stringify(up));
    // both on one button (a uxdeck button holds its own words): the letters roll as the fill wipes
    const bb = await p.locator('#both').boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await sleep(800);
    const both = await p.evaluate(() => { const b = document.getElementById('both'); return { rolled: [...b.querySelectorAll('.sw-roll-label .sw-roll-char')].every((c) => new DOMMatrix(getComputedStyle(c).transform).f < 0), size: getComputedStyle(b).backgroundSize.split(',')[0].trim() }; });
    check(tag('roll and wipe on one button: both play'), both.rolled && both.size === '100% 100%', JSON.stringify(both));
    await p.mouse.move(5, 5);
    await sleep(800);
    // the engine paints this button (an appear) and writes its inline colour as it does: the words still darken
    const pb2 = await p.locator('#painted').boundingBox();
    await p.mouse.move(pb2.x + pb2.width / 2, pb2.y + pb2.height / 2);
    await sleep(500);
    const painted = await p.evaluate(() => ({ own: getComputedStyle(document.getElementById('painted')).color, inner: getComputedStyle(document.querySelector('#painted span')).color }));
    const paintedSize = await p.evaluate(() => getComputedStyle(document.getElementById('painted')).backgroundSize.split(',')[0].trim() + ' ' + getComputedStyle(document.getElementById('painted')).backgroundImage.slice(0, 30));
    check(tag('wipe: on a button the engine also paints, the colour still sweeps and the words darken (inside too)'), painted.own === 'rgb(0, 0, 0)' && painted.inner === 'rgb(0, 0, 0)' && /^100% 100% linear-gradient/.test(paintedSize), JSON.stringify(painted) + ' ' + paintedSize);
    await p.mouse.move(5, 5);
    await sleep(500);
    check(tag('wipe with no colour: says so, and does nothing'), warnings.some((m) => /rollover\.color/.test(m)), warnings.join(' | ').slice(0, 200));

    await p.evaluate(() => window.sw.stop());
    const after = await p.evaluate(() => ({ cta: document.getElementById('cta').outerHTML, wipe: document.getElementById('wipe').style.cssText }));
    check(tag('rollover: stop() gives the label and the button back as they were'), after.cta === before.cta && after.wipe === before.wipe, JSON.stringify({ before: before.wipe, after: after.wipe }));
    check(tag('no errors (rollover)'), errors.length === 0, errors.join(' | '));
    await ctx.close();

    // reduced motion: the letters never move; a wipe's colours change at once
    const r = await page(browser, body, { reduced: true });
    await r.p.evaluate(() => window.Scrollwork.auto());
    await sleep(100);
    const rb = await r.p.locator('#cta').boundingBox();
    await r.p.mouse.move(rb.x + 6, rb.y + rb.height / 2);
    await sleep(400);
    const still = await r.p.evaluate(() => [...document.querySelectorAll('#lbl .sw-roll-label .sw-roll-char')].every((c) => new DOMMatrix(getComputedStyle(c).transform).f === 0));
    const rw = await r.p.locator('#wipe').boundingBox();
    await r.p.mouse.move(rw.x + rw.width / 2, rw.y + rw.height / 2);
    await sleep(40);
    const at = await r.p.evaluate(() => getComputedStyle(document.getElementById('wipe')).backgroundSize.split(',')[0].trim());
    check(tag('reduced motion: the letters stay, the wipe is there at once'), still && at === '100% 100%', JSON.stringify({ still, at }));
    await r.ctx.close();

    // a tap on a touch screen does not leave it hovered
    const tctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, hasTouch: true });
    const tp = await tctx.newPage();
    await tp.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}<script src="/scrollwork.min.js"></script></body></html>` });
      return route.fulfill({ contentType: 'text/javascript', body: DIST(path.slice(1)) });
    });
    await tp.goto(`${ORIGIN}/`);
    await tp.evaluate(() => window.Scrollwork.auto());
    await sleep(100);
    await tp.tap('#wipe');
    await sleep(1000);
    const tapped = await tp.evaluate(() => getComputedStyle(document.getElementById('wipe')).backgroundSize.split(',')[0].trim());
    check(tag('touch: a tap does not play the wipe'), tapped === '0% 100%', tapped);
    await tctx.close();
  }


  // ── 1.14: timeline(), any property, SVG draw, and scroll()'s start, end, smooth, snap and callbacks ──
  {
    const { p, ctx, errors } = await page(
      browser,
      `<style>.box{width:200px;height:40px} #w2{width:200px}</style>
       <div id="a" class="box">a</div><div id="b" class="box">b</div><div id="c" class="box">c</div>
       <div id="d" class="box">d</div><div id="e" class="box">e</div>
       <div id="w" class="box">w</div><div id="w2" class="box">w2</div><div id="v" class="box">v</div>
       <div id="col" class="box" style="background-color:#000000">col</div><div id="clip" class="box">clip</div>
       <svg width="300" height="60"><path id="line" d="M0 30 H200" stroke="black" fill="none"/></svg>`
    );
    const x = (id) => `new DOMMatrix(getComputedStyle(document.getElementById('${id}')).transform).e || parseFloat((getComputedStyle(document.getElementById('${id}')).translate || '0').split(' ')[0]) || 0`;
    const tlA = await p.evaluate((x) => {
      const X = (id) => new Function('return ' + x.replace(/\$\{id\}/g, id))();
      const S = window.Scrollwork;
      window.tl = S.timeline({ autoplay: false })
        .add('#a', { x: [0, 100] }, { duration: 0.4, ease: 'linear' })
        .add('#b', { x: [0, 100] }, { duration: 0.4, ease: 'linear' });
      return null;
    }, '');
    await sleep(30);
    const at = async (prog) => p.evaluate((prog) => {
      window.tl.seek(prog);
      const tx = (id) => parseFloat((getComputedStyle(document.getElementById(id)).translate || '0').split(' ')[0]) || 0;
      return { a: tx('a'), b: tx('b') };
    }, prog);
    const q1 = await at(0.25);
    const q3 = await at(0.75);
    const dur = await p.evaluate(() => window.tl.duration);
    check(tag('timeline: one after the other'), Math.abs(q1.a - 50) < 1 && q1.b === 0 && q3.a === 100 && Math.abs(q3.b - 50) < 1 && Math.abs(dur - 0.8) < 1e-6, JSON.stringify({ q1, q3, dur }));

    const places = await p.evaluate(() => {
      const S = window.Scrollwork;
      const t = S.timeline({ autoplay: false, defaults: { duration: 1 } }).add({ v: 0 }, { v: 1 }).add({ v: 0 }, { v: 1 }, {}, '-=0.5').label('mid').add({ v: 0 }, { v: 1 }, { duration: 0.5 }, '<').add({ v: 0 }, { v: 1 }, { duration: 0.5 }, 'mid+=1');
      return { d: t.duration, mid: t.labelAt('mid') };
    });
    check(tag('timeline: overlaps, "<" and labels place motions'), Math.abs(places.d - 3) < 1e-6 && Math.abs(places.mid - 1.5) < 1e-6, JSON.stringify(places));

    const hand = await p.evaluate(() => {
      const S = window.Scrollwork;
      const tx = (id) => parseFloat((getComputedStyle(document.getElementById(id)).translate || '0').split(' ')[0]) || 0;
      const t = S.timeline({ autoplay: false, defaults: { duration: 0.4, ease: 'linear' } })
        .add('#c', { opacity: [1, 0] })
        .add('#c', { y: [0, 100] })
        .add('#d', { x: 100 }, {}, 0)
        .add('#d', { x: 300 }, {}, 0.4)
        .add('#e', { opacity: [0, 1] }, {}, 0.6);
      t.seek(0);
      const start = { e: getComputedStyle(document.getElementById('e')).opacity };
      // the last motion ends at 1 s: 0.6 is 0.6 s
      t.seek(0.6);
      const c = getComputedStyle(document.getElementById('c'));
      return { start, cOp: c.opacity, cY: parseFloat(c.translate.split(' ')[1] || '0'), dX: tx('d') };
    });
    check(tag('timeline: a later motion on another value keeps the first one’s end'), parseFloat(hand.cOp) < 0.01 && Math.abs(hand.cY - 50) < 1, JSON.stringify(hand));
    check(tag('timeline: given only an end, it starts where the one before left off'), Math.abs(hand.dX - 200) < 1, JSON.stringify(hand));
    check(tag('timeline: a fade in later on is hidden from the start'), parseFloat(hand.start.e) < 0.01, JSON.stringify(hand));

    const played = await p.evaluate(async () => {
      const S = window.Scrollwork;
      let calls = 0;
      let done = 0;
      const t = S.timeline({ onComplete: () => done++ })
        .add('#a', { x: [0, 40] }, { duration: 0.2 })
        .call(() => calls++)
        .add('#b', { x: [0, 40] }, { duration: 0.2 });
      await t.finished;
      const end = calls;
      t.reverse();
      await t.finished;
      const tx = (id) => parseFloat((getComputedStyle(document.getElementById(id)).translate || '0').split(' ')[0]) || 0;
      return { end, calls, done, a: tx('a'), b: tx('b') };
    });
    check(tag('timeline: plays to its end, calls on the way, and reverses to the start'), played.end === 1 && played.calls === 2 && played.done === 2 && played.a === 0 && played.b === 0, JSON.stringify(played));

    const cancel = await p.evaluate(() => {
      const S = window.Scrollwork;
      const el = document.getElementById('w');
      el.style.opacity = '0.8';
      const t = S.timeline({ autoplay: false }).add('#w', { opacity: [0, 1], width: ['100px', '300px'] });
      t.seek(0.5);
      const mid = el.getAttribute('style');
      t.cancel();
      return { mid, after: el.getAttribute('style') };
    });
    check(tag('timeline: cancel gives the element back as it was'), cancel.after === 'opacity: 0.8;' && cancel.mid !== cancel.after, JSON.stringify(cancel));

    const props = await p.evaluate(() => {
      const S = window.Scrollwork;
      const cs = (id) => getComputedStyle(document.getElementById(id));
      const lin = { autoplay: false, ease: 'linear' };
      S.animate('#w', { width: ['100px', '300px'] }, lin).seek(0.5);
      S.animate('#w2', { width: '400px' }, lin).seek(0.5);
      S.animate('#v', { '--size': [0, 100] }, lin).seek(0.5);
      S.animate('#col', { backgroundColor: '#ffffff' }, lin).seek(0.5);
      S.animate('#clip', { clipPath: ['inset(0px 0px 100% 0px)', 'inset(0px 0px 0% 0px)'] }, lin).seek(0.75);
      return { w: cs('w').width, w2: cs('w2').width, v: document.getElementById('v').style.getPropertyValue('--size'), col: cs('col').backgroundColor, clip: cs('clip').clipPath };
    });
    check(tag('any property: a width, from its own when only an end is given'), props.w === '200px' && props.w2 === '300px', JSON.stringify(props));
    check(tag('any property: a CSS variable'), props.v === '50', props.v);
    check(tag('any property: a colour'), /^rgba?\(128, 128, 128(, 1)?\)$/.test(props.col), props.col);
    check(tag('any property: a clip-path'), /inset\(0px 0px 25% 0px\)|inset\(0px 0px 25%\)/.test(props.clip), props.clip);

    const obj = await p.evaluate(async () => {
      const o = { value: 0, label: 'x' };
      let updates = 0;
      const a = window.Scrollwork.animate(o, { value: 1200 }, { duration: 0.2, onUpdate: () => updates++ });
      await a.finished;
      const end = o.value;
      const b = window.Scrollwork.animate(o, { value: 0 }, { autoplay: false });
      b.seek(0.5);
      b.cancel();
      return { end, updates, back: o.value };
    });
    check(tag('a plain object’s numbers move, and cancel puts them back'), obj.end === 1200 && obj.updates > 2 && obj.back === 1200, JSON.stringify(obj));

    const restore = await p.evaluate(() => {
      const el = document.getElementById('v');
      const a = window.Scrollwork.animate('#v', { '--other': [0, 10], width: ['10px', '20px'] }, { autoplay: false });
      a.seek(0.5);
      a.cancel();
      return { other: el.style.getPropertyValue('--other'), width: el.style.width };
    });
    check(tag('cancel removes the properties it wrote'), restore.other === '' && restore.width === '', JSON.stringify(restore));

    const draw = await p.evaluate(() => {
      const el = document.getElementById('line');
      const a = window.Scrollwork.animate('#line', { draw: [0, 1] }, { autoplay: false, ease: 'linear' });
      const off = () => parseFloat(getComputedStyle(el).strokeDashoffset);
      a.seek(0);
      const s0 = off();
      a.seek(0.5);
      const s5 = off();
      a.seek(1);
      const s1 = off();
      a.cancel();
      return { s0, s5, s1, dash: getComputedStyle(el).strokeDasharray, after: el.getAttribute('style') };
    });
    check(tag('draw: an SVG line is drawn from its start'), Math.abs(draw.s0 - 200) < 0.5 && Math.abs(draw.s5 - 100) < 0.5 && Math.abs(draw.s1) < 0.5, JSON.stringify(draw));
    check(tag('draw: cancel leaves the line as it was'), draw.after === null, String(draw.after));
    check(tag('no errors (1.14 timeline and properties)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── 1.14: scroll() start and end anywhere, callbacks, smooth, snap ──
  {
    const body = `<div style="height:1500px"></div><div id="sec" style="height:400px;background:#eee">section</div><div style="height:3000px"></div>`;
    const { p, ctx, errors } = await page(browser, body);
    const go = async (y) => {
      await p.evaluate((y) => window.scrollTo(0, y), y);
      await sleep(120);
    };
    await p.evaluate(() => {
      window.log = [];
      window.raw = -1;
      window.Scrollwork.scroll((v) => (window.raw = v), {
        target: '#sec', start: 'top 80%', end: '+=400',
        onEnter: () => log.push('enter'), onLeave: () => log.push('leave'), onEnterBack: () => log.push('enterBack'), onLeaveBack: () => log.push('leaveBack'),
      });
    });
    // the view is 700 high: the section's top (1500) reaches 80% (560) at scroll 940
    await go(940);
    const p0 = await p.evaluate(() => window.raw);
    await go(1140);
    const p5 = await p.evaluate(() => window.raw);
    await go(1600);
    await go(1200);
    await go(0);
    const log = await p.evaluate(() => window.log.join(','));
    check(tag('scroll: "top 80%" to "+=400"'), Math.abs(p0) < 0.01 && Math.abs(p5 - 0.5) < 0.01, JSON.stringify({ p0, p5 }));
    check(tag('scroll: enter, leave, enter back, leave back'), log === 'enter,leave,enterBack,leaveBack', log);

    await p.evaluate(() => {
      window.soft = -1;
      window.Scrollwork.scroll((v) => (window.soft = v), { target: '#sec', start: 'top top', end: 'bottom top', smooth: 0.5 });
    });
    await go(1500);
    await p.evaluate(() => window.scrollTo(0, 1700));
    await sleep(60);
    const early = await p.evaluate(() => window.soft);
    await sleep(900);
    const late = await p.evaluate(() => window.soft);
    check(tag('scroll: smooth catches up, softly'), early < 0.45 && Math.abs(late - 0.5) < 0.01, JSON.stringify({ early, late }));

    await p.evaluate(() => {
      window.Scrollwork.scroll(() => {}, { target: '#sec', start: 'top top', end: '+=400', snap: 0.5 });
    });
    await p.evaluate(() => window.scrollTo(0, 1500 + 130));
    await sleep(1400);
    const snapped = await p.evaluate(() => window.scrollY);
    check(tag('scroll: snap glides to the nearest point once scrolling stops'), Math.abs(snapped - 1700) <= 2, String(snapped));

    // a timeline scrubbed by the scroll
    await p.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="t1" style="width:10px;height:10px"></div>');
      const t = window.Scrollwork.timeline({ autoplay: false }).add('#t1', { x: [0, 100] }, { ease: 'linear', duration: 1 }).add('#t1', { y: [0, 100] }, { ease: 'linear', duration: 1 });
      window.Scrollwork.scroll(t, { target: '#sec', start: 'top top', end: '+=400' });
    });
    await go(1500 + 300);
    const tlScrub = await p.evaluate(() => getComputedStyle(document.getElementById('t1')).translate);
    check(tag('scroll: scrubs a timeline'), /^100px 50px/.test(tlScrub), tlScrub);
    check(tag('no errors (1.14 scroll)'), errors.length === 0, errors.join(' | '));
    await ctx.close();

    // reduced motion: no smoothing, a timeline shows its end
    const r = await page(browser, body, { reduced: true });
    await r.p.evaluate(() => {
      window.soft = -1;
      window.Scrollwork.scroll((v) => (window.soft = v), { target: '#sec', start: 'top top', end: 'bottom top', smooth: 2 });
      document.body.insertAdjacentHTML('beforeend', '<div id="t2" style="width:10px;height:10px"></div>');
      window.Scrollwork.timeline().add('#t2', { x: [0, 80] }, { duration: 3 });
    });
    await r.p.evaluate(() => window.scrollTo(0, 1700));
    await sleep(150);
    const rs = await r.p.evaluate(() => ({ soft: window.soft, t2: getComputedStyle(document.getElementById('t2')).translate }));
    check(tag('reduced motion: scroll follows at once, a timeline is at its end'), Math.abs(rs.soft - 0.5) < 0.01 && /^80px/.test(rs.t2), JSON.stringify(rs));
    await r.ctx.close();
  }


  // ── scrollwork/extras (1.14): flip, morph, follow, drag, sideways ──
  {
    const both = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-extras.min.js"></script>';
    const { p, ctx, errors } = await page(
      browser,
      `<style>#grid{display:flex;gap:10px;width:600px} #grid.col{flex-direction:column} .it{width:100px;height:40px;background:#ccc}</style>
       <div id="grid"><div class="it" id="i1">1</div><div class="it" id="i2">2</div><div class="it" id="i3">3</div></div>
       <svg id="svg" width="400" height="200" viewBox="0 0 400 200" style="display:block">
         <path id="sq" d="M0 0 H100 V100 H0 Z"/><path id="route" d="M0 100 H300" stroke="black" fill="none"/><path id="diag" d="M0 0 L100 100" fill="none"/>
       </svg>
       <div id="dot" style="width:20px;height:20px;background:red"></div>`,
      { script: both }
    );
    const flip = await p.evaluate(async () => {
      const X = window.ScrollworkExtras;
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const before = { i2: r('i2'), i3: r('i3') };
      const st = X.capture('#grid .it');
      document.getElementById('grid').classList.add('col');
      document.getElementById('grid').insertAdjacentHTML('beforeend', '<div class="it" id="i4">4</div>');
      const after = { i2: r('i2'), i3: r('i3') };
      const t = X.flip(st, { autoplay: false, ease: 'linear', duration: 1 });
      await Promise.resolve();
      t.seek(0);
      const s0 = { i2: r('i2'), i3: r('i3'), i4: getComputedStyle(document.getElementById('i4')).opacity };
      t.seek(1);
      const s1 = { i2: r('i2'), i3: r('i3'), i4: getComputedStyle(document.getElementById('i4')).opacity };
      const near = (a, b) => Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1;
      return { start: near(s0.i2, before.i2) && near(s0.i3, before.i3), end: near(s1.i2, after.i2) && near(s1.i3, after.i3), moved: !near(before.i3, after.i3), enter: [s0.i4, s1.i4] };
    });
    check(tag('flip: each element starts where it was and ends where it is'), flip.moved && flip.start && flip.end, JSON.stringify(flip));
    check(tag('flip: one that was not there comes in'), parseFloat(flip.enter[0]) < 0.01 && flip.enter[1] === '1', JSON.stringify(flip.enter));

    const morph = await p.evaluate(() => {
      const X = window.ScrollworkExtras;
      const el = document.getElementById('sq');
      const tri = 'M50 0 L100 100 L0 100 Z';
      const m = X.morph('#sq', tri, { autoplay: false, ease: 'linear' });
      m.seek(0.5);
      const mid = el.getAttribute('d');
      const box = el.getBBox();
      m.seek(1);
      const end = el.getAttribute('d');
      m.seek(0);
      const start = el.getAttribute('d');
      m.seek(0.5);
      m.cancel();
      return { points: (mid.match(/L/g) || []).length, closed: mid.endsWith('Z'), box: [box.width, box.height].map(Math.round), end, start, back: el.getAttribute('d') };
    });
    check(tag('morph: a square becomes a triangle, point by point'), morph.points > 100 && morph.closed && morph.box[0] >= 98 && morph.box[1] === 100, JSON.stringify(morph));
    check(tag('morph: each end is its own path exactly, and cancel gives it back'), morph.end === 'M50 0 L100 100 L0 100 Z' && morph.start === 'M0 0 H100 V100 H0 Z' && morph.back === morph.start, JSON.stringify(morph));

    const path = await p.evaluate(() => {
      const S = window.Scrollwork;
      const X = window.ScrollworkExtras;
      const dot = document.getElementById('dot');
      const a = S.animate(X.follow('#dot', '#route'), { progress: [0, 1] }, { autoplay: false, ease: 'linear' });
      a.seek(0.5);
      const half = getComputedStyle(dot).translate;
      a.seek(0);
      const rest = dot.style.translate;
      const turned = S.animate(X.follow('#dot', '#diag', { rotate: true }), { progress: [0, 1] }, { autoplay: false, ease: 'linear' });
      turned.seek(0.5);
      const rot = getComputedStyle(dot).rotate;
      turned.seek(0);
      const al = S.animate(X.follow('#dot', '#route', { align: true }), { progress: [0, 1] }, { autoplay: false, ease: 'linear' });
      al.seek(1);
      const r = dot.getBoundingClientRect();
      const svg = document.getElementById('svg').getBoundingClientRect();
      return { half, rest, rot, centre: [Math.round(r.left + r.width / 2 - svg.left), Math.round(r.top + r.height / 2 - svg.top)] };
    });
    check(tag('follow: the element travels the path'), /^150px 0px$|^150px$/.test(path.half) && path.rest === '', JSON.stringify(path));
    check(tag('follow: turning with it'), /^45deg$/.test(path.rot), path.rot);
    check(tag('follow: align puts its centre on the path'), path.centre[0] === 300 && path.centre[1] === 100, JSON.stringify(path.centre));
    check(tag('no errors (extras: flip, morph, follow)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  {
    const body = `<div id="rail" style="position:relative;width:500px;height:60px;margin:40px;background:#eee"><div id="k" tabindex="0" style="width:100px;height:60px;background:#333"></div></div><button id="out">out</button>`;
    const both = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-extras.min.js"></script>';
    const { p, ctx, errors } = await page(browser, body, { script: both });
    await p.evaluate(() => {
      window.clicks = 0;
      document.getElementById('k').addEventListener('click', () => window.clicks++);
      window.d = window.ScrollworkExtras.drag('#k', { axis: 'x', bounds: '#rail', snap: 100, inertia: false });
    });
    const k = await p.locator('#k').boundingBox();
    const cx = k.x + 50;
    const cy = k.y + 30;
    const dragBy = async (dx, dy = 0, steps = 10, pause = 30) => {
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      for (let i = 1; i <= steps; i++) {
        await p.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
        await sleep(pause);
      }
    };
    await dragBy(130, 40);
    await sleep(150);
    await p.mouse.up();
    await sleep(600);
    const snapped = await p.evaluate(() => ({ x: window.d.x, y: window.d.y, t: document.getElementById('k').style.translate, clicks: window.clicks }));
    check(tag('drag: along its axis only, landing on a snap point'), snapped.x === 100 && snapped.y === 0 && /^100px( 0px)?$/.test(snapped.t), JSON.stringify(snapped));
    check(tag('drag: letting go is not a click'), snapped.clicks === 0, String(snapped.clicks));
    await p.mouse.click(cx + 100, cy);
    await sleep(100);
    check(tag('drag: a plain click still clicks'), (await p.evaluate(() => window.clicks)) === 1);

    // past the bounds it follows part of the way, then springs back to the edge
    const from = await p.evaluate(() => window.d.x);
    await p.mouse.move(cx + 100, cy);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await p.mouse.move(cx + 100 + 60 * i, cy);
      await sleep(20);
    }
    const over = await p.evaluate(() => window.d.x);
    await sleep(150);
    await p.mouse.up();
    await sleep(700);
    const edge = await p.evaluate(() => window.d.x);
    check(tag('drag: past its bounds it resists, and rests at the edge'), from === 100 && over > 400 && over < 700 && edge === 400, JSON.stringify({ from, over, edge }));

    // the keys
    await p.focus('#k');
    await p.keyboard.press('ArrowLeft');
    await sleep(500);
    const keyed = await p.evaluate(() => window.d.x);
    check(tag('drag: the arrow keys move it to the next snap point'), keyed === 300, String(keyed));

    // a throw
    await p.evaluate(() => {
      window.d.destroy();
      window.t = window.ScrollworkExtras.drag('#k', { axis: 'x', bounds: '#rail' });
    });
    const back = await p.evaluate(() => document.getElementById('k').style.translate);
    await dragBy(60, 0, 4, 8);
    await p.mouse.up();
    await sleep(1400);
    const thrown = await p.evaluate(() => window.t.x);
    check(tag('drag: destroy puts it back; a throw glides on past where it was let go'), back === '' && thrown > 120, JSON.stringify({ back, thrown }));
    check(tag('no errors (extras: drag)'), errors.length === 0, errors.join(' | '));
    await ctx.close();

    // reduced motion: no throw
    const r = await page(browser, body, { script: both, reduced: true });
    await r.p.evaluate(() => (window.t = window.ScrollworkExtras.drag('#k', { axis: 'x', bounds: '#rail' })));
    await r.p.mouse.move(cx, cy);
    await r.p.mouse.down();
    for (let i = 1; i <= 4; i++) {
      await r.p.mouse.move(cx + 15 * i, cy);
      await sleep(8);
    }
    await r.p.mouse.up();
    await sleep(600);
    const still = await r.p.evaluate(() => window.t.x);
    check(tag('drag: under reduced motion it stops where it is let go'), Math.abs(still - 60) < 1, String(still));
    await r.ctx.close();
  }

  {
    const both = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-extras.min.js"></script>';
    const { p, ctx, errors } = await page(
      browser,
      `<style>.track{display:flex;width:max-content}.panel{flex:none;width:1000px;height:700px}</style>
       <div style="height:600px">before</div>
       <section id="work"><div class="track"><div class="panel">1</div><div class="panel">2</div><div class="panel" id="p3">3</div><div class="panel"><button id="last">last</button></div></div></section>
       <div style="height:1500px">after</div>`,
      { script: both }
    );
    const set = await p.evaluate(() => {
      window.side = window.ScrollworkExtras.sideways('#work', { snap: 'panels' });
      window.seen = -1;
      window.side.watch('#p3', (v) => (window.seen = v), { range: 'in' });
      return { h: document.getElementById('work').offsetHeight };
    });
    const top = 600;
    await p.evaluate((y) => window.scrollTo(0, y), top + 1500);
    await sleep(120);
    const mid = await p.evaluate(() => ({ t: document.querySelector('.track').style.translate, top: Math.round(document.querySelector('.track').getBoundingClientRect().top), p: window.side.progress, seen: window.seen }));
    check(tag('sideways: the section is as tall as the track takes, and the track moves with the scroll'), set.h === 3700 && /^-1500px( 0px)?$/.test(mid.t) && mid.top === 0, JSON.stringify({ set, mid }));
    check(tag('sideways: watch follows a panel across the screen'), mid.seen > 0 && mid.seen < 1, String(mid.seen));
    await p.evaluate((y) => window.scrollTo(0, y), top + 1200);
    await sleep(1400);
    const snapped = await p.evaluate(() => window.scrollY);
    check(tag('sideways: snaps to a panel'), Math.abs(snapped - (top + 1000)) <= 2, String(snapped));
    await p.evaluate(() => window.scrollTo(0, 0));
    await sleep(100);
    await p.focus('#last');
    await sleep(150);
    const shown = await p.evaluate(() => {
      const r = document.getElementById('last').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
    check(tag('sideways: keyboard focus inside scrolls it into view'), shown);
    const stopped = await p.evaluate(() => {
      window.side.stop();
      const s = document.getElementById('work');
      return { style: s.getAttribute('style'), track: document.querySelector('.track').getAttribute('style') };
    });
    check(tag('sideways: stop puts the section back'), !stopped.style && !stopped.track, JSON.stringify(stopped));
    check(tag('no errors (extras: sideways)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }


  // ── sideways in a centred, padded section: the track starts on the section's left and ends on its right ──
  {
    const both = '<script src="/scrollwork.min.js"></script><script src="/scrollwork-extras.min.js"></script>';
    const { p, ctx, errors } = await page(
      browser,
      `<style>#c{display:flex;flex-direction:column;align-items:center;padding:80px 24px}.track{display:flex;width:max-content}.panel{flex:none;width:600px;height:500px}</style>
       <div style="height:300px"></div><section id="c"><div class="track"><div class="panel" id="first">1</div><div class="panel">2</div><div class="panel" id="lastp">3</div></div></section><div style="height:1500px"></div>`,
      { script: both }
    );
    const r = await p.evaluate(async () => {
      const s = window.ScrollworkExtras.sideways('#c');
      const sec = document.getElementById('c');
      const docTop = sec.getBoundingClientRect().top + scrollY;
      const at = async (y) => {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
        const sr = sec.getBoundingClientRect();
        return { first: Math.round(document.getElementById('first').getBoundingClientRect().left - sr.left), last: Math.round(sr.right - document.getElementById('lastp').getBoundingClientRect().right), trackTop: Math.round(document.querySelector('#c .track').getBoundingClientRect().top), p: s.progress };
      };
      // the track reaches the top 80px (the padding) after the section does; it travels 1800 - 952 = 848px
      const start = await at(docTop + 80);
      const end = await at(docTop + 80 + 848);
      return { start, end };
    });
    check(tag('sideways: a centred, padded section starts on its left edge'), r.start.first === 24 && r.start.p === 0 && r.start.trackTop === 0, JSON.stringify(r));
    check(tag('sideways: and ends on its right edge, stuck all the way'), r.end.last === 24 && r.end.p === 1 && r.end.trackTop === 0, JSON.stringify(r));
    check(tag('no errors (sideways, centred)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }


  // ── 1.14 in the spec: a corner reveal (a state's clip, a scroll's ease) and words lit as the page scrolls ──
  {
    const body = `<div style="height:1500px"></div><div id="r" data-m="r" style="width:400px;height:300px;background:#333"></div>
      <div style="height:400px"></div><p id="w" data-m="w" style="font:20px sans-serif;width:600px">one two three four five</p><div style="height:2000px"></div>`;
    const spec = {
      items: [
        { id: 'r', text: false, scroll: { from: { clip: { top: 100, right: 100 } }, to: {}, range: 'in', ease: 'ease-out-quad' } },
        { id: 'w', text: true, scroll: { from: { opacity: 0.2 }, to: {}, range: 'in', split: 'words', spread: 0.2 } },
      ],
      smooth: false,
    };
    const run = async (reduced) => {
      const { p, ctx, errors } = await page(browser, body, { reduced });
      const before = await p.evaluate(() => document.getElementById('w').innerHTML);
      await p.evaluate((spec) => (window.sw = window.Scrollwork.start(spec, { attr: 'data-m', root: document.body, scroller: null, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, split: true })), spec);
      const at = async (y) => {
        await p.evaluate((y) => window.scrollTo(0, y), y);
        await sleep(150);
        return p.evaluate(() => ({
          clip: getComputedStyle(document.getElementById('r')).clipPath,
          words: [...document.querySelectorAll('#w span')].filter((s) => /^(one|two|three|four|five)$/.test(s.textContent.trim()) && !s.querySelector('span')).map((s) => +(+getComputedStyle(s).opacity).toFixed(2)),
        }));
      };
      // r: 1500 down, 300 high, a 700 view: 'in' runs from scroll 800 to 1300
      const r0 = await at(700);
      const r5 = await at(1050);
      const r1 = await at(1400);
      // w (about 24px high) at 2200: 'in' runs from 1500 to about 1862
      const wTop = await p.evaluate(() => document.getElementById('w').getBoundingClientRect().top + scrollY);
      const wH = await p.evaluate(() => document.getElementById('w').getBoundingClientRect().height);
      const ws = wTop - 700;
      const we = wTop + wH / 2 - 350;
      const w5 = await at(ws + (we - ws) * 0.5);
      const w0 = await at(ws - 50);
      await p.evaluate(() => window.sw.stop());
      const after = await p.evaluate(() => document.getElementById('w').innerHTML);
      await ctx.close();
      return { r0, r5, r1, w0, w5, restored: before === after, errors };
    };
    const m = await run(false);
    check(tag('corner reveal: closed before, opening from the bottom-left on its curve, open after'), /inset\(100% 100% 0(%|px)? 0(%|px)?\)/.test(m.r0.clip) && ((c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return Math.abs(n[0] - 25) < 1 && Math.abs(n[1] - 25) < 1 && n[2] === 0 && n[3] === 0; })(m.r5.clip) && m.r1.clip === 'none', JSON.stringify([m.r0.clip, m.r5.clip, m.r1.clip]));
    check(tag('words lit as the page scrolls, one after another'), m.w5.words.length === 5 && [1, 1, 0.6, 0.2, 0.2].every((v, i) => Math.abs(m.w5.words[i] - v) < 0.02) && m.w0.words.every((o) => o === 0.2), JSON.stringify({ w5: m.w5.words, w0: m.w0.words }));
    check(tag('stop() gives the paragraph back as it was'), m.restored);
    check(tag('no errors (reveal and lit words)'), m.errors.length === 0, m.errors.join(' | '));
    const r = await run(true);
    check(tag('reduced motion: the picture is open and the words are as they are'), r.r0.clip === 'none' && r.w5.words.every((o) => o === 1), JSON.stringify({ clip: r.r0.clip, words: r.w5.words }));
  }


  // ── 1.14 formations: a scroll split by children (Codrops' On-Scroll Layout Formations) ──
  {
    const body = `<style>#g{display:grid;grid-template-columns:repeat(3,100px);gap:20px;width:340px} #g div{width:100px;height:100px;background:#333}</style>
      <div style="height:1500px"></div><div id="g" data-m="g">${'<div></div>'.repeat(9)}</div><div style="height:2500px"></div>`;
    const run = async (reduced, sc) => {
      const { p, ctx, errors } = await page(browser, body, { reduced });
      const before = await p.evaluate(() => [...document.querySelectorAll('#g > div')].map((d) => d.getAttribute('style')));
      await p.evaluate((sc) => (window.sw = window.Scrollwork.start({ items: [{ id: 'g', text: false, scroll: sc }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, split: true })), sc);
      const at = async (y) => {
        await p.evaluate((y) => window.scrollTo(0, y), y);
        await sleep(150);
        return p.evaluate(() => [...document.querySelectorAll('#g > div')].map((d) => {
          const cs = getComputedStyle(d);
          const t = (cs.translate === 'none' ? '0px 0px' : cs.translate).split(' ').map(parseFloat);
          return { x: Math.round(t[0] || 0), y: Math.round(t[1] || 0), r: Math.round(parseFloat(cs.rotate) || 0), o: +(+cs.opacity).toFixed(2), origin: cs.transformOrigin };
        }));
      };
      // #g: 1500 down, 340 high, a 700 view: 'in' runs from 800 to 1320
      const s0 = await at(700);
      const s5 = await at(1060);
      const s1 = await at(1400);
      await p.evaluate(() => window.sw.stop());
      const after = await p.evaluate(() => [...document.querySelectorAll('#g > div')].map((d) => d.getAttribute('style')));
      await ctx.close();
      return { s0, s5, s1, restored: JSON.stringify(before) === JSON.stringify(after), errors };
    };
    const rise = await run(false, { split: 'children', from: { y: 600, opacity: 0 }, to: {}, range: 'in', spread: 0.3, order: 'center' });
    check(tag('formation: every child starts below, unseen'), rise.s0.every((c) => c.y === 600 && c.o === 0), JSON.stringify(rise.s0.map((c) => c.y)));
    check(tag('formation: from the centre, the centre child is ahead of the corners'), rise.s5[4].y < rise.s5[0].y && rise.s5[4].y < rise.s5[8].y, JSON.stringify(rise.s5.map((c) => c.y)));
    check(tag('formation: all in place at the end'), rise.s1.every((c) => c.y === 0 && c.o === 1));
    check(tag('formation: stop gives the children back as they were'), rise.restored);
    const out = await run(false, { split: 'children', from: { x: 200, y: 200, rotate: 20 }, to: {}, range: 'in', outward: true, origin: 'top' });
    const [tl, , , , mid, , , , br] = out.s0;
    check(tag('outward: each child comes from its own side, turned as far as it is from the centre'), tl.x < 0 && tl.y < 0 && tl.r > 0 && br.x > 0 && br.y > 0 && br.r < 0 && mid.x === 0 && mid.y === 0 && mid.r === 0, JSON.stringify({ tl, mid, br }));
    const fan = await run(false, { split: 'children', from: { y: 600, rotate: 20 }, to: {}, range: 'in', outward: true });
    check(tag('outward with a start that only moves down: all rise from below, the turns open out from the centre'), fan.s0.every((c) => c.y === 600) && fan.s0[0].r > 0 && fan.s0[2].r < 0 && fan.s0[1].r === 0, JSON.stringify(fan.s0.map((c) => [c.y, c.r])));
    check(tag('origin: the children turn about their top'), out.s0.every((c) => /^50px 0px/.test(c.origin)), out.s0[0].origin);
    const v1 = await run(false, { split: 'children', from: { y: 500, rotate: 10 }, to: {}, range: 'in', vary: 0.5 });
    const v2 = await run(false, { split: 'children', from: { y: 500, rotate: 10 }, to: {}, range: 'in', vary: 0.5 });
    const ys = v1.s0.map((c) => c.y);
    check(tag('vary: each child starts a little differently, the same each time'), new Set(ys).size > 4 && ys.every((y) => y >= 250 && y <= 750) && JSON.stringify(v1.s0) === JSON.stringify(v2.s0) && v1.s0.some((c) => c.r < 0), JSON.stringify(v1.s0.map((c) => [c.y, c.r])));
    const r = await run(true, { split: 'children', from: { y: 600, opacity: 0 }, to: {}, range: 'in' });
    check(tag('formation under reduced motion: the children in their places'), r.s0.every((c) => c.y === 0 && c.o === 1), JSON.stringify(r.s0.map((c) => c.y)));
    check(tag('no errors (formations)'), [rise, out, v1, r].every((x) => x.errors.length === 0), [rise, out, v1, r].flatMap((x) => x.errors).join(' | '));
  }


  // ── a custom cursor inside a screen centred in a wider window (a published page wider than its design) ──
  {
    const body = `<style>body{margin:0}</style><div id="screen" style="position:relative;width:600px;height:500px;margin:40px auto;border:3px solid #000">
      <div id="dot" data-m="dot" style="position:absolute;left:100px;top:100px;width:20px;height:20px;background:red"></div><a id="go" href="#g" style="position:absolute;left:300px;top:300px">Go</a></div>`;
    const { p, ctx, errors } = await page(browser, body);
    await p.evaluate(() => (window.sw = window.Scrollwork.start({ items: [{ id: 'dot', cursor: { lag: 0, hide: true } }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false })));
    await sleep(100);
    const at = async (x, y) => {
      await p.mouse.move(x - 30, y - 30);
      await p.mouse.move(x, y, { steps: 4 });
      await sleep(200);
      return p.evaluate(() => { const r = document.getElementById('dot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    };
    const a = await at(700, 300);
    const b = await at(420, 480);
    await p.evaluate(() => window.sw.stop());
    await ctx.close();
    check(tag('cursor: centred on the pointer when its screen sits in a wider window, border and all'), [[a, 700, 300], [b, 420, 480]].every(([c, x, y]) => Math.abs(c.x - x) < 1.5 && Math.abs(c.y - y) < 1.5), JSON.stringify({ a, b }));
    check(tag('no errors (cursor in a centred screen)'), errors.length === 0, errors.join(' | '));
  }

  // ── 1.14 scramble: on hover, and as it comes into view (Codrops' Line Text Hover Animations) ──
  {
    const body = `<style>body{font:20px monospace}</style><a id="link" href="#x"><span id="t" data-m="t">Hello world</span></a>
      <div style="height:1600px"></div><p id="v" data-m="v">Typed in on arrival</p><div style="height:800px"></div>`;
    const spec = { items: [
      { id: 't', text: true, rollover: [{ effect: 'scramble', duration: 0.4, stagger: 0.05, turns: 3, glyphs: '#', cursor: true, colors: ['rgb(255, 0, 0)'] }] },
      { id: 'v', text: true, rollover: [{ effect: 'scramble', duration: 0.3, stagger: 0.03, turns: 3, on: 'appear' }] },
    ], smooth: false };
    const run = async (reduced) => {
      const { p, ctx, errors } = await page(browser, body, { reduced });
      const before = await p.evaluate(() => [document.getElementById('t').innerHTML, document.getElementById('v').innerHTML]);
      await p.evaluate((spec) => (window.sw = window.Scrollwork.start(spec, { attr: 'data-m', root: document.body, scroller: null, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, split: true })), spec);
      await sleep(100);
      const letters = (id) => p.evaluate((id) => [...document.querySelectorAll(`#${id} .sw-scramble-char`)].map((c) => ({ ch: c.textContent, o: getComputedStyle(c).opacity, bg: c.style.backgroundColor, color: c.style.color, w: c.style.width })), id);
      const a11y = await p.evaluate(() => ({ hidden: document.querySelector('#t .sw-scramble').getAttribute('aria-hidden'), said: document.querySelector('#t .sw-scramble-said')?.textContent }));
      const w0 = await p.evaluate(() => document.getElementById('t').getBoundingClientRect().width);
      const vBefore = await letters('v');
      const box = await p.locator('#link').boundingBox();
      await p.mouse.move(box.x + 5, box.y + box.height / 2);
      await sleep(120);
      const mid = await letters('t');
      const w1 = await p.evaluate(() => document.getElementById('t').getBoundingClientRect().width);
      await sleep(1200);
      const end = await letters('t');
      await p.evaluate(() => window.scrollTo(0, 1400));
      await sleep(250);
      const vMid = await letters('v');
      await sleep(1200);
      const vEnd = await letters('v');
      await p.evaluate(() => window.sw.stop());
      const after = await p.evaluate(() => [document.getElementById('t').innerHTML, document.getElementById('v').innerHTML]);
      await ctx.close();
      return { a11y, w0, w1, vBefore, mid, end, vMid, vEnd, restored: JSON.stringify(before) === JSON.stringify(after), errors };
    };
    const m = await run(false);
    check(tag('scramble: a screen reader reads the words once, whole'), m.a11y.hidden === 'true' && m.a11y.said === 'Hello world', JSON.stringify(m.a11y));
    check(tag('scramble on hover: letters flicker through the characters, with a cursor block and a colour'), m.mid.some((c) => c.ch === '#') && m.mid.some((c) => c.bg === 'currentcolor') && m.mid.some((c) => c.color === 'rgb(255, 0, 0)'), JSON.stringify(m.mid.slice(0, 5)));
    check(tag('scramble: the line keeps its width while it flickers'), Math.abs(m.w0 - m.w1) < 1, JSON.stringify({ w0: m.w0, w1: m.w1 }));
    check(tag('scramble: each letter lands on its own'), m.end.map((c) => c.ch).join('') === 'Helloworld' && m.end.every((c) => !c.bg && !c.color && !c.w), m.end.map((c) => c.ch).join(''));
    check(tag('scramble as it comes into view: hidden until then, typed in, then its own'), m.vBefore.every((c) => c.o === '0') && m.vMid.some((c) => c.o === '1') && m.vEnd.map((c) => c.ch).join('') === 'Typedinonarrival' && m.vEnd.every((c) => c.o === '1'), JSON.stringify({ before: m.vBefore[0], mid: m.vMid.slice(0, 3), end: m.vEnd.map((c) => c.ch).join('') }));
    check(tag('scramble: stop gives the words back as they were'), m.restored);
    check(tag('no errors (scramble)'), m.errors.length === 0, m.errors.join(' | '));
    const r = await run(true);
    check(tag('scramble under reduced motion: nothing flickers, nothing is hidden'), r.mid.every((c) => c.ch !== '#') && r.vBefore.every((c) => c.o === '1'), JSON.stringify({ mid: r.mid.map((c) => c.ch).join(''), v: r.vBefore[0] }));
  }

  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
