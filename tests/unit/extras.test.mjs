// scrollwork/extras: the parts that are arithmetic (drag's snapping and
// throw, morph's lining up, sideways' passage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { snapValue, nextSnap, restOf } = await load('xdrag');
const { lineUp, written } = await load('xmorph');
const { across } = await load('xside');

test('drag snaps to every N px, a list, or a function', () => {
  assert.equal(snapValue(130, 100), 100);
  assert.equal(snapValue(160, 100), 200);
  assert.equal(snapValue(-160, 100), -200);
  assert.equal(snapValue(70, [0, 50, 300]), 50);
  assert.equal(snapValue(70, (v) => v * 2), 140);
  assert.equal(snapValue(70, undefined), 70);
});
test('the arrow keys go to the next snap point, or a step', () => {
  assert.equal(nextSnap(100, 1, 100, 10), 200);
  assert.equal(nextSnap(100, -1, 100, 10), 0);
  assert.equal(nextSnap(50, 1, [0, 120, 300], 10), 120);
  assert.equal(nextSnap(120, -1, [0, 120, 300], 10), 0);
  assert.equal(nextSnap(300, 1, [0, 120, 300], 10), 300);
  assert.equal(nextSnap(5, 1, undefined, 10), 15);
});
test('a throw rests further the faster it is', () => {
  assert.equal(restOf(0, 0), 0);
  assert.equal(restOf(100, 1), 425);
  assert.equal(restOf(100, -2), -550);
});
test('a closed shape lines up with the other where they are nearest', () => {
  const a = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const turned = [[10, 10], [0, 10], [0, 0], [10, 0]];
  assert.deepEqual(lineUp(a, turned), a);
  const backwards = [[0, 10], [10, 10], [10, 0], [0, 0]];
  assert.deepEqual(lineUp(a, backwards), a);
});
test('points are written as a path', () => {
  assert.equal(written([[0, 0], [1.234, 5.678]], true), 'M0 0L1.23 5.68Z');
  assert.equal(written([[0, 0], [1, 1]], false), 'M0 0L1 1');
});
test('sideways passage, as scroll() measures it, across', () => {
  assert.equal(across('through', 1000, 200, 1000), 0);
  assert.equal(across('through', -200, 200, 1000), 1);
  assert.equal(across('through', 400, 200, 1000), 0.5);
  assert.equal(across('in', 400, 200, 1000), 1);
});
