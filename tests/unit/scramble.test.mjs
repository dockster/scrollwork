// scramble: what a letter shows along the way (rollover.ts scrambleAt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { scrambleAt, GLYPHS } = await load('rollover');

test('before and after, the letter is its own', () => {
  assert.equal(scrambleAt('A', 0, 3, GLYPHS, 0).ch, 'A');
  assert.equal(scrambleAt('A', 1, 3, GLYPHS, 0).ch, 'A');
  assert.equal(scrambleAt('A', 1.5, 3, GLYPHS, 0).step, -1);
});
test('on the way, one character per step, from the set, steady within a step', () => {
  const steps = [0.1, 0.4, 0.7].map((k) => scrambleAt('A', k, 3, '01', 5));
  assert.deepEqual(steps.map((s) => s.step), [0, 1, 2]);
  assert.ok(steps.every((s) => s.ch === '0' || s.ch === '1'));
  assert.equal(scrambleAt('A', 0.1, 3, '01', 5).ch, scrambleAt('A', 0.2, 3, '01', 5).ch);
});
test('letters differ from one another', () => {
  const seen = new Set(Array.from({ length: 20 }, (_, i) => scrambleAt('A', 0.1, 3, GLYPHS, i).ch));
  assert.ok(seen.size > 5);
});
