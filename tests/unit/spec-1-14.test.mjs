// 1.14 in the spec: a state's clip, a scroll's ease, split and spread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readSpec } = await load('spec');
const item = (scroll) => readSpec({ items: [{ id: 'a', text: true, scroll }] }, false).items[0].scroll;

test('a clip is kept side by side, 0 to 100, only the sides given', () => {
  const s = item({ from: { clip: { top: 100, right: 100 } }, to: {} });
  assert.deepEqual(s.from.clip, { top: 100, right: 100 });
  assert.equal(s.to.clip, undefined);
  assert.deepEqual(item({ from: { clip: { left: 140, bottom: -3 } } }).from.clip, { left: 100 });
});
test('a clip that is not an object is a note, not a state', () => {
  const s = item({ from: { clip: 'inset(0)' } });
  assert.equal(s.from.clip, undefined);
});
test('a scroll keeps its ease, split and spread only when given', () => {
  const s = item({ ease: 'ease-out-quad', split: 'words', spread: 0.2 });
  assert.equal(s.ease, 'ease-out-quad');
  assert.equal(s.split, 'words');
  assert.equal(s.spread, 0.2);
  const plain = item({});
  assert.equal('ease' in plain, false);
  assert.equal('split' in plain, false);
  assert.equal('spread' in plain, false);
});
test('unknown values fall back', () => {
  const s = item({ ease: 'wobbly', split: 'paragraphs', spread: 9 });
  assert.equal(s.ease, 'linear');
  assert.equal(s.split, 'none');
  assert.equal(s.spread, 1);
});

test('a formation: split by children, its order, outward, vary and origin', () => {
  const s = item({ split: 'children', order: 'center', outward: true, vary: 0.4, origin: 'top', spread: 0.2 });
  assert.equal(s.split, 'children');
  assert.equal(s.order, 'center');
  assert.equal(s.outward, true);
  assert.equal(s.vary, 0.4);
  assert.equal(s.origin, 'top');
  const odd = item({ split: 'children', order: 'sideways', vary: 3, origin: 'nowhere', outward: 'yes' });
  assert.equal(odd.order, 'start');
  assert.equal(odd.vary, 1);
  assert.equal(odd.origin, 'center');
  assert.equal('outward' in odd, false);
  // an appear never splits by children
  const a = readSpec({ items: [{ id: 'a', text: false, appear: { split: 'children' } }] }, false).items[0].appear;
  assert.equal(a.split, 'none');
});

const ro = (r) => readSpec({ items: [{ id: 'a', text: true, rollover: r }] }, false).items[0].rollover;
test('a scramble: its turns, characters, cursor, colours and when it plays', () => {
  const [s] = ro({ effect: 'scramble', turns: 4, glyphs: '01 \n#', cursor: true, colors: ['#22a3a9', 'red; x:1', '#4ca922'], on: 'both' });
  assert.equal(s.effect, 'scramble');
  assert.equal(s.turns, 4);
  assert.equal(s.glyphs, '01#', 'spaces and line breaks are left out');
  assert.equal(s.cursor, true);
  assert.deepEqual(s.colors, ['#22a3a9', '#4ca922'], 'what is not a colour is left out');
  assert.equal(s.on, 'both');
  assert.equal(s.duration, 0.25);
  const [d] = ro({ effect: 'scramble', turns: 99, on: 'always' });
  assert.equal(d.turns, 10);
  assert.equal(d.on, 'hover');
  assert.equal('glyphs' in d, false);
});
test('a scramble and a roll do not share the letters; a scramble and a wipe do', () => {
  assert.deepEqual(ro([{ effect: 'roll' }, { effect: 'scramble' }]).map((r) => r.effect), ['roll']);
  assert.deepEqual(ro([{ effect: 'scramble' }, { effect: 'wipe', color: '#000' }]).map((r) => r.effect), ['scramble', 'wipe']);
});
