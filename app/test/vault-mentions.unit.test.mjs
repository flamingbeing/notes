import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkedMentions, unlinkedMentions, filterGroups, sortGroups } from '../src/vault-ui/mentions-data.js';

/** @param {string} id @param {string} title @param {string} body @param {Record<string, unknown>} [more] */
const note = (id, title, body, more = {}) => ({ id, title, body, path: '', aliases: [], links: [], updatedAt: 0, ...more });
const target = note('g', 'Garden plan', 'Beds and [[Garden plan#Tasks]] here (a link to itself).', { path: 'Projects', aliases: ['Beds'] });

test('linked mentions: one group per linking note with its count and lines; the note itself left out', () => {
  const notes = [
    target,
    note('w', 'Welcome', 'Start here.\nSee [[Garden plan]] and [[Reading list]].\n- again [[garden plan]]', { updatedAt: 5 }),
    note('d', 'Daily', 'Water first.\n\nThen [[Garden plan|the garden]] and [[Garden plan]] on one line.', { updatedAt: 9 }),
    note('r', 'Reading list', 'Nothing about it.'),
  ];
  const { count, groups } = linkedMentions(notes, target);
  assert.equal(count, 4);
  assert.deepEqual(groups.map(g => [g.note.title, g.count]), [['Daily', 2], ['Welcome', 2]]);
  const daily = groups[0];
  assert.equal(daily.snippets.length, 1);   // (two links on one line: one snippet)
  const s = daily.snippets[0];
  assert.equal(s.line, 2);
  assert.equal(s.text, 'Then [[Garden plan|the garden]] and [[Garden plan]] on one line.');
  assert.deepEqual(s.ranges.map(([a, b]) => s.text.slice(a, b)), ['[[Garden plan|the garden]]', '[[Garden plan]]']);
  assert.deepEqual(s.before, ['Water first.', '']);
  assert.deepEqual(s.after, []);
  const welcome = groups[1];
  assert.deepEqual(welcome.snippets.map(x => x.line), [1, 2]);
  assert.deepEqual(welcome.snippets[1].ranges.map(([a, b]) => welcome.snippets[1].text.slice(a, b)), ['[[garden plan]]']);
});

test('linked mentions: by alias, by folder and title, with a heading; not inside code; sorted as asked', () => {
  const notes = [
    target,
    note('a', 'Alpha', 'By its alias: [[Beds]].', { updatedAt: 1 }),
    note('b', 'Beta', 'By folder: [[Projects/Garden plan]] and to a heading [[Garden plan#Tasks|tasks]].', { updatedAt: 3 }),
    note('c', 'Gamma', 'Only in code: `[[Garden plan]]`\n```\n[[Garden plan]]\n```', { updatedAt: 2 }),
    note('x', 'Deleted', '[[Garden plan]]', { _deleted: true }),
  ];
  const { count, groups } = linkedMentions(notes, target);
  assert.equal(count, 3);
  assert.deepEqual(groups.map(g => g.note.title), ['Alpha', 'Beta']);
  assert.deepEqual(linkedMentions(notes, target, { sort: 'name-desc' }).groups.map(g => g.note.title), ['Beta', 'Alpha']);
  assert.deepEqual(linkedMentions(notes, target, { sort: 'mtime-desc' }).groups.map(g => g.note.title), ['Beta', 'Alpha']);
  assert.deepEqual(linkedMentions(notes, target, { sort: 'mtime-asc' }).groups.map(g => g.note.title), ['Alpha', 'Beta']);
});

test('linked mentions: a note with the same title elsewhere is not this one', () => {
  const other = note('o', 'Garden plan', 'Another one', { path: 'Archive/Old' });
  const notes = [target, other, note('a', 'Alpha', 'See [[Garden plan]] and [[Archive/Old/Garden plan]].')];
  assert.equal(linkedMentions(notes, target).count, 1);
  const theirs = linkedMentions(notes, other);
  assert.equal(theirs.count, 1);
  assert.deepEqual(theirs.groups[0].snippets[0].ranges.map(([a, b]) => theirs.groups[0].snippets[0].text.slice(a, b)), ['[[Archive/Old/Garden plan]]']);
});

test('unlinked mentions: the title or an alias as a word, any case, outside links and code', () => {
  const notes = [
    target,
    note('a', 'Alpha', 'The garden plan is ready.\nA [[Garden plan]] link is not one.\nGarden planner is another word.'),
    note('b', 'Beta', 'beds first, then `Garden plan` in code.'),
    note('c', 'Gamma', 'Nothing here.'),
  ];
  const { count, groups } = unlinkedMentions(notes, target);
  assert.equal(count, 2);
  assert.deepEqual(groups.map(g => [g.note.title, g.count]), [['Alpha', 1], ['Beta', 1]]);
  const a = groups[0].snippets[0];
  assert.equal(a.line, 0);
  assert.deepEqual(a.ranges.map(([x, y]) => a.text.slice(x, y)), ['garden plan']);
  assert.deepEqual(groups[1].snippets[0].ranges.map(([x, y]) => groups[1].snippets[0].text.slice(x, y)), ['beds']);
  assert.equal(unlinkedMentions([target], target).count, 0);
});

test('filter: by the note title or a snippet; sortGroups keeps the input alone', () => {
  const notes = [
    target,
    note('w', 'Welcome', 'See [[Garden plan]].\nAnd basil near [[Garden plan]].'),
    note('d', 'Daily', 'Then [[Garden plan]].'),
  ];
  const { groups } = linkedMentions(notes, target);
  assert.deepEqual(filterGroups(groups, 'dai').map(g => g.note.title), ['Daily']);
  const basil = filterGroups(groups, 'BASIL');
  assert.deepEqual(basil.map(g => [g.note.title, g.count, g.snippets.length]), [['Welcome', 1, 1]]);
  assert.equal(filterGroups(groups, '  ').length, 2);
  const before = groups.map(g => g.note.title);
  sortGroups(groups, 'name-desc');
  assert.deepEqual(groups.map(g => g.note.title), before);
});
