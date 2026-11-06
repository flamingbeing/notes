import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textTerms, matchesIn, snippetsOf, searchResults, addRecent, RECENT_MAX } from '../src/vault-ui/search.js';

const notes = [
  { id: 'a', title: 'Garden plan', body: 'Beds along the fence.\nTomatoes and Basil.\n\nMore basil later; basil again', path: 'Projects', updatedAt: 30 },
  { id: 'b', title: 'Soup recipe', body: 'Onion, basil, stock.', path: 'Ideas', updatedAt: 50 },
  { id: 'c', title: 'Basil notes', body: 'nothing here', path: '', updatedAt: 10 },
  { id: 'd', title: 'Reading', body: 'A book about bees #garden/veg', path: '', updatedAt: 40 },
];
const hits = (/** @type {string[]} */ ids) => ids.map(id => ({ id }));
const parts = (/** @type {{ text: string, mark: boolean }[]} */ p) => p.map(x => (x.mark ? `[${x.text}]` : x.text)).join('');

test('textTerms: words and phrases as typed; leave-outs and path: left out; tag: as its #tag', () => {
  assert.deepEqual(textTerms('Basil "south fence" -onion path:Ideas tag:garden OR x'), [
    { text: 'south fence', phrase: true }, { text: '#garden', phrase: true }, { text: 'Basil', phrase: false }, { text: 'x', phrase: false },
  ]);
  assert.deepEqual(textTerms('-x'), [], 'a leave-out only');
});

test('matchesIn: anywhere in a word; match case', () => {
  assert.deepEqual(matchesIn('everybody hybrid', [{ text: 'yb', phrase: false }], false), [[4, 6], [11, 13]]);
  assert.deepEqual(matchesIn('Basil basil', [{ text: 'basil', phrase: false }], true), [[6, 11]]);
  assert.deepEqual(matchesIn('Basil basil', [{ text: 'basil', phrase: false }], false).length, 2);
});

test('snippetsOf: one card per line with a match, all matches counted, more context adds the lines around', () => {
  const t = [{ text: 'basil', phrase: false }];
  const s = snippetsOf(notes[0].body, t, false, false);
  assert.equal(s.count, 3);
  assert.deepEqual(s.snippets.map(parts), ['Tomatoes and [Basil].', 'More [basil] later; [basil] again']);
  const c = snippetsOf(notes[0].body, t, false, true);
  assert.equal(parts(c.snippets[0]), 'Beds along the fence.\nTomatoes and [Basil].\nMore basil later; basil again');
  assert.equal(snippetsOf(notes[0].body, t, true, false).count, 2, 'match case');
});

test('searchResults: title matches, groups with counts, match case changes the counts', () => {
  const r = searchResults({ notes, hits: hits(['a', 'b', 'c']), q: 'basil' });
  assert.deepEqual(r.titles.map(t => [t.id, parts(t.parts)]), [['c', '[Basil] notes']]);
  assert.deepEqual(r.groups.map(g => [g.id, g.count]), [['a', 3], ['b', 1]]);
  assert.equal(r.total, 3);
  const cased = searchResults({ notes, hits: hits(['a', 'b', 'c']), q: 'Basil', matchCase: true });
  assert.deepEqual(cased.groups.map(g => [g.id, g.count]), [['a', 1]]);
  assert.equal(cased.total, 2);
});

test('searchResults: a word inside other words is found though the app search missed it; near spellings dropped', () => {
  const r = searchResults({ notes, hits: hits(['b']), q: 'asi' });
  assert.deepEqual(r.groups.map(g => g.id).sort(), ['a', 'b']);
  const fuzzy = searchResults({ notes, hits: hits(['d']), q: 'basl' });
  assert.equal(fuzzy.total, 0);
});

test('searchResults: tag: marks the tag; a path: only search lists the notes', () => {
  const r = searchResults({ notes, hits: hits(['d']), q: 'tag:#garden' });
  assert.equal(r.groups[0].count, 1);
  assert.match(parts(r.groups[0].snippets[0]), /\[#garden\]\/veg/);
  const p = searchResults({ notes, hits: hits(['a']), q: 'path:Projects' });
  assert.deepEqual(p.groups.map(g => [g.id, g.count]), [['a', 0]]);
});

test('searchResults: sort orders', () => {
  const order = (/** @type {string} */ sort) => searchResults({ notes, hits: hits(['b', 'a']), q: 'basil', sort }).groups.map(g => g.id);
  assert.deepEqual(order('relevance'), ['b', 'a']);
  assert.deepEqual(order('name-asc'), ['a', 'b']);
  assert.deepEqual(order('name-desc'), ['b', 'a']);
  assert.deepEqual(order('mtime-desc'), ['b', 'a']);
  assert.deepEqual(order('mtime-asc'), ['a', 'b']);
});

test('addRecent: newest first, no repeats, capped', () => {
  let list = /** @type {string[]} */ ([]);
  for (let i = 0; i < 14; i++) list = addRecent(list, `q${i}`);
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0], 'q13');
  list = addRecent(list, 'q10');
  assert.deepEqual(list.slice(0, 2), ['q10', 'q13']);
  assert.equal(list.filter(x => x === 'q10').length, 1);
  assert.deepEqual(addRecent(list, '  '), list);
});
