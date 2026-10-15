// 1.14: any property (props.ts), timeline placement (timeline.ts), and
// scroll()'s start, end and snap (scroll.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { mixer, mixAlong, hex, normalise, cssName, fmt } = await load('props');
const { place } = await load('timeline');
const { edge, positionOf, snapTo, rangeProgress } = await load('scroll');
const { frames, lanesFor } = await load('tween');

test('a length moves number by number, in its unit', () => {
  const m = mixer('100px', '300px');
  assert.equal(m(0), '100px');
  assert.equal(m(0.5), '200px');
  assert.equal(m(1), '300px');
});
test('a bare number takes the other end’s unit', () => {
  assert.equal(mixer('0', '40%')(0.5), '20%');
  assert.equal(mixer('12px', '20')(0.5), '16px');
});
test('a value with several numbers moves each', () => {
  assert.equal(mixer('inset(0 0 100% 0)', 'inset(0 0 0% 0)')(0.25), 'inset(0 0 75% 0)');
  assert.equal(mixer('0 4px 12px rgba(0, 0, 0, 0.2)', '0 12px 32px rgba(0, 0, 0, 0.4)')(0.5), '0 8px 22px rgba(0, 0, 0, 0.3)');
});
test('colours: hex and rgb() meet as rgba', () => {
  assert.deepEqual(hex('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(hex('#00000080').slice(0, 3), [0, 0, 0]);
  assert.equal(hex('#ggg'), null);
  assert.equal(normalise('rgb(10, 20, 30)'), 'rgba(10, 20, 30, 1)');
  assert.equal(mixer('#000000', 'rgb(200, 100, 50)')(0.5), 'rgba(100, 50, 25, 1)');
});
test('named colours go through the browser’s reading when given', () => {
  const named = { red: [255, 0, 0, 1], blue: [0, 0, 255, 1] };
  assert.equal(mixer('red', 'blue', (v) => named[v] || null)(0.5), 'rgba(128, 0, 128, 1)');
  // without it, a word switches halfway
  assert.equal(mixer('red', 'blue')(0.4), 'red');
  assert.equal(mixer('red', 'blue')(0.6), 'blue');
});
test('an unset variable starts at 0 in the end’s unit', () => {
  assert.equal(mixer('', '20px')(0.5), '10px');
});
test('keyframes of strings are evenly spaced', () => {
  const m = mixAlong(['0px', '100px', '50px']);
  assert.equal(m(0.25), '50px');
  assert.equal(m(0.75), '75px');
  assert.equal(m(1), '50px');
});
test('names and numbers', () => {
  assert.equal(cssName('backgroundColor'), 'background-color');
  assert.equal(cssName('--brandGlow'), '--brandGlow');
  assert.equal(fmt(1 / 3), '0.3333');
  assert.equal(fmt(1e-7), '0');
});
test('motion keys stay motion values; the new one-axis and 3D ones too', () => {
  assert.deepEqual(frames({ scaleX: 2, rotateY: [0, 30] }), [['scaleX', [1, 2]], ['rotateY', [0, 30]]]);
});
test('on a plain object every key is its own number', () => {
  const o = { value: 10, x: 5 };
  const lanes = lanesFor(o, { value: 110, x: [0, 50] });
  assert.deepEqual(lanes.map((l) => [l.key, l.kind, l.f]), [['value', 'p', [10, 110]], ['x', 'p', [0, 50]]]);
});

test('timeline places: seconds, relative to the end, the motion before, labels', () => {
  const labels = new Map([['cards', 2]]);
  const prev = [1, 1.8];
  assert.equal(place(undefined, 3, prev, labels), 3);
  assert.equal(place(0.5, 3, prev, labels), 0.5);
  assert.equal(place('+=0.2', 3, prev, labels), 3.2);
  assert.equal(place('-=0.5', 3, prev, labels), 2.5);
  assert.equal(place('<', 3, prev, labels), 1);
  assert.equal(place('>', 3, prev, labels), 1.8);
  assert.equal(place('<0.2', 3, prev, labels), 1.2);
  assert.equal(place('>-0.3', 3, prev, labels), 1.5);
  assert.equal(place('cards', 3, prev, labels), 2);
  assert.equal(place('cards+=0.4', 3, prev, labels), 2.4);
  assert.equal(place('cards-=0.5', 3, prev, labels), 1.5);
  // never before the start; an unknown label is the end
  assert.equal(place('-=9', 3, prev, labels), 0);
  assert.equal(place('nowhere', 3, prev, labels), 3);
});

test('scroll places along a length', () => {
  assert.equal(edge('top', 800), 0);
  assert.equal(edge('center', 800), 400);
  assert.equal(edge('bottom', 800), 800);
  assert.equal(edge('80%', 800), 640);
  assert.equal(edge('120px', 800), 120);
  assert.equal(edge('center+=100', 800), 500);
  assert.equal(edge('bottom-=10%', 800), 720);
  assert.equal(edge('+=600', 800), 600);
});
test('"<target> <view>" is the scroll position where it happens', () => {
  // a target 1000px down the page, 400px high, in a 800px view
  assert.equal(positionOf('top bottom', 1000, 400, 800), 200);
  assert.equal(positionOf('top top', 1000, 400, 800), 1000);
  assert.equal(positionOf('top 80%', 1000, 400, 800), 360);
  assert.equal(positionOf('bottom top', 1000, 400, 800), 1400);
  assert.equal(positionOf('center center', 1000, 400, 800), 800);
  assert.equal(positionOf(1234, 1000, 400, 800), 1234);
});
test('the ranges keep their meaning', () => {
  // halfway through 'through': the target's centre at the view's centre
  assert.equal(rangeProgress('through', 200, 400, 800), 0.5);
  assert.equal(rangeProgress('in', 200, 400, 800), 1);
  assert.equal(rangeProgress('out', 200, 400, 800), 0);
  assert.equal(rangeProgress('through', 800, 400, 800), 0);
  assert.equal(rangeProgress('through', -400, 400, 800), 1);
});
test('snap to the nearest point', () => {
  assert.equal(snapTo(0.3, 0.25), 0.25);
  assert.equal(snapTo(0.4, 0.25), 0.5);
  assert.equal(snapTo(0.97, 0.3), 1);
  assert.equal(snapTo(0.2, [0, 0.4, 1]), 0);
  assert.equal(snapTo(0.21, [0, 0.4, 1]), 0.4);
});

test('an object’s prototype is never a key', () => {
  const o = { v: 0 };
  const kf = JSON.parse('{"__proto__": 5, "constructor": 1, "v": 2}');
  assert.deepEqual(lanesFor(o, kf).map((l) => l.key), ['v']);
});
