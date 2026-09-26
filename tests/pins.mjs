#!/usr/bin/env node
// Pins, in real browsers. Since 1.1 a pin is held by position: sticky where
// the page allows it (iOS moves sticky with the scroll; a pin moved by script
// trails a fling, tests/ios), and by the transform everywhere else. Holding
// must not change the page: every case here is laid out with and without
// Scrollwork and compared element by element, held where the transform would
// hold it, before, during and after the hold, and given back exactly on stop.
//
// Usage: npm run build, then node tests/pins.mjs   (BROWSERS=chromium,webkit,firefox)
import { readFileSync } from 'node:fs';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ORIGIN = 'http://scrollwork.test';
const DIST = (f) => readFileSync(new URL(`../dist/${f}`, import.meta.url));
const BROWSERS = (process.env.BROWSERS || 'chromium,webkit,firefox').split(',');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = async (browser, body, { head = '', engine = true, reduced = false, width = 1000, counting = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height: 700 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const count = counting ? `<script>window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => { window.__frames++; return raf(f); };</script>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}</style>${count}${head}</head><body>${body}${engine ? '<script src="/scrollwork.min.js"></script>' : ''}</body></html>`;
  await p.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/scrollwork.min.js') return route.fulfill({ contentType: 'text/javascript', body: DIST('scrollwork.min.js') });
    return route.fulfill({ status: 404, body: '' });
  });
  await p.goto(`${ORIGIN}/`);
  return { p, ctx, errors };
};

/** every element of the author's page (none of Scrollwork's own), its box at scroll 0 */
const layout = (p) =>
  p.evaluate(() => {
    scrollTo(0, 0);
    const mine = (el) => typeof el.className === 'string' && el.className.indexOf('ux-motion-') === 0;
    const all = Array.from(document.body.querySelectorAll('*')).filter((el) => el.tagName !== 'SCRIPT' && !mine(el));
    return {
      boxes: all.map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName}.${el.className}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      }),
      height: document.documentElement.scrollHeight,
    };
  });
const sameLayout = (a, b) => a.height === b.height && a.boxes.length === b.boxes.length && a.boxes.every((x, i) => x === b.boxes[i]);
const diff = (a, b) => a.boxes.find((x, i) => x !== b.boxes[i]) + ' vs ' + b.boxes.find((x, i) => x !== a.boxes[i]) + ` (${a.height}/${b.height})`;

/** where the transform pin holds an element whose top is T, at scroll y: this is what sticky must match */
const expected = (T, top, distance, y) => T - y + Math.min(distance, Math.max(0, y - (T - top)));
const topAt = async (p, sel, y) => {
  await p.evaluate((y) => scrollTo(0, y), y);
  await sleep(120);
  return p.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top), sel);
};
const holds = async (p, sel, T, top, distance) => {
  const ys = [T - top - 150, T - top + 40, T - top + Math.round(distance / 2), T - top + distance - 30, T - top + distance + 200].filter((y) => y >= 0);
  const out = [];
  for (const y of ys) out.push([y, await topAt(p, sel, y), Math.round(expected(T, top, distance, y))]);
  return { ok: out.every(([, got, want]) => Math.abs(got - want) <= 1), detail: out.map(([y, g, w]) => `${y}:${g}/${w}`).join(' ') };
};
// its own track: an element inside another pin sits in that pin's track, which is not its own
const tracked = (p, sel) => p.evaluate((sel) => !!document.querySelector(sel).parentElement?.classList.contains('ux-motion-track'), sel);
// sticky is asked for (it moves elements, which a page a framework renders must not have)
const start = (p, sticky = true) => p.evaluate((sticky) => { window.sw = window.Scrollwork.auto(document.body, { warn: false, sticky }); }, sticky);

const PIN = (distance, top) => `data-scrollwork='{"pin": {"distance": ${distance}, "top": ${top}}}'`;

// the cases sticky takes: positioned in a frame (how uxdeck exports a layer), and in the flow
const ABSOLUTE = `
  <style>.frame{position:relative;height:4000px;background:#eee}.card{position:absolute;left:40px;top:1200px;width:300px;height:120px;background:#f00}
  .under{position:absolute;left:40px;top:1500px;width:300px;height:60px;background:#0a0}
  @media (max-width: 800px){.card{left:10px}}</style>
  <div class="frame"><div class="card" ${PIN(800, 100)}>Card <i class="kid" data-scrollwork='{"appear": {"effect": "fade", "offset": 0}}'>inner</i></div><div class="under">under</div></div>`;
// exactly as uxdeck exports a screen: a frame that clips (overflow: clip), a layer placed in it
const EXPORTED = `
  <style>.home{position:relative;box-sizing:border-box;overflow:clip;width:100%;min-width:0;height:auto;min-height:3000px;background-color:#fff}
  .pinned{position:absolute;box-sizing:border-box;left:24px;top:1400px;width:240px;height:90px;background:#111;color:#fff}</style>
  <main class="home"><div class="pinned" ${PIN(400, 100)}>Pinned</div></main>`;
const FLOW = `
  <section style="padding:20px"><p style="margin:30px 0">before</p>
  <div class="hero" style="height:150px;margin:40px 0;background:#00f" ${PIN(600, 80)}>Hero</div>
  <p class="after" style="margin:25px 0">after</p><div style="height:3000px"></div></section>`;
// and the ones it must leave to the transform, each still held
const FALLBACKS = {
  'a style that depends on the parent': `<style>.wrap > .pinme{color:rgb(200,0,0)}</style><div class="wrap" style="height:3000px;padding-top:900px"><div class="pinme" style="height:100px;background:#fc0" ${PIN(500, 60)}>x</div></div>`,
  'a flex item': `<div style="display:flex;flex-direction:column;height:3000px;padding-top:900px"><div class="pinme" style="height:100px;background:#fc0" ${PIN(500, 60)}>x</div></div>`,
  'inside a box that hides its overflow': `<div style="overflow:hidden;height:3000px;padding-top:900px"><div class="pinme" style="height:100px;background:#fc0" ${PIN(500, 60)}>x</div></div>`,
  'holding a video': `<div style="height:3000px;padding-top:900px"><div class="pinme" style="height:100px;background:#fc0" ${PIN(500, 60)}><video></video></div></div>`,
  'a width in percent': `<div style="position:relative;height:3000px"><div class="pinme" style="position:absolute;top:900px;left:0;width:30%;height:100px;background:#fc0" ${PIN(500, 60)}>x</div></div>`,
  'inside another pin': `<div style="height:3000px;padding-top:900px"><div ${PIN(900, 20)} style="height:300px;background:#ddd"><div class="pinme" style="height:100px;background:#fc0" ${PIN(200, 60)}>x</div></div></div>`,
};

for (const name of BROWSERS) {
  const browser = await pw[name].launch();
  const tag = (s) => `[${name}] ${s}`;

  for (const [label, body, sel, T, top, distance] of [
    ['positioned in a frame', ABSOLUTE, '.card', 1200, 100, 800],
    ['a layer in a uxdeck screen (a frame that clips)', EXPORTED, '.pinned', 1400, 100, 400],
    ['in the flow', FLOW, '.hero', 20 + 30 + 18 + 40 + 0, 80, 600],
  ]) {
    const plain = await page(browser, body, { engine: false });
    const bare = await layout(plain.p);
    await plain.ctx.close();
    const { p, ctx, errors } = await page(browser, body);
    const before = await p.evaluate(() => document.body.innerHTML);
    await start(p);
    await sleep(200);
    check(tag(`${label}: held by sticky`), await tracked(p, sel));
    const withPin = await layout(p);
    check(tag(`${label}: the page lays out exactly as without Scrollwork`), sameLayout(bare, withPin), sameLayout(bare, withPin) ? '' : diff(bare, withPin));
    // the flow case's top is measured, not written out
    const T0 = label === 'in the flow' ? await p.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY), sel) : T;
    const h = await holds(p, sel, T0, top, distance);
    check(tag(`${label}: held where the transform held it, before, during and after`), h.ok, h.detail);
    await p.evaluate(() => window.sw.stop());
    check(tag(`${label}: stop() gives the page back as it was`), (await p.evaluate(() => document.body.innerHTML)) === before);
    check(tag(`${label}: no errors`), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // the tall track does not take the clicks meant for what is under it
  {
    const { p, ctx } = await page(browser, ABSOLUTE);
    await start(p);
    await p.evaluate(() => scrollTo(0, 1000));
    await sleep(150);
    const hit = await p.evaluate(() => {
      const r = document.querySelector('.under').getBoundingClientRect();
      return document.elementFromPoint(r.left + 20, r.top + 20)?.className;
    });
    check(tag('what lies under the track is still clicked'), hit === 'under', String(hit));
    await ctx.close();
  }

  // something inside a sticky pin appears when it arrives, not before
  {
    const { p, ctx } = await page(browser, ABSOLUTE);
    await start(p);
    await sleep(200);
    const at = async (y) => {
      await p.evaluate((y) => scrollTo(0, y), y);
      await sleep(700);
      return p.evaluate(() => Number(getComputedStyle(document.querySelector('.kid')).opacity));
    };
    const early = await at(400);
    const late = await at(560);
    check(tag('what is inside a pinned element appears on arrival'), early < 0.05 && late > 0.95, `${early} then ${late}`);
    await ctx.close();
  }

  // a media query moves the pinned element: the track follows it
  {
    const { p, ctx } = await page(browser, ABSOLUTE);
    await start(p);
    await sleep(200);
    await p.setViewportSize({ width: 700, height: 700 });
    await sleep(400);
    const left = await p.evaluate(() => Math.round(document.querySelector('.card').getBoundingClientRect().left));
    const h = await holds(p, '.card', 1200, 100, 800);
    check(tag('after a resize the page’s own rules place it, and it still holds'), left === 10 && h.ok, `left ${left}; ${h.detail}`);
    await ctx.close();
  }

  // a box that scrolls, with padding and a border: held at the same place the transform held it
  {
    const body = `<div id="sc" style="height:500px;overflow:auto;padding-top:30px;border-top:5px solid #000"><div style="position:relative;height:3000px"><div id="pinme" style="position:absolute;top:400px;left:0;width:100px;height:80px;background:#fc0"></div></div></div>`;
    const { p, ctx, errors } = await page(browser, body);
    const rows = await p.evaluate(async () => {
      const sc = document.getElementById('sc');
      const el = document.getElementById('pinme');
      const spec = { items: [{ id: 'pinme', text: false, pin: { distance: 600, top: 50 } }] };
      const run = async () => {
        const c = window.Scrollwork.start(spec, { attr: 'id', root: sc, scroller: sc, reduced: false, split: false, warn: false, sticky: true });
        const out = [];
        for (const y of [100, 500, 800, 1300]) {
          sc.scrollTop = y;
          await new Promise((r) => setTimeout(r, 120));
          out.push(Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top));
        }
        const sticky = !!el.parentElement?.classList.contains('ux-motion-track');
        c.stop();
        sc.scrollTop = 0;
        return { out, sticky };
      };
      return run();
    });
    // what the transform does: the element's top, from the scroller's border-box top, is border + (layout top - y) + hold
    const want = [100, 500, 800, 1300].map((y) => 5 + expected(30 + 400, 50, 600, y));
    check(tag('in a box that scrolls, with padding and a border: held by sticky, where the transform held it'), rows.sticky && rows.out.every((v, i) => Math.abs(v - want[i]) <= 1), `${rows.out.join(',')} vs ${want.join(',')} sticky=${rows.sticky}`);
    check(tag('no errors (a box that scrolls)'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // every case sticky must not take: left to the transform, and still held
  for (const [label, body] of Object.entries(FALLBACKS)) {
    const { p, ctx, errors } = await page(browser, body);
    await start(p);
    await sleep(200);
    const T = await p.evaluate(() => {
      scrollTo(0, 0);
      const el = document.querySelector('.pinme');
      return Math.round(el.getBoundingClientRect().top + scrollY);
    });
    const onTrack = await tracked(p, '.pinme');
    // the nested one is carried by its parent's hold too: only that it is not sticky is asked of it
    const h = label === 'inside another pin' ? { ok: true, detail: '' } : await holds(p, '.pinme', T, 60, 500);
    check(tag(`${label}: left to the transform, and held`), !onTrack && h.ok, `track=${onTrack} ${h.detail}`);
    check(tag(`${label}: no errors`), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // not asked for: every pin moves by transform and no element leaves its place
  {
    const { p, ctx, errors } = await page(browser, ABSOLUTE);
    const parent = await p.evaluate(() => document.querySelector('.card').parentElement.className);
    await start(p, false);
    await sleep(200);
    const h = await holds(p, '.card', 1200, 100, 800);
    const stays = await p.evaluate((was) => document.querySelector('.card').parentElement.className === was && !document.querySelector('.ux-motion-track'), parent);
    check(tag('without sticky: the element stays where the page put it, held by the transform'), stays && h.ok, h.detail);
    check(tag('without sticky: no errors'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // data-scrollwork-sticky on <html> asks for it, as data-scrollwork-smooth asks for smooth scrolling
  {
    const { p, ctx } = await page(browser, ABSOLUTE);
    await p.evaluate(() => { document.documentElement.setAttribute('data-scrollwork-sticky', ''); window.sw = window.Scrollwork.auto(document.body, { warn: false }); });
    await sleep(200);
    check(tag('data-scrollwork-sticky on <html> turns sticky on'), await tracked(p, '.card'));
    await ctx.close();
  }

  // reduced motion still pins (a hold is not movement), and the loop rests
  {
    const { p, ctx } = await page(browser, ABSOLUTE, { reduced: true, counting: true });
    await start(p);
    await sleep(200);
    const h = await holds(p, '.card', 1200, 100, 800);
    check(tag('with reduced motion it still holds'), h.ok, h.detail);
    await sleep(1500);
    const f0 = await p.evaluate(() => window.__frames);
    await sleep(800);
    const f1 = await p.evaluate(() => window.__frames);
    check(tag('and once still, it stops drawing (the pin’s own writes do not wake it)'), f1 - f0 <= 2, `${f1 - f0} frames`);
    await ctx.close();
  }

  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
