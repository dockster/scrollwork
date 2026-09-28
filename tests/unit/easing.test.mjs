import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { bezier, EASES, CURVES, easeOf } = await load('easing');

test('every named curve starts at 0 and ends at 1', () => {
  for (const [name, f] of Object.entries(EASES)) {
    assert.equal(f(0), 0, name);
    assert.equal(f(1), 1, name);
  }
});

test('linear is the identity, and clamps', () => {
  assert.equal(EASES.linear(0.3), 0.3);
  assert.equal(EASES.linear(-1), 0);
  assert.equal(EASES.linear(2), 1);
});

test('smooth is symmetric: half way in time is half way along', () => {
  assert.ok(Math.abs(EASES.smooth(0.5) - 0.5) < 1e-3);
  assert.ok(Math.abs(EASES.smooth(0.25) + EASES.smooth(0.75) - 1) < 1e-3);
});

test('the bezier solver matches known CSS values', () => {
  // cubic-bezier(0.42, 0, 1, 1) is CSS ease-in; at t = 0.5 it is about 0.3153
  assert.ok(Math.abs(bezier(0.42, 0, 1, 1)(0.5) - 0.3153) < 2e-3, String(bezier(0.42, 0, 1, 1)(0.5)));
});

test('out is monotonic', () => {
  let last = 0;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const v = EASES.out(Math.min(1, t));
    assert.ok(v >= last - 1e-9, `${t}: ${v} < ${last}`);
    last = v;
  }
});

test('back overshoots, as it should', () => {
  let max = 0;
  for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, EASES.back(t));
  assert.ok(max > 1.01, String(max));
});

test('x outside 0 to 1 is clamped, so the solver still lands', () => {
  const f = bezier(0.5, 0, 1.6, 1);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(Number.isFinite(f(t)));
  assert.equal(f(1), 1);
});

test('easeOf takes a name, points or a function, and falls back to out', () => {
  assert.equal(easeOf('linear')(0.4), 0.4);
  assert.equal(easeOf([0, 0, 1, 1])(0.5).toFixed(3), '0.500');
  assert.equal(easeOf((t) => t * t)(0.5), 0.25);
  assert.equal(easeOf('nope')(0.5), EASES.out(0.5));
  // every named curve is a bezier, but for linear and the six easings.net draws (Elastic, Bounce)
  assert.deepEqual(Object.keys(CURVES).sort(), Object.keys(EASES).filter((k) => k !== 'linear' && !/elastic|bounce/.test(k)).sort());
});

test('springs: every Figma preset starts at rest at 0, ends at 1, and settles in under two seconds', async () => {
  const { spring, SPRINGS } = await load('easing');
  for (const [name, [k, c, m]] of Object.entries(SPRINGS)) {
    const s = spring(k, c, m);
    assert.equal(s.ease(0), 0, name);
    assert.equal(s.ease(1), 1, name);
    assert.ok(s.duration > 0.1 && s.duration < 2, `${name} settles in ${s.duration}s`);
  }
});

test('springs: bouncy goes past the end before it settles, slow does not', async () => {
  const { spring, SPRINGS } = await load('easing');
  const peak = (s) => Math.max(...Array.from({ length: 200 }, (_, i) => s.ease(i / 199)));
  assert.ok(peak(spring(...SPRINGS.bouncy)) > 1.05, 'bouncy overshoots');
  assert.ok(peak(spring(...SPRINGS.slow)) <= 1.02, 'slow barely does');
});

test('springs are worked out once per set of numbers', async () => {
  const { spring } = await load('easing');
  assert.equal(spring(300, 20, 1), spring(300, 20, 1));
});

test('an interaction may ask for a spring, and a bad one falls back to out with a note', async () => {
  const { readAnimation } = await load('spec');
  const notes = new Set();
  assert.deepEqual(readAnimation({ curve: 'spring', spring: [600, 15, 1], duration: 0.5 }, notes, 'a').spring, [600, 15, 1]);
  const bad = readAnimation({ curve: 'spring', spring: [600] }, notes, 'b');
  assert.equal(bad.curve, 'out');
  assert.ok([...notes].some((n) => n.includes('spring')));
});

// ── easings.net ─────────────────────────────────────────────────────────────
const { EASINGS, DRAWN, cssEase } = await load('easing');

test('the thirty easings of easings.net, Sine to Bounce, each named', () => {
  assert.equal(EASINGS.length, 30);
  assert.equal(EASINGS[0], 'ease-in-sine');
  assert.equal(EASINGS[29], 'ease-in-out-bounce');
  for (const n of EASINGS) assert.equal(typeof EASES[n], 'function', n);
});

test('twenty four are beziers with easings.net’s points, six are drawn', () => {
  assert.equal(EASINGS.filter((n) => CURVES[n]).length, 24);
  assert.deepEqual(Object.keys(DRAWN).sort(), EASINGS.filter((n) => /elastic|bounce/.test(n)).sort());
  assert.deepEqual(CURVES['ease-in-sine'], [0.12, 0, 0.39, 0]);
  assert.deepEqual(CURVES['ease-in-out-back'], [0.68, -0.6, 0.32, 1.6]);
  // the ones Scrollwork already had under its own name are the same curve
  assert.deepEqual(CURVES['ease-out-quint'], CURVES.out);
  assert.deepEqual(CURVES['ease-in-out-expo'], CURVES.smooth);
});

test('Elastic overshoots and Bounce lands on its bounces', () => {
  let max = 0;
  for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, EASES['ease-out-elastic'](t));
  assert.ok(max > 1.01, String(max));
  assert.ok(Math.abs(EASES['ease-out-bounce'](1 / 2.75) - 1) < 1e-9);
  assert.equal(EASES['ease-in-bounce'](-1), 0);
  assert.equal(EASES['ease-in-out-elastic'](2), 1);
});

test('cssEase writes a named curve as CSS', () => {
  assert.equal(cssEase('ease-out-circ'), 'cubic-bezier(0, 0.55, 0.45, 1)');
  assert.equal(cssEase('linear'), 'linear');
  const b = cssEase('ease-out-bounce');
  assert.ok(b.startsWith('linear(0, ') && b.endsWith(', 1)') && b.split(',').length === 129, b.slice(0, 40));
});
