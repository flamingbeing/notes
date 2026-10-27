// The tools end to end over an in-memory Firestore that enforces the notes rules' field checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineTools, callTool, READ_ONLY } from '../lib/tools.mjs';
import { makeNotesSource } from '../lib/source.mjs';
import { makeFake } from './fake-firestore.mjs';

const UID = 'u1', SHARED = 's-abcdefgh12', AT = 1760000000000;
const note = (extra = {}) => ({ title: 'T', path: '', body: '', links: [], tags: [], aliases: [], updatedAt: 1, serverAt: 'X', ...extra });

function setup(over = {}) {
  const fake = makeFake({
    spaces: [{ id: SHARED, name: 'Team', members: { [UID]: 'edit', other: 'owner' }, memberIds: [UID, 'other'] },
      { id: 's-viewonly01', name: 'Reading', members: { [UID]: 'view' }, memberIds: [UID] }],
    docs: {
      [`spaces/${UID}/notes/n1`]: note({ title: 'Ward round', path: 'work', body: 'Check the list #todo', tags: ['todo'], updatedAt: 2000 }),
      [`spaces/${UID}/notes/n2`]: note({ title: 'Ideas', body: 'Kayak', updatedAt: 1000 }),
      [`spaces/${SHARED}/notes/t1`]: note({ title: 'Team plan', body: 'Shared text' }),
      ...over,
    },
  });
  const src = makeNotesSource({ firestore: fake, uid: UID });
  const tools = Object.fromEntries(defineTools(async () => src, { now: () => AT }).map(t => [t.name, t]));
  const run = async (name, args = {}) => { const r = await callTool(tools[name], args); return { err: !!r.isError, text: r.content[0].text }; };
  return { fake, src, tools, run };
}

test('the tools, and which are read-only', () => {
  const { tools } = setup();
  assert.deepEqual(Object.keys(tools), ['list_spaces', 'list_notes', 'search_notes', 'read_note', 'create_note', 'append_to_note', 'update_note', 'delete_note']);
  assert.deepEqual(Object.values(tools).filter(t => t.annotations === READ_ONLY).map(t => t.name), ['list_spaces', 'list_notes', 'search_notes', 'read_note']);
  assert.equal(tools.delete_note.annotations.destructiveHint, true);
  assert.equal(tools.create_note.annotations.destructiveHint, false);
});

test('reading: spaces, list, search, read (own notes by default, a shared space by name)', async () => {
  const { run } = setup();
  assert.match((await run('list_spaces')).text, /My notes \(your own notes, the default\)\n- Team \(id s-abcdefgh12, edit\)\n- Reading \(id s-viewonly01, view\)/);
  assert.match((await run('list_notes')).text, /2 notes in My notes[\s\S]*work\/Ward round \(id n1[\s\S]*Ideas \(id n2/);
  assert.match((await run('list_notes', { space: 'team' })).text, /Team plan \(id t1/);
  assert.match((await run('list_notes', { folder: 'work' })).text, /1 notes in My notes/);
  assert.match((await run('search_notes', { text: 'kayak' })).text, /Ideas[\s\S]*Kayak/);
  assert.match((await run('read_note', { note: 'ward round' })).text, /^# Ward round\nid n1 · folder work[\s\S]*Check the list #todo/);
  const bad = await run('read_note', { note: 'nope' });
  assert.ok(bad.err); assert.match(bad.text, /No note with id or title "nope"/);
  assert.match((await run('list_notes', { space: 'Elsewhere' })).text, /No space "Elsewhere"/);
});

test('create: a new note in the vault or a shared space; the stored record passes the rules; it never replaces', async () => {
  const { run, fake } = setup();
  const r = await run('create_note', { title: 'Fresh', body: 'Hello [[Ideas]] #new', folder: 'inbox' });
  assert.match(r.text, /^Created "Fresh" in My notes \(id [0-9a-f]{32}\)\.$/);
  const id = r.text.match(/id (\w+)/)[1];
  const saved = fake.store.get(`spaces/${UID}/notes/${id}`).data;
  assert.deepEqual([saved.path, saved.links, saved.tags, saved.updatedAt, saved.serverAt], ['inbox', ['ideas'], ['new'], AT, 'REQUEST_TIME']);
  assert.match((await run('create_note', { title: 'In team', space: 'Team' })).text, /in Team/);
  assert.match((await run('read_note', { note: 'Fresh' })).text, /Hello/);
  const ro = await run('create_note', { title: 'No', space: 'Reading' });
  assert.ok(ro.err); assert.match(ro.text, /only read "Reading"/);
});

test('append: text on a new line at the end; a clash with another device is retried once', async () => {
  const { run, fake, src } = setup();
  assert.match((await run('append_to_note', { note: 'Ideas', text: 'Second thought #later' })).text, /^Added to "Ideas"/);
  const stored = fake.store.get(`spaces/${UID}/notes/n2`).data;
  assert.equal(stored.body, 'Kayak\nSecond thought #later');
  assert.deepEqual(stored.tags, ['later']);
  // someone saves the note between our read and our write: the first write is refused, the retry reads again
  const orig = src.replace; let raced = false;
  src.replace = async (...a) => { if (!raced) { raced = true; fake.store.get(`spaces/${UID}/notes/n2`).version++; } return orig(...a); };
  assert.match((await run('append_to_note', { note: 'Ideas', text: 'Third' })).text, /^Added to/);
  assert.equal(fake.store.get(`spaces/${UID}/notes/n2`).data.body, 'Kayak\nSecond thought #later\nThird');
});

test('update: a preview first; confirm overwrites; a note changed since is refused', async () => {
  const { run, fake, src } = setup();
  const args = { note: 'n2', body: 'New text', title: 'Ideas 2' };
  const preview = await run('update_note', args);
  assert.match(preview.text, /Would overwrite "Ideas" in My notes \(id n2\):\ntitle: "Ideas" -> "Ideas 2"\ntext: 5 -> 8 characters[\s\S]*confirm: true/);
  assert.equal(fake.store.get(`spaces/${UID}/notes/n2`).data.body, 'Kayak', 'nothing saved by the preview');
  const v = /version: "?(\w+)/.exec(preview.text)[1];
  assert.match((await run('update_note', { ...args, confirm: true })).text, /Preview the overwrite first/, 'no version, no change');
  assert.match((await run('update_note', { ...args, confirm: true, version: 'v99' })).text, /changed since the preview/);
  assert.match((await run('update_note', { ...args, confirm: true, version: v })).text, /^Overwrote "Ideas"/);
  const saved = fake.store.get(`spaces/${UID}/notes/n2`).data;
  assert.deepEqual([saved.title, saved.body, saved.aliases], ['Ideas 2', 'New text', ['Ideas']]);
  assert.ok((await run('update_note', { note: 'n2' })).err, 'nothing to change');
  const orig = src.replace;
  src.replace = async (...a) => { fake.store.get(`spaces/${UID}/notes/n2`).version++; return orig(...a); };
  const clash = await run('update_note', { note: 'n2', body: 'Again', confirm: true, version: `v${fake.store.get(`spaces/${UID}/notes/n2`).version}` });
  assert.ok(clash.err); assert.match(clash.text, /changed since you read it/);
});

test('delete: a preview first; confirm removes the note and writes the bin entry in one commit', async () => {
  const { run, fake } = setup();
  assert.match((await run('delete_note', { note: 'Ward round' })).text, /Would delete "Ward round" in My notes \(id n1, 20 characters\); it would go to the bin\.[\s\S]*confirm: true/);
  assert.ok(fake.store.has(`spaces/${UID}/notes/n1`));
  assert.match((await run('delete_note', { note: 'Ward round', confirm: true })).text, /Preview the delete first/);
  assert.match((await run('delete_note', { note: 'Ward round', confirm: true, version: 'v1' })).text, /^Deleted "Ward round".*in the bin\.$/);
  assert.ok(!fake.store.has(`spaces/${UID}/notes/n1`));
  const bin = fake.store.get(`spaces/${UID}/bin/notes:n1`).data;
  assert.deepEqual([bin.id, bin.kind, bin.deletedAt, bin.data.id, bin.data.title, bin.data.body], ['notes:n1', 'notes', AT, 'n1', 'Ward round', 'Check the list #todo']);
  assert.ok(!('serverAt' in bin.data), 'the stamp is not copied into the bin');
  assert.equal(fake.commits.at(-1).length, 2, 'delete + bin entry together');
  assert.ok((await run('read_note', { note: 'Ward round' })).err, 'gone from reads at once (cache dropped)');
  assert.ok((await run('delete_note', { note: 'Team plan', space: 'Reading', confirm: true, version: 'v1' })).err);
});

test('create and rename refuse a title already used in the folder; search ignores blank text', async () => {
  const { run } = setup();
  assert.match((await run('create_note', { title: 'ideas' })).text, /already exists/);
  assert.match((await run('create_note', { title: 'Ward round' })).text, /^Created/);
  assert.match((await run('update_note', { note: 'n2', title: 'Ward round' })).text, /already exists/);
  assert.match((await run('search_notes', { text: 'Kayak' })).text, /Ideas/);
});
