// 1.16.0's spec: a pivot for an element's motions, an edge fade, an interaction heard on another element, and the
// ripple wipe (from the pointer), as the reader fills them in and refuses what it cannot play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readItem, Notes } = await load('spec');
const read = (v) => {
  const notes = new Notes('t');
  const item = readItem({ id: 'a', ...v }, notes, 0);
  return { item, said: notes.list ? notes.list.join('\n') : String(notes.items ?? '') };
};

test('origin: one of nine points is kept', () => {
  for (const o of ['top', 'bottom-right', 'center', 'left']) assert.equal(read({ origin: o }).item.origin, o);
});

test('origin: anything else falls back to the centre', () => {
  assert.equal(read({ origin: 'middle' }).item.origin, 'center');
  assert.equal(read({ origin: 3 }).item.origin, 'center');
});

test('fade: px per edge, clamped to 0 and up, the edges not named left out', () => {
  assert.deepEqual(read({ fade: { top: 40, bottom: 60 } }).item.fade, { top: 40, bottom: 60 });
  assert.deepEqual(read({ fade: { left: -5, right: 30 } }).item.fade, { left: 0, right: 30 });
});

test('fade: nothing to fade is no fade', () => {
  assert.equal(read({ fade: { top: 0 } }).item.fade, undefined);
  assert.equal(read({ fade: 'soft' }).item.fade, undefined);
});

test('an interaction keeps the element it is heard on', () => {
  const ix = { trigger: 'hover', action: { type: 'change', state: { scale: 1.1 } }, source: 'parent' };
  assert.equal(read({ interactions: [ix] }).item.interactions[0].source, 'parent');
  assert.equal(read({ interactions: [{ ...ix, source: 'card' }] }).item.interactions[0].source, 'card');
  assert.equal(read({ interactions: [{ ...ix, source: '' }] }).item.interactions[0].source, undefined);
});

test('a wipe can ripple from the pointer; a roll cannot', () => {
  assert.equal(read({ rollover: { effect: 'wipe', color: '#000', direction: 'pointer' } }).item.rollover[0].direction, 'pointer');
  assert.equal(read({ rollover: { effect: 'roll', direction: 'pointer' } }).item.rollover[0].direction, 'up');
});
