import { test } from 'node:test';
import assert from 'node:assert/strict';
import { history, tabs, MAX_TABS } from '../src/vault-ui/nav.js';

test('history: steps pushed, Back and Forward, a new step drops the ones ahead', () => {
  const h = history();
  assert.equal(h.canBack(), false); assert.equal(h.canFwd(), false);
  h.visit('a', 1, true);
  assert.equal(h.canBack(), false); assert.equal(h.canFwd(), false);
  h.visit('b', 2, true);
  h.visit('c', 3, true);
  assert.equal(h.canBack(), true); assert.equal(h.canFwd(), false);
  assert.equal(h.peek(-1), 'b');
  h.visit('b', 2, false);   // Back
  assert.equal(h.canBack(), true); assert.equal(h.canFwd(), true);
  assert.equal(h.peek(1), 'c');
  h.visit('a', 1, false);   // Back
  assert.equal(h.canBack(), false); assert.equal(h.canFwd(), true);
  h.visit('b', 2, false);   // Forward
  h.visit('d', 3, true);    // a new note: c is gone
  assert.deepEqual(h.ids, ['a', 'b', 'd']);
  assert.equal(h.canFwd(), false);
  h.clear();
  assert.equal(h.canBack(), false); assert.equal(h.at, -1);
});

test('history: a step seen first by Back or Forward (after a reload) still counts', () => {
  const h = history();
  h.visit('x', 3, false);
  assert.equal(h.canBack(), true);
  assert.deepEqual(h.ids, ['', '', 'x']);
  h.visit('y', 'nonsense', true);
  assert.deepEqual(h.ids, ['y']);
});

test('tabs: one empty tab to start; open, new, activate, close', () => {
  const t = tabs();
  assert.deepEqual(t.list, ['']);
  assert.equal(t.current(), '');
  t.show('a');
  assert.deepEqual(t.list, ['a']);
  assert.equal(t.newTab(), 1);
  assert.deepEqual(t.list, ['a', '']);
  t.show('b');
  assert.equal(t.open('a'), 0, 'an open note: its own tab');
  assert.equal(t.open('c'), 1, 'a new one goes next to the tab showing');
  assert.deepEqual(t.list, ['a', 'c', 'b']);
  assert.equal(t.activate(2), 2);
  assert.equal(t.activate(9), 2, 'no such tab');
  assert.equal(t.close(), 'c', 'closing the last tab shows the one before');
  assert.equal(t.active, 1);
  assert.equal(t.close(0), 'c');
  assert.equal(t.active, 0);
  assert.equal(t.close(), '');
  assert.deepEqual(t.list, [''], 'the last tab closed: the empty page');
  t.show('z'); t.newTab('y'); t.forget('z');
  assert.deepEqual(t.list, ['', 'y']);
});

test('tabs: at most 12, the oldest other one goes; a stored list is cleaned', () => {
  const t = tabs({ tabs: ['a'], active: 0 });
  for (let i = 0; i < 20; i++) t.newTab(`n${i}`);
  assert.equal(t.list.length, MAX_TABS);
  assert.equal(t.current(), 'n19');
  assert.equal(t.list.at(-1), 'n19');
  const u = tabs({ tabs: /** @type {any} */ (['a', 3, 'b']), active: 7 });
  assert.deepEqual(u.list, ['a', 'b']);
  assert.equal(u.active, 1);
});

test('tabs: closing from the tabs sheet (another tab, the one showing, all)', () => {
  const t = tabs({ tabs: ['a', 'b', 'c', 'd'], active: 2 });
  assert.equal(t.close(0), 'c', 'a tab before the one showing: the same note still shows');
  assert.deepEqual(t.list, ['b', 'c', 'd']);
  assert.equal(t.active, 1);
  assert.equal(t.close(2), 'c', 'a tab after it: the same note still shows');
  assert.equal(t.active, 1);
  assert.equal(t.close(1), 'b', 'the one showing, the last: the one before shows');
  assert.equal(t.close(7), 'b', 'no such tab: nothing changes');
  assert.deepEqual(t.list, ['b']);
  t.newTab('e');
  assert.equal(t.closeAll(), '');
  assert.deepEqual(t.list, ['']);
  assert.equal(t.active, 0);
});
