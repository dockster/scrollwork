// 1.17.0's spec: a scroll flipbook (frames picked by the scroll, stepped or blended) and an element hidden at rest,
// brought in by its interactions, as the reader fills them in and refuses what it cannot play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { readItem, Notes } = await load('spec');
const read = (v) => {
  const notes = new Notes('t');
  const item = readItem({ id: 'a', ...v }, notes, 0);
  return { item, said: notes.list ? notes.list.join('\n') : String(notes.items ?? '') };
};

test('scroll flipbook: true steps, "blend" crosses', () => {
  assert.equal(read({ scroll: { flipbook: true } }).item.scroll.flipbook, true);
  assert.equal(read({ scroll: { flipbook: 'blend' } }).item.scroll.flipbook, 'blend');
});

test('scroll flipbook: false or unset is none; anything else is refused with a note', () => {
  assert.equal(read({ scroll: { flipbook: false } }).item.scroll.flipbook, undefined);
  assert.equal(read({ scroll: {} }).item.scroll.flipbook, undefined);
  const r = read({ scroll: { flipbook: 'fade' } });
  assert.equal(r.item.scroll.flipbook, undefined);
});

test('hidden: true is kept, false and unset leave it out', () => {
  assert.equal(read({ hidden: true }).item.hidden, true);
  assert.equal(read({ hidden: false }).item.hidden, undefined);
  assert.equal(read({}).item.hidden, undefined);
  assert.equal(read({ hidden: 'yes' }).item.hidden, undefined);
});
