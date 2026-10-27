import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewNote, buildAppend, buildUpdate, binEntry, appendedBody, describeUpdate } from '../lib/write.mjs';
import { noteRuleProblem } from './fake-firestore.mjs';

const AT = 1760000000000;
const stored = { id: 'n1', title: 'Plan', path: 'work', body: 'Line one #a', links: [], tags: ['a'], aliases: [], updatedAt: 1, serverAt: 'X', _updateTime: 'v1' };

test('a new note: links and tags worked out from the body, a clean folder, a 32-character id, within the rules', () => {
  const { id, record } = buildNewNote({ title: ' Idea ', body: 'See [[Plan]] and #fresh/tag', folder: '/work//ideas/' }, AT);
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.deepEqual(record, { title: 'Idea', path: 'work/ideas', body: 'See [[Plan]] and #fresh/tag', links: ['plan'], tags: ['fresh/tag'], aliases: [], updatedAt: AT });
  assert.equal(noteRuleProblem({ ...record, serverAt: 'X' }), '');
  assert.equal(buildNewNote({ title: 'T' }, AT).record.body, '');
});

test('refused: no title, a long or two-line title, a body over a document', () => {
  assert.throws(() => buildNewNote({ title: '   ' }, AT), /needs a title/);
  assert.throws(() => buildNewNote({ title: 'x'.repeat(301) }, AT), /longer than 300/);
  assert.throws(() => buildNewNote({ title: 'a\nb' }, AT), /one line/);
  assert.throws(() => buildNewNote({ title: 'T', body: 'x'.repeat(1024 * 1024) }, AT), /1 MiB/);
});

test('append: on a new line, the rest unchanged, tags and links recomputed, no id or version in the record', () => {
  assert.equal(appendedBody('a', 'b'), 'a\nb');
  assert.equal(appendedBody('a\n', 'b'), 'a\nb');
  assert.equal(appendedBody('', 'b'), 'b');
  const rec = buildAppend(stored, 'More [[Other]] #b', AT);
  assert.equal(rec.body, 'Line one #a\nMore [[Other]] #b');
  assert.deepEqual(rec.tags, ['a', 'b']);
  assert.deepEqual(rec.links, ['other']);
  assert.equal(rec.title, 'Plan'); assert.equal(rec.path, 'work'); assert.equal(rec.updatedAt, AT);
  for (const k of ['id', 'serverAt', '_updateTime']) assert.ok(!(k in rec), k);
  assert.equal(noteRuleProblem({ ...rec, serverAt: 'X' }), '');
});

test('update: only what is given changes; a new title keeps the old one as an alias (once); the daily date stays', () => {
  const same = buildUpdate(stored, { body: 'New text' }, AT);
  assert.equal(same.title, 'Plan'); assert.equal(same.path, 'work'); assert.deepEqual(same.aliases, []);
  const renamed = buildUpdate({ ...stored, daily: '2026-10-27' }, { title: 'Plan v2', folder: 'archive' }, AT);
  assert.deepEqual([renamed.title, renamed.path, renamed.aliases, renamed.daily, renamed.body], ['Plan v2', 'archive', ['Plan'], '2026-10-27', 'Line one #a']);
  assert.deepEqual(buildUpdate({ ...stored, title: 'Plan v2', aliases: ['Plan'] }, { title: 'Plan v3' }, AT).aliases, ['Plan', 'Plan v2']);
  assert.deepEqual(buildUpdate({ ...stored, aliases: ['Plan'] }, { title: 'Plan' }, AT).aliases, ['Plan'], 'same title: nothing added');
  assert.throws(() => buildUpdate(stored, { title: '' }, AT), /needs a title/);
});

test('the preview says exactly what changes', () => {
  assert.equal(describeUpdate(stored, buildUpdate(stored, {}, AT)), 'nothing changes');
  const text = describeUpdate(stored, buildUpdate(stored, { title: 'B', folder: '', body: 'x' }, AT));
  assert.match(text, /title: "Plan" -> "B"\nfolder: "work" -> ""\ntext: 11 -> 1 characters/);
});

test('the bin entry is the app\'s: id notes:<id>, kind, the last version in data (with its id, without the stamp), deletedAt', () => {
  assert.deepEqual(binEntry(stored, AT), {
    id: 'notes:n1', kind: 'notes', deletedAt: AT, updatedAt: AT,
    data: { id: 'n1', title: 'Plan', path: 'work', body: 'Line one #a', links: [], tags: ['a'], aliases: [], updatedAt: 1 },
  });
});
