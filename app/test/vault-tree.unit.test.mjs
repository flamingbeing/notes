import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, visibleRows, stillEmpty, movedPath, tagTree, foldersAbove, cleanPath } from '../src/vault-ui/tree.js';

const notes = [
  { id: 'w', title: 'Welcome', path: '', updatedAt: 50 },
  { id: 'g', title: 'Garden plan', path: 'Projects', updatedAt: 10 },
  { id: 'v', title: 'Seed list', path: 'Projects/Garden', updatedAt: 40 },
  { id: 'k', title: 'Kickoff meeting', path: 'Projects/Meetings', updatedAt: 30 },
  { id: 'a', title: 'apple', path: '', updatedAt: 20 },
  { id: 'b', title: 'Bread', path: 'Cooking/', updatedAt: 60 },
];
/** @param {import('../src/vault-ui/tree.js').TreeNode[]} rows */
const names = rows => rows.map(r => `${'  '.repeat(r.depth)}${r.kind === 'folder' ? r.name + '/' : r.name}`);

test('folders first, then files, each A to Z (case and numbers read as people do)', () => {
  const { root } = buildTree([...notes, { id: 'n10', title: 'Note 10', path: '' }, { id: 'n9', title: 'Note 9', path: '' }]);
  assert.deepEqual(names(visibleRows(root, () => false)), [
    'Cooking/', '  Bread', 'Projects/', '  Garden/', '    Seed list', '  Meetings/', '    Kickoff meeting', '  Garden plan',
    'apple', 'Note 9', 'Note 10', 'Welcome',
  ]);
});

test('each sort order; folders keep to names', () => {
  const top = (/** @type {string} */ sort) => buildTree(notes, [], sort).root.kids.map(k => k.name);
  assert.deepEqual(top('name-asc'), ['Cooking', 'Projects', 'apple', 'Welcome']);
  assert.deepEqual(top('name-desc'), ['Projects', 'Cooking', 'Welcome', 'apple']);
  assert.deepEqual(top('mtime-desc'), ['Cooking', 'Projects', 'Welcome', 'apple']);
  assert.deepEqual(top('mtime-asc'), ['Cooking', 'Projects', 'apple', 'Welcome']);
});

test('nested levels and shut folders', () => {
  const { root } = buildTree(notes);
  const rows = visibleRows(root, p => p === 'Projects/Garden');
  assert.ok(!rows.some(r => r.kind === 'note' && r.id === 'v'), 'inside a shut folder: hidden');
  assert.equal(rows.find(r => r.name === 'Garden')?.depth, 1);
  assert.equal(rows.find(r => r.name === 'Kickoff meeting')?.depth, 2);
  assert.deepEqual(names(visibleRows(root, p => p === 'Projects')).slice(0, 3), ['Cooking/', '  Bread', 'Projects/']);
});

test('folders made on this device show until a note is in them; counts', () => {
  const t = buildTree(notes, ['Inbox', 'Projects/Garden', 'Trips/Japan', '/']);
  assert.deepEqual(t.paths, ['Cooking', 'Inbox', 'Projects', 'Projects/Garden', 'Projects/Meetings', 'Trips', 'Trips/Japan']);
  assert.equal(t.files, 6);
  assert.equal(t.folders, 7);
  assert.equal(buildTree([]).folders, 0);
  assert.deepEqual(stillEmpty(['Inbox', 'Projects', 'Projects/Garden/', 'Trips/Japan'], notes), ['Inbox', 'Trips/Japan']);
});

test('paths: tidied, the folders above, a folder renamed', () => {
  assert.equal(cleanPath(' /a// b /'), 'a/b');
  assert.deepEqual(foldersAbove('a/b/c'), ['a', 'a/b', 'a/b/c']);
  assert.deepEqual(foldersAbove(''), []);
  assert.equal(movedPath('Projects/Garden', 'Projects', 'Work'), 'Work/Garden');
  assert.equal(movedPath('Projects', 'Projects', 'Work'), 'Work');
  assert.equal(movedPath('Projects2', 'Projects', 'Work'), 'Projects2', 'not a folder inside it');
});

test('tagTree: nested by "/", counts, one entry whatever the case', () => {
  const tagged = [
    { id: '1', tags: ['garden', 'garden/veg'] },
    { id: '2', tags: ['Garden/Veg'] },
    { id: '3', tags: ['garden/fruit', 'books'] },
    { id: '4', tags: ['#books', 'food/baking/bread'] },
  ];
  const t = tagTree(tagged);
  assert.deepEqual(t.map(n => [n.name, n.count]), [['books', 2], ['food', 1], ['garden', 3]]);
  const garden = /** @type {any} */ (t.find(n => n.name === 'garden'));
  assert.deepEqual(garden.kids.map((/** @type {any} */ n) => [n.full, n.count, n.depth]), [['garden/fruit', 1, 1], ['garden/veg', 2, 1]]);
  assert.equal(t.find(n => n.name === 'food')?.kids[0].kids[0].full, 'food/baking/bread');
  assert.deepEqual(tagTree(tagged, { sort: 'count' }).map(n => n.name), ['garden', 'books', 'food']);
  // flat: the tags notes have, whole
  assert.deepEqual(tagTree(tagged, { nested: false }).map(n => [n.full, n.count]),
    [['books', 2], ['food/baking/bread', 1], ['garden', 1], ['garden/fruit', 1], ['garden/veg', 2]]);
});
