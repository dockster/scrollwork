// 1.15 in the spec: a scroll split by slices (after Codrops' Sliced Text Effect), and a text's pieces' mask and turn behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readSpec } = await load('spec');
const item = (scroll) => readSpec({ items: [{ id: 'a', text: true, scroll }] }, false).items[0].scroll;

test('slices: the split, its count (whole numbers, 2 to 12) and whole, kept only when given', () => {
  const s = item({ split: 'slices', slices: 6, whole: true, outward: true });
  assert.equal(s.split, 'slices');
  assert.equal(s.slices, 6);
  assert.equal(s.whole, true);
  const plain = item({ split: 'slices' });
  assert.equal('slices' in plain, false);
  assert.equal('whole' in plain, false);
  assert.equal(item({ split: 'slices', slices: 40 }).slices, 12);
  assert.equal(item({ split: 'slices', slices: 1 }).slices, 2);
  assert.equal(item({ split: 'slices', slices: 4.6 }).slices, 5);
  assert.equal('whole' in item({ split: 'slices', whole: 'yes' }), false);
});

test('a text\'s pieces: a mask from a side, and a turn about a point behind', () => {
  const s = item({ split: 'chars', mask: 'right', origin: 'behind', order: 'end', vary: 1, outward: true });
  assert.equal(s.mask, 'right');
  assert.equal(s.origin, 'behind');
  assert.equal(s.order, 'end');
  assert.equal('mask' in item({ split: 'chars' }), false);
  assert.equal(item({ split: 'chars', mask: 'diagonal' }).mask, 'bottom');
});
