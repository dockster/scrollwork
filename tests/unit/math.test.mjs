import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { frames, along } = await load('animate');
const { rangeProgress } = await load('scroll');

test('a single value animates from rest', () => {
  assert.deepEqual(frames({ y: 40 }), [['y', [0, 40]]]);
  assert.deepEqual(frames({ opacity: 0 }), [['opacity', [1, 0]]]);
  assert.deepEqual(frames({ scale: 1.2 }), [['scale', [1, 1.2]]]);
});

test('a list is keyframes, as given', () => {
  assert.deepEqual(frames({ x: [0, 100, 50] }), [['x', [0, 100, 50]]]);
});

test('non-numbers are ignored', () => {
  assert.deepEqual(frames({ x: [NaN], y: 'a' }), []);
});

test('keyframes are evenly spaced', () => {
  const f = [0, 100, 50];
  assert.equal(along(f, 0), 0);
  assert.equal(along(f, 0.25), 50);
  assert.equal(along(f, 0.5), 100);
  assert.equal(along(f, 0.75), 75);
  assert.equal(along(f, 1), 50);
  assert.equal(along(f, 2), 50);
});

test('scroll ranges: through, in and out', () => {
  // a 200px element in a 1000px view
  assert.equal(rangeProgress('through', 1000, 200, 1000), 0); // its top at the bottom edge
  assert.equal(rangeProgress('through', -200, 200, 1000), 1); // its bottom at the top edge
  assert.equal(rangeProgress('in', 400, 200, 1000), 1); // centred
  assert.equal(rangeProgress('out', 400, 200, 1000), 0); // centred
  assert.equal(rangeProgress('out', -200, 200, 1000), 1); // gone
});
