import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, blank, vaultState, dropAll, PREFIX } from '../src/vault-ui/state.js';

const memory = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, m };
};

test('clean: unknown keys dropped, wrong types back to the defaults', () => {
  assert.deepEqual(clean(null), blank());
  assert.deepEqual(clean('x'), blank());
  const c = clean({ last: 'n1', tabs: ['a', 7, ''], active: 2, body: 'secret text', leftView: 'nope', fileSort: 'mtime-desc', matchCase: 'yes' });
  assert.equal(c.last, 'n1');
  assert.deepEqual(c.tabs, ['a', '']);
  assert.equal(c.active, 0, 'past the end: the first');
  assert.equal(/** @type {any} */ (c).body, undefined);
  assert.equal(c.leftView, 'files');
  assert.equal(c.fileSort, 'mtime-desc');
  assert.equal(c.matchCase, false);
  assert.equal(clean({ tabs: ['a', 'b'], active: 1 }).active, 1);
});

test('clean: the Search and Tags views\' choices, the Linked mentions block\'s', () => {
  const d = clean({});
  assert.deepEqual([d.searchCollapse, d.searchContext, d.tagSort, d.tagNested, d.tagShut], [false, false, 'name', true, []]);
  const c = clean({ searchCollapse: true, searchContext: 1, tagSort: 'count', tagNested: false, tagShut: ['a', 'a', 3] });
  assert.deepEqual([c.searchCollapse, c.searchContext, c.tagSort, c.tagNested, c.tagShut], [true, false, 'count', false, ['a']]);
  assert.deepEqual([d.mentionsOff, d.mentionSort, d.mentionFold, d.mentionContext], [[], 'name-asc', false, false]);
  const m = clean({ mentionsOff: ['n1', 'n1', 7, 'n2'], mentionSort: 'mtime-desc', mentionFold: true, mentionContext: 'yes' });
  assert.deepEqual([m.mentionsOff, m.mentionSort, m.mentionFold, m.mentionContext], [['n1', 'n2'], 'mtime-desc', true, false]);
  assert.equal(clean({ mentionSort: 'relevance' }).mentionSort, 'name-asc');
  assert.equal(clean({ mentionsOff: Array.from({ length: 300 }, (_, i) => `n${i}`) }).mentionsOff.length, 200);
  assert.equal(clean({ tagSort: 'size' }).tagSort, 'name');
});

test('clean: lists capped and without repeats', () => {
  const many = n => Array.from({ length: n }, (_, i) => `id${i}`);
  const c = clean({ tabs: many(30), recent: [...many(50), 'id1'], bookmarks: many(300), folders: many(250), searchRecent: many(15), cmdRecent: many(15) });
  assert.equal(c.tabs.length, 12);
  assert.equal(c.recent.length, 20);
  assert.equal(c.bookmarks.length, 200);
  assert.equal(c.folders.length, 200);
  assert.equal(c.searchRecent.length, 10);
  assert.equal(c.cmdRecent.length, 10);
  assert.deepEqual(clean({ recent: ['a', 'a', 'b'] }).recent, ['a', 'b']);
  assert.equal(clean({ last: 'x'.repeat(401) }).last, '');
});

test('per space: each space keeps its own; sign-out drops them all', () => {
  const store = memory();
  store.setItem('notes:snap', 'kept');
  const a = vaultState(store, 'u1'), b = vaultState(store, 's-team');
  a.set({ last: 'n1', tabs: ['n1'] });
  b.set({ last: 'n9' });
  assert.equal(vaultState(store, 'u1').get().last, 'n1');
  assert.equal(vaultState(store, 's-team').get().last, 'n9');
  assert.ok(store.getItem(PREFIX + 'u1'));
  store.setItem(PREFIX + 'broken', '{nope');
  assert.deepEqual(vaultState(store, 'broken').get(), blank());
  dropAll(store);
  assert.equal(vaultState(store, 'u1').get().last, '');
  assert.equal(store.getItem('notes:snap'), 'kept');
});

test('storage off: kept in memory, nothing thrown', () => {
  const off = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); }, removeItem: () => {} };
  const s = vaultState(off, 'u1');
  assert.equal(s.set({ last: 'n2' }).last, 'n2');
  assert.equal(s.get().last, 'n2');
});
