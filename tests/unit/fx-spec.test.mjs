import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readFx, readOneFx, FX_DEFAULTS } = await load('fxspec');
const { readSpec } = await load('spec');

const noted = () => {
  const out = [];
  return { note: (m) => out.push(m), out };
};

test('a bare glitch takes every default', () => {
  const { note, out } = noted();
  const [fx] = readFx([{ type: 'glitch' }], note, 'items[0]');
  assert.deepEqual(fx, { type: 'glitch', ...FX_DEFAULTS.glitch });
  assert.deepEqual(out, []);
});

test('numbers are clamped and said, strings read as numbers', () => {
  const { note, out } = noted();
  const [fx] = readFx([{ type: 'glitch', intensity: 4, blocks: '12', split: -2 }], note, 'items[0]');
  assert.equal(fx.intensity, 1);
  assert.equal(fx.blocks, 12);
  assert.equal(fx.split, 0);
  assert.equal(out.length, 2);
  assert.match(out[0], /intensity: 4 is outside 0 to 1, using 1/);
});

test('a trigger that is not one of the four falls back to the effect’s own', () => {
  const { note, out } = noted();
  const [fx] = readFx([{ type: 'glitch', on: 'click' }], note, 'items[0]');
  assert.equal(fx.on, 'hover');
  assert.match(out[0], /on: "click" is not one of hover, appear, always, scroll/);
});

test('an effect this build does not play is left out and named, the rest stay in order', () => {
  const { note, out } = noted();
  const list = readFx([{ type: 'glitch', on: 'always' }, { type: 'sparkle' }, { type: 'glitch' }], note, 'items[3]');
  assert.equal(list.length, 2);
  assert.equal(list[0].on, 'always');
  assert.equal(list[1].on, 'hover');
  assert.match(out[0], /items\[3\]\.fx\[1\]: "sparkle" is not an effect this build of scrollwork\/fx plays \(glitch, dither, distort\)/);
});

test('something that is not an effect at all is said', () => {
  const { note, out } = noted();
  assert.equal(readOneFx('glitch', note, 'x'), null);
  assert.equal(readOneFx({ on: 'hover' }, note, 'x'), null);
  assert.equal(out.length, 2);
});

test('the core carries fx through as written and drops entries without a type', () => {
  const warn = console.warn;
  const said = [];
  console.warn = (m) => said.push(String(m));
  try {
    const spec = readSpec({ items: [{ id: 'a', fx: [{ type: 'glitch', blocks: 8 }, { blocks: 2 }] }, { id: 'b', fx: 'glitch' }, { id: 'c' }] });
    assert.deepEqual(spec.items[0].fx, [{ type: 'glitch', blocks: 8 }]);
    assert.equal(spec.items[1].fx, undefined);
    assert.equal(spec.items[2].fx, undefined);
    assert.match(said.join('\n'), /items\[0\]\.fx\[1\]: expected an object with a "type"/);
    assert.match(said.join('\n'), /items\[1\]\.fx: expected a list of effects/);
  } finally {
    console.warn = warn;
  }
});

test('a bare dither takes every default; colours and mode are checked', () => {
  const { note, out } = noted();
  const [fx] = readFx([{ type: 'dither' }], note, 'items[0]');
  assert.deepEqual(fx, { type: 'dither', ...FX_DEFAULTS.dither });
  assert.equal(fx.on, 'always');
  assert.deepEqual(out, []);
  const { note: n2, out: o2 } = noted();
  const [bad] = readFx([{ type: 'dither', mode: 'ascii', color: 'url(x)', accent: '#0f08', size: 0 }], n2, 'items[0]');
  assert.equal(bad.mode, 'bayer');
  assert.equal(bad.color, '#000000');
  assert.equal(bad.accent, '#0f08');
  assert.equal(bad.size, 1);
  assert.equal(o2.length, 3);
});

test('rgbaOf reads hex, rgb() and transparent as 0 to 1', async () => {
  const { rgbaOf } = await load('fxspec');
  assert.deepEqual(rgbaOf('#fff'), [1, 1, 1, 1]);
  assert.deepEqual(rgbaOf('transparent'), [0, 0, 0, 0]);
  assert.deepEqual(rgbaOf('#00000080').map((x) => Math.round(x * 100) / 100), [0, 0, 0, 0.5]);
  assert.deepEqual(rgbaOf('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
  assert.equal(rgbaOf('red'), null);
});

// ── distort: Codrops' Distorted Pixels (MIT) ──
const { stepDistortion, sweepAt } = await load('fxsurface');

test('a bare distort is Codrops\' demo 1: grid 50, reach 0.25, strength 0.11, relaxation 0.9, on hover', () => {
  const { note, out } = noted();
  const [fx] = readFx([{ type: 'distort' }], note, 'items[0]');
  assert.deepEqual(fx, { type: 'distort', ...FX_DEFAULTS.distort });
  assert.equal(fx.grid, 50);
  assert.equal(fx.mouse, 0.25);
  assert.equal(fx.strength, 0.11);
  assert.equal(fx.relaxation, 0.9);
  assert.equal(fx.on, 'hover');
  assert.deepEqual(out, []);
});

test('demo 2 reads as written; the grid is whole, everything is kept in range and said', () => {
  const { note, out } = noted();
  const [d2] = readFx([{ type: 'distort', grid: 607, mouse: 0.11, strength: 0.36, relaxation: 0.96 }], note, 'x');
  assert.deepEqual([d2.grid, d2.mouse, d2.strength, d2.relaxation], [607, 0.11, 0.36, 0.96]);
  assert.deepEqual(out, []);
  const [odd] = readFx([{ type: 'distort', grid: 12.6, mouse: 2, strength: -1, relaxation: 1, }], note, 'x');
  assert.equal(odd.grid, 13);
  assert.equal(odd.mouse, 1);
  assert.equal(odd.strength, 0);
  assert.equal(odd.relaxation, 0.999);
  assert.equal(out.length, 3);
  const [tiny] = readFx([{ type: 'distort', grid: 1 }, { type: 'distort', grid: 5000 }], note, 'x');
  assert.equal(tiny.grid, 2);
});

const grid = (over = {}) => {
  const [fx] = readFx([{ type: 'distort', ...over }], () => {}, 'x');
  return { fx, size: fx.grid, data: new Float32Array(fx.grid * fx.grid * 2), tex: null, texSize: 0, vx: 0, vy: 0, prev: null, settled: true };
};
const most = (d) => d.data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('a pointer moving right pushes the cells near it right, and only those', () => {
  const d = grid();
  d.vx = 0.05;
  assert.equal(stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60), true);
  const at = (i, j) => d.data[2 * (i + d.size * j)];
  assert.ok(at(25, 25) > 0, 'the cell under the pointer moved right');
  assert.equal(at(2, 2), 0, 'a far cell did not move');
  assert.equal(d.settled, false);
});

test('a pointer moving down pushes the cells down (the grid counts up from the bottom)', () => {
  const d = grid();
  d.vy = 0.05;
  stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60);
  assert.ok(d.data[2 * (25 + d.size * 25) + 1] < 0);
});

test('undriven, nothing is pushed; then it settles back to nothing and says so', () => {
  const d = grid();
  d.vx = 0.05;
  stepDistortion(d, 0, 0.5, 0.5, 1, 1000 / 60);
  assert.equal(most(d), 0);
  d.vx = 0.05;
  stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60);
  let frames = 0;
  while (stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60) && frames < 2000) frames++;
  assert.equal(d.settled, true);
  assert.equal(most(d), 0);
  assert.ok(frames > 5 && frames < 400, `${frames} frames`);
});

test('a higher relaxation settles more slowly (demo 2 lingers)', () => {
  const settle = (relaxation) => {
    const d = grid({ relaxation });
    d.vx = 0.05;
    stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60);
    let n = 0;
    while (stepDistortion(d, 1, 0.5, 0.5, 1, 1000 / 60) && n < 5000) n++;
    return n;
  };
  assert.ok(settle(0.96) > settle(0.9) * 2);
});

test('intensity scales the push; speed runs its clock', () => {
  const push = (over, dt = 1000 / 60) => {
    const d = grid(over);
    d.vx = 0.05;
    stepDistortion(d, 1, 0.5, 0.5, 1, dt);
    return d.data[2 * (25 + d.size * 25)];
  };
  assert.ok(Math.abs(push({ intensity: 0.5 }) - push({}) / 2) < 1e-6);
  const slow = grid({ speed: 0.5 }), fast = grid({ speed: 2 });
  slow.data[0] = fast.data[0] = 10;
  stepDistortion(slow, 1, 0.5, 0.5, 1, 1000 / 60);
  stepDistortion(fast, 1, 0.5, 0.5, 1, 1000 / 60);
  assert.ok(fast.data[0] < slow.data[0]);
});

// ── the sweep: a pointer's stand-in when none moves the cells (1.13.1) ──
test('the sweep stays over the picture, moves a little each frame, and a seed changes its path', () => {
  let last = sweepAt(0, 0);
  let longest = 0;
  for (let f = 1; f < 60 * 20; f++) {
    const [x, y] = sweepAt(0, f / 60);
    assert.ok(x > 0.1 && x < 0.9 && y > 0.1 && y < 0.9, `${x}, ${y}`);
    longest = Math.max(longest, Math.hypot(x - last[0], y - last[1]));
    last = [x, y];
  }
  assert.ok(longest > 0.005 && longest < 0.03, `at most ${longest} of the picture a frame`);
  assert.notDeepEqual(sweepAt(0, 1), sweepAt(7, 1));
  assert.deepEqual(sweepAt(3, 2.5), sweepAt(3, 2.5));
});

test('driven by the sweep, the grid keeps moving and never settles; undriven, it settles', () => {
  const d = grid({ on: 'always' });
  let prev = sweepAt(0, 0);
  for (let f = 1; f <= 120; f++) {
    const at = sweepAt(0, f / 60);
    d.vx = at[0] - prev[0];
    d.vy = at[1] - prev[1];
    prev = at;
    assert.equal(stepDistortion(d, 1, at[0], at[1], 1, 1000 / 60), true, `frame ${f}`);
  }
  assert.ok(most(d) > 0.5, `offset ${most(d)}`);
  let n = 0;
  while (stepDistortion(d, 0, prev[0], prev[1], 1, 1000 / 60) && n < 2000) n++;
  assert.equal(d.settled, true);
});

