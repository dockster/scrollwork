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

test('an easings.net name is a curve anywhere one is read', async () => {
  const { readInteraction } = await load('spec');
  const notes = new Set();
  const ix = readInteraction({ trigger: 'click', action: { type: 'change', state: { scale: 1.1 } }, animation: { curve: 'ease-out-bounce', duration: 0.5 } }, notes, 'a', 0);
  assert.equal(ix.animation.curve, 'ease-out-bounce');
  const { value, out } = said(() => readSpec({ items: [{ id: 'x', appear: { effect: 'fade', ease: 'ease-in-out-elastic' }}] }));
  assert.equal(value.items[0].appear.ease, 'ease-in-out-elastic');
  assert.equal(notes.size, 0, [...notes].join());
  assert.equal(out, '');
});

test('a made-up easing is refused with a note, and falls back to out', async () => {
  const { readInteraction } = await load('spec');
  const notes = new Set();
  const ix = readInteraction({ trigger: 'click', action: { type: 'back' }, animation: { curve: 'ease-in-wobble' } }, notes, 'a', 0);
  assert.equal(ix.animation.curve, 'out');
  assert.ok([...notes].some((n) => n.includes('ease-in-wobble')), [...notes].join());
});

test('a state can scale one axis, move to a colour and show a picture; the rest is left out', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', interactions: [{ trigger: 'hover', action: { type: 'change', state: { scaleX: 0, fill: '#A1FFCB', ink: 'white', image: 'https://example.com/a.png' } } }] }] }));
  const s = value.items[0].interactions[0].action.state;
  assert.equal(s.scaleX, 0);
  assert.equal(s.scaleY, undefined);
  assert.equal(s.fill, '#A1FFCB');
  assert.equal(s.ink, 'white');
  assert.equal(s.image, 'https://example.com/a.png');
  assert.equal(out, '');
  const plain = readSpec({ items: [{ id: 'b', interactions: [{ trigger: 'hover', action: { type: 'change', state: { scale: 1.1 } } }] }] }).items[0].interactions[0].action.state;
  assert.deepEqual(plain, { x: 0, y: 0, scale: 1.1, rotate: 0, opacity: 1, blur: 0 });
});

test('a colour or a picture that is not one is refused, and said', () => {
  const { value, out } = said(() => readSpec({ items: [{ id: 'a', interactions: [{ trigger: 'hover', action: { type: 'change', state: { fill: 'red; background: url(x)', image: 'javascript:alert(1)' } } }] }] }));
  const s = value.items[0].interactions[0].action.state;
  assert.equal(s.fill, undefined);
  assert.equal(s.image, undefined);
  assert.match(out, /fill: expected a CSS colour/);
  assert.match(out, /image: expected a picture's URL/);
});

test('a parallax can keep covering its parent; left out otherwise', () => {
  const on = readSpec({ items: [{ id: 'a', scroll: { speed: 30, cover: true } }] }).items[0].scroll;
  assert.equal(on.cover, true);
  const off = readSpec({ items: [{ id: 'a', scroll: { speed: 30 } }] }).items[0].scroll;
  assert.equal('cover' in off, false);
});

test('roll is an appear effect, always by letter, with whole turns', async () => {
  const { readSpec } = await load('spec');
  const s = readSpec({ items: [{ id: 'n', text: true, appear: { effect: 'roll', split: 'words', turns: 2.6 } }] }, false);
  assert.equal(s.items[0].appear.effect, 'roll');
  assert.equal(s.items[0].appear.split, 'chars');
  assert.equal(s.items[0].appear.turns, 3);
  const plain = readSpec({ items: [{ id: 'n', appear: { effect: 'fade' } }] }, false);
  assert.equal('turns' in plain.items[0].appear, false);
});

test('loop: defaults, clamps, and nothing without one', async () => {
  const { readSpec } = await load('spec');
  const s = readSpec({ items: [{ id: 'm', loop: { to: { x: -640 }, duration: 12.8 } }, { id: 'r', loop: { to: { rotate: 360 }, duration: 0, yoyo: 1 } }, { id: 'n' }] }, false);
  assert.equal(s.items[0].loop.to.x, -640);
  assert.equal(s.items[0].loop.from.x, 0);
  assert.equal(s.items[0].loop.duration, 12.8);
  assert.equal(s.items[0].loop.ease, 'linear');
  assert.equal(s.items[0].loop.yoyo, false);
  assert.equal(s.items[0].loop.fade, 0);
  const f = readSpec({ items: [{ id: 'm', loop: { to: { y: -480 }, fade: 64 } }, { id: 'n', loop: { to: { y: -480 }, fade: -3 } }] }, false);
  assert.equal(f.items[0].loop.fade, 64);
  assert.equal(f.items[1].loop.fade, 0, 'a negative fade is none');
  assert.equal(f.items[0].loop.upright, false);
  const u = readSpec({ items: [{ id: 'ring', loop: { to: { rotate: 360 }, duration: 32, upright: true } }, { id: 'no', loop: { to: { rotate: 360 }, upright: 'yes' } }] }, false);
  assert.equal(u.items[0].loop.upright, true);
  assert.equal(u.items[1].loop.upright, false, 'only true is upright');
  assert.equal(s.items[1].loop.duration, 0.05);
  assert.equal(s.items[1].loop.yoyo, true);
  assert.equal(s.items[2].loop, undefined);
});

test('3D states: rotateX, rotateY and perspective read only when given; hold is a scroll range', async () => {
  const { readSpec } = await load('spec');
  const s = readSpec({ items: [{ id: 'a', scroll: { range: 'hold', to: { scale: 0.7, rotateX: 40, opacity: 0 } }, pin: { distance: 900 } }, { id: 'b', scroll: { to: { rotateY: '12', perspective: 0 } } }] }, false);
  assert.equal(s.items[0].scroll.range, 'hold');
  assert.equal(s.items[0].scroll.to.rotateX, 40);
  assert.equal('rotateY' in s.items[0].scroll.to, false);
  assert.equal('perspective' in s.items[0].scroll.from, false);
  assert.equal(s.items[1].scroll.to.rotateY, 12);
  assert.equal(s.items[1].scroll.to.perspective, 1, 'a perspective is at least 1px');
});

test('cursor: true takes the defaults; fields are read and clamped; a links state', async () => {
  const { readSpec } = await load('spec');
  const s = readSpec({ items: [{ id: 'dot', cursor: true }, { id: 'ring', cursor: { lag: 5, hide: false, blend: 'difference', links: { scale: 2.5 } } }, { id: 'no', cursor: false }, { id: 'bad', cursor: { blend: 'glow' } }] }, false);
  assert.deepEqual(s.items[0].cursor, { lag: 0.12, hide: true, blend: 'normal' });
  assert.equal(s.items[1].cursor.lag, 2, 'a lag is at most 2 s');
  assert.equal(s.items[1].cursor.hide, false);
  assert.equal(s.items[1].cursor.blend, 'difference');
  assert.equal(s.items[1].cursor.links.scale, 2.5);
  assert.equal('cursor' in s.items[2], false);
  assert.equal(s.items[3].cursor.blend, 'normal');
});

test('loader: true takes the defaults, fields are clamped; flipbook is a loop field', async () => {
  const { readSpec } = await load('spec');
  const s = readSpec({ items: [{ id: 'l', loader: true }, { id: 'm', loader: { hold: 99, leave: -1, effect: 'blur', once: true } }, { id: 'b', loop: { flipbook: 0.5 } }, { id: 'n', loop: { flipbook: -2 } }] }, false);
  assert.deepEqual(s.items[0].loader, { hold: 2.5, leave: 0.6, effect: 'fade', once: false });
  assert.deepEqual(s.items[1].loader, { hold: 60, leave: 0, effect: 'blur', once: true });
  assert.equal(s.items[2].loop.flipbook, 0.5);
  assert.equal(s.items[3].loop.flipbook, 0);
});
