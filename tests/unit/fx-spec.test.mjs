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
  assert.match(out[0], /items\[3\]\.fx\[1\]: "sparkle" is not an effect this build of scrollwork\/fx plays \(glitch\)/);
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
