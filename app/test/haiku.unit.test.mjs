import test from 'node:test';
import assert from 'node:assert/strict';
import { promptNotes, promptText, BUILT_IN } from '../src/haiku/prompts.js';

test('the prompts are the notes in Prompts/ (any case, folders inside it too), by title', () => {
  const notes = [
    { id: 'a', title: 'zeta', path: 'Prompts' }, { id: 'b', title: 'Alpha', path: 'prompts/work' },
    { id: 'c', title: 'Other', path: 'Notes' }, { id: 'd', title: 'Top', path: '' }, { id: 'e', title: 'Near', path: 'Promptsx' },
  ];
  assert.deepEqual(promptNotes(notes).map(n => n.id), ['b', 'a']);
});

test('a prompt’s text leaves out a first line that only repeats the title', () => {
  assert.equal(promptText({ id: 'a', title: 'Tidy', body: '# Tidy\nDo this.\nThen that.' }), 'Do this.\nThen that.');
  assert.equal(promptText({ id: 'a', title: 'Tidy', body: 'Tidy\n\nDo this.' }), 'Do this.');
  assert.equal(promptText({ id: 'a', title: 'Tidy', body: 'Do this.' }), 'Do this.');
  assert.equal(promptText({ id: 'a', title: 'Tidy', body: '' }), '');
  assert.ok(BUILT_IN.body.length > 20 && !BUILT_IN.id);
});
