import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterNotes, formatNoteList, searchNotes, formatSearch, findNote, formatNote, words, snippet } from '../lib/notes.mjs';

const notes = [
  { id: 'a', title: 'Ward round', path: 'work', body: 'Check the list #todo\nSecond line', tags: ['todo'], aliases: ['Rounds'], updatedAt: 3000 },
  { id: 'b', title: 'Ideas', path: 'work/ideas', body: 'Kayak trip, a "quoted phrase" here', tags: [], aliases: [], updatedAt: 2000 },
  { id: 'c', title: 'Ideas', path: 'home', body: 'Garden', tags: ['garden'], updatedAt: 1000 },
  { id: 'd', title: 'Ward notes', path: '', body: 'ward', tags: [], updatedAt: 4000 },
];

test('list: newest first, a folder includes its subfolders, a tag matches with or without #', () => {
  assert.deepEqual(filterNotes(notes, {}).rows.map(n => n.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(filterNotes(notes, { folder: 'Work/' }).rows.map(n => n.id), ['a', 'b']);
  assert.deepEqual(filterNotes(notes, { tag: '#TODO' }).rows.map(n => n.id), ['a']);
  assert.deepEqual(filterNotes(notes, { folder: '' }).rows.map(n => n.id), ['d'], 'empty folder: the top level only');
  const r = filterNotes(notes, { limit: 2 });
  assert.match(formatNoteList(r, 'notes in My notes'), /4 notes in My notes, newest first:[\s\S]*2 more/);
  assert.equal(formatNoteList({ rows: [], total: 0 }, 'notes in X'), 'No notes in X.');
});

test('search: every word, any case, "quoted phrase" whole, titles first, with a snippet', () => {
  assert.deepEqual(words('Kayak "quoted phrase"'), ['kayak', 'quoted phrase']);
  const r = searchNotes(notes, 'ward');
  assert.deepEqual(r.rows.map(n => n.id), ['d', 'a'], 'both in the title; newest first');
  assert.deepEqual(searchNotes(notes, 'kayak "quoted phrase"').rows.map(n => n.id), ['b']);
  assert.deepEqual(searchNotes(notes, 'rounds').rows.map(n => n.id), ['a'], 'an alias counts');
  assert.deepEqual(searchNotes(notes, '#garden').rows.map(n => n.id), ['c'], 'a tag counts');
  assert.deepEqual(searchNotes(notes, 'nothing here').rows, []);
  assert.match(formatSearch(searchNotes(notes, 'kayak'), 'kayak'), /Ideas.*\n {2}Kayak trip/);
  assert.equal(snippet('x\ny needle z', ['needle']), 'y needle z');
});

test('find: id first, then title or alias (case, spacing and .md ignored), folder/Title, and clear errors', () => {
  assert.equal(findNote(notes, 'a').note.id, 'a');
  assert.equal(findNote(notes, 'ward   ROUND.md').note.id, 'a');
  assert.equal(findNote(notes, 'rounds').note.id, 'a');
  assert.equal(findNote(notes, 'home/ideas').note.id, 'c');
  assert.match(findNote(notes, 'ideas').error, /Several notes are called "ideas"[\s\S]*id b[\s\S]*id c/);
  assert.match(findNote(notes, 'missing').error, /No note with id or title "missing"/);
});

test('show a note', () => {
  const text = formatNote(notes[0], { space: 'Team' });
  assert.match(text, /^# Ward round\nid a · space Team · folder work · changed /);
  assert.match(text, /tags: #todo\n\nCheck the list/);
  assert.match(formatNote({ id: 'z', title: 'T', body: '' }), /\(empty\)$/);
});
