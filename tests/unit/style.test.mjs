import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { identity, mix, combine, rgba } = await load('style');

test('one axis mixes and combines like scale', () => {
  const a = identity();
  const b = { ...identity(), sx: 0, sy: 2 };
  const half = mix(a, b, 0.5);
  assert.equal(half.sx, 0.5);
  assert.equal(half.sy, 1.5);
  const both = combine({ ...identity(), scale: 2 }, { ...identity(), sx: 0.5 });
  assert.equal(both.scale, 2);
  assert.equal(both.sx, 0.5);
});

test('a colour moves from the element\'s own: nothing at rest, the colour at the end', () => {
  const to = { ...identity(), fill: { c: [161, 255, 203, 1], k: 1 } };
  assert.equal(mix(identity(), to, 0).fill.k, 0);
  assert.equal(mix(identity(), to, 0.25).fill.k, 0.25);
  assert.deepEqual(mix(identity(), to, 1).fill, { c: [161, 255, 203, 1], k: 1 });
  // two colours: the one further along shows
  const other = { ...identity(), fill: { c: [0, 0, 0, 1], k: 0.2 } };
  assert.deepEqual(combine(to, other).fill, to.fill);
  assert.deepEqual(combine(other, to).fill, to.fill);
});

test('a picture swaps at the midpoint', () => {
  const to = { ...identity(), image: { url: 'b.png', k: 1 } };
  assert.equal(mix(identity(), to, 0.4).image.k, 0.4);
  assert.equal(mix(identity(), to, 0.6).image.url, 'b.png');
});

test('a computed colour reads as numbers', () => {
  assert.deepEqual(rgba('rgb(35, 35, 35)'), [35, 35, 35, 1]);
  assert.deepEqual(rgba('rgba(0, 0, 0, 0.5)'), [0, 0, 0, 0.5]);
  assert.deepEqual(rgba('rgb(1 2 3 / 50%)'), [1, 2, 3, 0.5]);
  assert.deepEqual(rgba('color(srgb 1 0 0)'), [0, 0, 0, 0]);
});
