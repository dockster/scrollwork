// 1.18.0's spec: colours turned round the wheel (hue), a glow and its colour, an SVG line drawn (draw), a scroll that
// follows an element across the screen (axis x), and the effects add-on's colour map, as the readers fill them in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readItem, Notes } = await load('spec');
const fxSpec = await load('fxspec');
const read = (v) => readItem({ id: 'a', ...v }, new Notes('t'), 0);

test('hue, glow, glowColor and draw are kept in a state, only when given', () => {
  const s = read({ appear: { effect: 'custom', from: { hue: 120, glow: 24, glowColor: '#ffcc00', draw: 0 } } }).appear.from;
  assert.equal(s.hue, 120);
  assert.equal(s.glow, 24);
  assert.equal(s.glowColor, '#ffcc00');
  assert.equal(s.draw, 0);
  const plain = read({ appear: { effect: 'custom', from: { y: 10 } } }).appear.from;
  assert.equal(plain.hue, undefined);
  assert.equal(plain.glow, undefined);
  assert.equal(plain.draw, undefined);
});

test('draw is kept within 0 and 1, a glow from 0', () => {
  const s = read({ hover: { draw: 2, glow: -5 }, scroll: { from: { draw: -1 } } });
  assert.equal(read({ scroll: { from: { draw: 3 } } }).scroll.from.draw, 1);
  assert.equal(read({ scroll: { from: { draw: -1 } } }).scroll.from.draw, 0);
  assert.equal(read({ scroll: { from: { glow: -5 } } }).scroll.from.glow, 0);
  void s;
});

test('a scroll axis: x is kept, y is the default and left out, anything else is refused', () => {
  assert.equal(read({ scroll: { axis: 'x' } }).scroll.axis, 'x');
  assert.equal(read({ scroll: { axis: 'y' } }).scroll.axis, undefined);
  assert.equal(read({ scroll: { axis: 'z' } }).scroll.axis, undefined);
});

test('colour map: its defaults are a heat ramp on progress; a sweep and a curve are read and clamped', () => {
  const read1 = fxSpec.readFx ?? fxSpec.readFxList ?? fxSpec.fxOf;
  assert.ok(read1, 'the fx reader is exported');
  const [c] = read1([{ type: 'colormap' }], () => {}, 'fx');
  assert.equal(c.on, 'progress');
  assert.equal(c.reveal, 'fade');
  assert.equal(c.color5.toUpperCase(), '#FFF2C8');
  const [d] = read1([{ type: 'colormap', reveal: 'sweep', curve: 9, on: 'hover' }], () => {}, 'fx');
  assert.equal(d.reveal, 'sweep');
  assert.equal(d.curve, 4);
  assert.equal(d.on, 'hover');
});
