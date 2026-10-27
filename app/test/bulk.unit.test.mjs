import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTag, moveTo, mergeNotes, cleanTag } from '../src/bulk/bulk.js';

const note = (id, body, extra = {}) => ({ id, title: id, body, path: '', tags: [], ...extra });

test('cleanTag', () => { assert.equal(cleanTag(' #Work!/a b '), 'Work/ab'); assert.equal(cleanTag('###'), ''); });
test('addTag appends once and skips notes that have it', () => {
  const r = addTag([note('a', 'hi\n'), note('b', 'x #t', { tags: ['t'] })], '#t');
  assert.equal(r.length, 1);
  assert.equal(r[0].patch.body, 'hi\n\n#t\n');
  assert.deepEqual(addTag([note('a', 'x')], '  '), []);
});
test('moveTo skips notes already there and trims the slashes', () => {
  const r = moveTo([note('a', '', { path: 'In' }), note('b', '')], '/In/');
  assert.deepEqual(r.map(x => [x.note.id, x.patch.path]), [['b', 'In']]);
});
test('mergeNotes joins in order under titles, keeps the first folder, needs two', () => {
  assert.equal(mergeNotes([note('a', 'x')]), null);
  const m = mergeNotes([note('a', ' one ', { path: 'P' }), note('b', 'two')]);
  assert.equal(m.create.body, '## a\n\none\n\n## b\n\ntwo\n');
  assert.equal(m.create.path, 'P');
  assert.equal(m.create.title, 'a and 1 more');
  assert.equal(mergeNotes([note('a', 'x'), note('b', 'y')], ' Both ').create.title, 'Both');
  assert.equal(m.remove.length, 2);
});
