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
    if (['scrollwork.min.js', 'scrollwork.js', 'scrollwork.mjs'].includes(file)) return route.fulfill({ contentType: 'text/javascript', body: DIST(file) });
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

  // ── a curve outside 0 to 1 ──
  {
    const { p, ctx, errors } = await page(browser, `<div id="t" data-m="t" style="width:100px;height:40px;background:#888">hover</div>`);
    await p.evaluate(
      ({ ix }) => {
        window.sw = window.Scrollwork.start({ items: [{ id: 't', text: false, interactions: [ix] }], smooth: false }, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: false });
      },
      { ix: change('hover', { x: 40 }, { animation: { kind: 'animate', curve: 'custom', bezier: [0.5, 0, 1.6, 1], duration: 0.2 } }) }
    );
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
    check(tag('the ES module imports and plays'), esm.v === '1.0.0' && /^30px/.test(esm.x), JSON.stringify(esm));
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
    // chained starts keep one frame loop, not two
    await p.evaluate(() => {
      window.updates = 0;
      const next = () => window.Scrollwork.animate('#a', { x: [0, 1] }, { duration: 1.5, onUpdate: () => window.updates++ });
      window.Scrollwork.animate('#a', { x: [0, 1] }, { duration: 0.05, onComplete: next });
    });
    await p.waitForTimeout(1100);
    const per = await p.evaluate(() => window.updates);
    check(tag('an animation started from onComplete runs on the one loop'), per < 90, `${per} updates in about a second`);
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

  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
