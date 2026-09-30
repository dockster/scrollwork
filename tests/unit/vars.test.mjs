import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { resolveVars, seconds, curveOf, varRef } = await load('vars');
const { Notes, readItem } = await load('spec');

// the design's tokens, as a page's :root would hold them
const tokens = {
  '--duration-slow': '600ms',
  '--duration-quick': '0.15s',
  '--duration-bare': '0.4',
  '--ease-brand': 'cubic-bezier(0.2, 0, 0, 1)',
  '--ease-named': 'expo',
  '--ease-bounce': 'linear(0, 0.063, 0.25 18.2%, 1 36.4%, 0.813, 0.75, 0.813, 1, 0.938, 1, 1)',
};
const lookup = (name) => tokens[name] ?? '';
const resolve = (raw) => {
  const notes = new Notes('test');
  return { out: resolveVars(raw, lookup, notes, 'item'), notes: notes.list };
};

test('var() is read with its name and fallback', () => {
  assert.deepEqual(varRef('var(--a)'), { name: '--a', fallback: null });
  assert.deepEqual(varRef('var( --ease-x , ease-out-bounce )'), { name: '--ease-x', fallback: 'ease-out-bounce' });
  assert.equal(varRef('600ms'), null);
  assert.equal(varRef(0.6), null);
});

test('times: ms, s and bare numbers are seconds', () => {
  assert.equal(seconds('600ms'), 0.6);
  assert.equal(seconds('0.15s'), 0.15);
  assert.equal(seconds('0.4'), 0.4);
  assert.equal(seconds('fast'), null);
  assert.equal(seconds('-1s'), null);
});

test('curves: a name, or a cubic-bezier', () => {
  assert.deepEqual(curveOf('expo'), { name: 'expo' });
  assert.deepEqual(curveOf('cubic-bezier(0.2, 0, 0, 1)'), { bezier: [0.2, 0, 0, 1] });
  assert.equal(curveOf('linear(0, 1)'), null);
  assert.equal(curveOf('wobbly'), null);
});

test('an appear takes its duration, delay and curve from tokens', () => {
  const { out, notes } = resolve({ appear: { effect: 'fade', duration: 'var(--duration-slow)', delay: 'var(--duration-quick)', ease: 'var(--ease-named)' } });
  assert.deepEqual(out.appear, { effect: 'fade', duration: 0.6, delay: 0.15, ease: 'expo' });
  assert.deepEqual(notes, []);
});

test('an interaction plays a bezier token as its custom curve', () => {
  const { out } = resolve({ interactions: [{ trigger: 'hover', animation: { curve: 'var(--ease-brand)', duration: 'var(--duration-bare)' } }] });
  assert.deepEqual(out.interactions[0].animation, { curve: 'custom', bezier: [0.2, 0, 0, 1], duration: 0.4 });
});

test('what cannot play takes the fallback: a linear() curve, a missing token', () => {
  const { out, notes } = resolve({ interactions: [{ trigger: 'click', animation: { curve: 'var(--ease-bounce, ease-out-bounce)', duration: 'var(--nope, 300ms)' } }] });
  assert.equal(out.interactions[0].animation.curve, 'ease-out-bounce');
  assert.equal(out.interactions[0].animation.duration, 0.3);
  assert.deepEqual(notes, []);
});

test('an appear cannot play a bezier: it falls back, and says so when there is none', () => {
  const withFallback = resolve({ appear: { ease: 'var(--ease-brand, out)' } });
  assert.equal(withFallback.out.appear.ease, 'out');
  const without = resolve({ appear: { ease: 'var(--ease-brand)' } });
  assert.equal(without.out.appear.ease, undefined);
  assert.match(without.notes[0], /an appear cannot play/);
});

test('an unset token with no fallback leaves the default, and says why', () => {
  const { out, notes } = resolve({ appear: { duration: 'var(--missing)' } });
  assert.equal(out.appear.duration, undefined);
  assert.match(notes[0], /--missing is not set/);
  // read on, the appear takes its default duration
  const item = readItem({ id: 'a', ...out }, new Notes('t'), 0);
  assert.equal(item.appear.duration, 0.8);
});

test('only durations and curves are read as tokens; the input is untouched', () => {
  const raw = { appear: { effect: 'var(--duration-slow)', duration: 'var(--duration-slow)' } };
  const { out } = resolve(raw);
  assert.equal(out.appear.effect, 'var(--duration-slow)');
  assert.equal(raw.appear.duration, 'var(--duration-slow)');
});
