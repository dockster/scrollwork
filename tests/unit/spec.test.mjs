import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readSpec, readItem, Notes } = await load('spec');

/** what readSpec said in the console */
const said = (fn) => {
  const out = [];
  const warn = console.warn;
  console.warn = (m) => out.push(String(m));
  try {
    return { value: fn(), out: out.join('\n') };
  } finally {
    console.warn = warn;
  }
};

test('a bare appear is filled in with the defaults', () => {
  const { value } = said(() => readSpec({ items: [{ id: 'a', appear: {} }] }));
  const a = value.items[0].appear;
  assert.equal(a.effect, 'slide-up');
  assert.equal(a.duration, 0.8);
  assert.equal(a.ease, 'expo');
  assert.deepEqual(a.from, { x: 0, y: 40, scale: 1, rotate: 0, opacity: 0, blur: 0 });
  assert.equal(value.version, 1);
});

test('a spec without problems says nothing', () => {
  const { out } = said(() => readSpec({ version: 1, items: [{ id: 'a', appear: { effect: 'fade' } }], smooth: true }));
  assert.equal(out, '');
});

test('an unknown ease is named, and out is used', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', appear: { ease: 'bounce' } }] }));
  assert.equal(value.items[0].appear.ease, 'expo');
  assert.match(out, /items\[0\]\.appear\.ease: "bounce" is not one of/);
});

test('numbers are checked, clamped and read from strings', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', appear: { duration: '1.5', offset: 140, from: { opacity: 3 } } }] }));
  const a = value.items[0].appear;
  assert.equal(a.duration, 1.5);
  assert.equal(a.offset, 100);
  assert.equal(a.from.opacity, 1);
  assert.match(out, /offset: 140 is outside 0 to 100/);
});

test('a newer version is played, and said', () => {
  const { value, out } = said(() => readSpec({ version: 2, items: [{ id: 'a', pin: {} }] }));
  assert.equal(value.items.length, 1);
  assert.match(out, /version 2 was written for a newer Scrollwork/);
});

test('an item without an id is dropped, and said', () => {
  const { value, out } = said(() => readSpec({ items: [{ appear: {} }, { id: 'b', scroll: { speed: 20 } }] }));
  assert.deepEqual(value.items.map((i) => i.id), ['b']);
  assert.match(out, /items\[0\]: needs an "id"/);
});

test('warnings can be turned off', () => {
  const { out } = said(() => readSpec({ items: [{ id: 'a', appear: { ease: 'bounce' } }] }, false));
  assert.equal(out, '');
});

test('interactions: a change, a custom curve, and a curve without points', () => {
  const notes = new Notes('t');
  const item = readItem(
    {
      id: 'a',
      interactions: [
        { trigger: 'hover', action: { type: 'change', state: { scale: 1.1 } }, animation: { curve: 'custom', bezier: [0.2, 0, 0.2, 1], duration: 0.3 } },
        { trigger: 'click', action: { type: 'scroll', target: 'next' }, animation: { curve: 'custom' } },
      ],
    },
    notes,
    0
  );
  assert.deepEqual(item.interactions[0].animation.bezier, [0.2, 0, 0.2, 1]);
  assert.equal(item.interactions[0].action.state.scale, 1.1);
  assert.equal(item.interactions[1].action.targetId, 'next');
  assert.equal(item.interactions[1].animation.curve, 'out');
  assert.match(notes.list.join('\n'), /a custom curve needs \[x1, y1, x2, y2\]/);
});

test('a start state without an effect is a custom start', () => {
  const { value } = said(() => readSpec({ items: [{ id: 'a', appear: { from: { x: -200 } } }] }));
  assert.equal(value.items[0].appear.effect, 'custom');
  assert.equal(value.items[0].appear.from.x, -200);
});

test('"appear": "fade" is the effect alone', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', appear: 'fade' }] }));
  assert.equal(value.items[0].appear.effect, 'fade');
  assert.equal(out, '');
});

test('an appear that is neither is said, and the defaults are used', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', appear: 42 }] }));
  assert.equal(value.items[0].appear.effect, 'slide-up');
  assert.match(out, /expected an object like/);
});

test('a custom action keeps its name and data as written, for the page', async () => {
  const { readInteraction } = await load('spec');
  const notes = new Set();
  const ix = readInteraction({ trigger: 'click', action: { type: 'custom', name: 'set-variable', data: { variableId: 'v1', value: { lit: 2 } } } }, notes, 'a', 0);
  assert.equal(ix.action.type, 'custom');
  assert.equal(ix.action.name, 'set-variable');
  assert.deepEqual(ix.action.data, { variableId: 'v1', value: { lit: 2 } });
});

test('scroll offset, preserve scroll, and a manual overlay with its backdrop are kept', async () => {
  const { readInteraction } = await load('spec');
  const notes = new Set();
  const s = readInteraction({ trigger: 'click', action: { type: 'scroll', target: 'x', offset: 80 } }, notes, 'a', 0);
  assert.equal(s.action.offset, 80);
  const n = readInteraction({ trigger: 'click', action: { type: 'navigate', target: 'b.html', preserveScroll: true } }, notes, 'b', 0);
  assert.equal(n.action.preserveScroll, true);
  const o = readInteraction({ trigger: 'click', action: { type: 'overlay', target: 'm', position: 'manual', offset: { x: 0, y: 60 }, backdrop: '#FF000080' } }, notes, 'c', 0);
  assert.deepEqual([o.action.position, o.action.offset, o.action.backdrop], ['manual', { x: 0, y: 60 }, '#FF000080']);
});
