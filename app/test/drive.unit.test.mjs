// @core/drive: the block in a file (kept text around it, merges), the file names, one sync run against a fake Drive, the
// permission token. The live Drive is checked by hand after a change (STATUS.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge3 } from '../src/notes/merge3.js';
import { planFile, wrapBlock, extractBlock, replaceBlock, fingerprint, notePaths, runSync, driveRemote, driveToken, memoryStore } from '../public/drive/index.js';
import { fakeDrive } from './fake-drive.mjs';

const fp = fingerprint;

test('block: wrap, extract and replace keep the person’s text around it', () => {
  const file = `my intro\n\n${wrapBlock('one\ntwo', fp('one\ntwo'))}\n\nmy outro\n`;
  const b = extractBlock(file);
  assert.equal(b.inner, 'one\ntwo');
  assert.equal(b.fp, fp('one\ntwo'));
  const next = replaceBlock(file, wrapBlock('three'));
  assert.ok(next.startsWith('my intro\n\n') && next.endsWith('\n\nmy outro\n'));
  assert.equal(extractBlock(next).inner, 'three');
  assert.equal(replaceBlock('', wrapBlock('x')), wrapBlock('x') + '\n');
  assert.equal(replaceBlock('just words', wrapBlock('x')), `just words\n\n${wrapBlock('x')}\n`);
  // an end mark deleted: the block runs to the end, so what follows is never dropped
  assert.equal(extractBlock('<!-- notes:start -->\nbody\nmore').inner, 'body\nmore');
  assert.equal(extractBlock('no block here'), null);
  // CRLF files keep their line endings
  assert.ok(replaceBlock(`a\r\n${wrapBlock('x')}\r\n`, wrapBlock('y')).includes('\r\n'));
});

test('planFile: new file, same text, untouched block, edits around and inside it', () => {
  const mine = 'line 1\nline 2';
  assert.deepEqual(planFile({ inner: mine, merge: merge3 }), { text: wrapBlock(mine, fp(mine)) + '\n', write: true, conflicts: 0, merged: false });
  const written = wrapBlock(mine, fp(mine)) + '\n';
  assert.equal(planFile({ remoteText: written, inner: mine, merge: merge3 }).write, false);

  // the app's text changed, the block untouched in Drive: replaced; the person's words around it stay
  const around = `before\n\n${written}\nafter\n`;
  const p = planFile({ remoteText: around, inner: 'line 1\nline 2\nline 3', merge: merge3 });
  assert.ok(p.write && p.text.startsWith('before\n\n') && p.text.endsWith('\nafter\n') && p.text.includes('line 3'));

  // edited inside the block in Drive and in the app, on different lines: both kept
  const edited = written.replace('line 2', 'line 2 (drive)');
  const m = planFile({ remoteText: edited, inner: 'line 0\nline 1\nline 2', last: { fp: fp(mine), base: mine }, merge: merge3 });
  assert.equal(m.conflicts, 0);
  assert.ok(m.merged && m.text.includes('line 0') && m.text.includes('line 2 (drive)'));

  // the same line edited both ways: marked, never lost
  const c = planFile({ remoteText: edited, inner: 'line 1\nline 2 (app)', last: { fp: fp(mine), base: mine }, merge: merge3 });
  assert.equal(c.conflicts, 1);
  assert.ok(c.text.includes('line 2 (app)') && c.text.includes('line 2 (drive)'));

  // no base on this device: both versions kept
  const both = planFile({ remoteText: edited, inner: 'other\ntext', merge: merge3 });
  assert.ok(both.write && both.text.includes('other\ntext') && both.text.includes('line 2 (drive)'));
  // the app's text unchanged since the block was written: the person’s edits in Drive stay as they are
  assert.equal(planFile({ remoteText: edited, inner: mine, merge: merge3 }).write, false);
});

test('notePaths: space, folders, safe names, a clash keeps a stable second name', () => {
  const paths = notePaths([
    { id: 'bbbbbbbb', title: 'Plan: a/b?', path: 'Work/2026' },
    { id: 'aaaaaaaa', title: 'Plan: a/b?', path: 'Work/2026' },
    { id: 'cccccccc', title: '', path: '' },
  ], 'Home');
  assert.equal(paths.get('aaaaaaaa'), 'Home/Work/2026/Plan ab.md');
  assert.equal(paths.get('bbbbbbbb'), 'Home/Work/2026/Plan ab (bbbbbb).md');
  assert.equal(paths.get('cccccccc'), 'Home/Untitled.md');
  assert.equal(notePaths([{ id: 'x1', title: 'A' }], '').get('x1'), 'My notes/A.md');
});

const setup = () => {
  const drive = fakeDrive();
  const remote = driveRemote({ token: async () => 'good', fetch: drive.fetch });
  const store = memoryStore();
  const run = (notes, extra = {}) => runSync({ notes, space: 'Home', scope: 'u1:s1', remote, store, merge: merge3, ...extra });
  return { drive, remote, store, run };
};
const note = (id, title, body, path = '') => ({ id, title, body, path });

test('runSync: writes new notes, then only the ones that changed', async () => {
  const { drive, run } = setup();
  const notes = [note('a1', 'First', 'hello'), note('b1', 'Second', 'world', 'Inbox')];
  let r = await run(notes);
  assert.deepEqual([r.written, r.same, r.failed.length, r.stopped], [2, 0, 0, '']);
  assert.equal(extractBlock(drive.textOf('First.md')).inner, 'hello');
  assert.equal(extractBlock(drive.textOf('Second.md')).inner, 'world');

  drive.calls.length = 0;
  r = await run(notes);
  assert.deepEqual([r.written, r.same], [0, 0]);
  assert.deepEqual(drive.calls, [], 'nothing changed: Drive is not called');

  notes[0] = note('a1', 'First', 'hello again');
  r = await run(notes);
  assert.equal(r.written, 1);
  assert.equal(extractBlock(drive.textOf('First.md')).inner, 'hello again');
  assert.equal(extractBlock(drive.textOf('Second.md')).inner, 'world');
});

test('runSync: the person’s text around the block, and their edits inside it, survive the next sync', async () => {
  const { drive, run } = setup();
  await run([note('a1', 'Doc', 'one\ntwo\nthree')]);
  drive.edit('Doc.md', `# mine\n\n${drive.textOf('Doc.md').replace('two', 'two (edited in Drive)')}\nnotes below\n`);
  const r = await run([note('a1', 'Doc', 'zero\none\ntwo\nthree')]);
  assert.deepEqual([r.written, r.merged, r.conflicts], [1, 1, 0]);
  const text = drive.textOf('Doc.md');
  assert.ok(text.startsWith('# mine\n\n') && text.endsWith('notes below\n'));
  const inner = extractBlock(text).inner;
  assert.ok(inner.includes('zero') && inner.includes('two (edited in Drive)'));
});

test('runSync: a file changed between the read and the write is read and merged again', async () => {
  const { drive, remote, store } = setup();
  await runSync({ notes: [note('a1', 'Doc', 'one')], space: 'Home', scope: 's', remote, store, merge: merge3 });
  const real = remote.write;
  let raced = false;
  const racing = { read: remote.read, write: async (...a) => { if (!raced) { raced = true; drive.edit('Doc.md', drive.textOf('Doc.md') + '\nadded elsewhere\n'); } return real(...a); } };
  const r = await runSync({ notes: [note('a1', 'Doc', 'one\ntwo')], space: 'Home', scope: 's', remote: racing, store, merge: merge3 });
  assert.equal(r.failed.length, 0);
  assert.ok(raced && drive.textOf('Doc.md').includes('added elsewhere') && drive.textOf('Doc.md').includes('two'));
});

test('runSync: a renamed note gets a new file and the old one stays; a refused token stops the run', async () => {
  const { drive, run } = setup();
  await run([note('a1', 'Old', 'text')]);
  await run([note('a1', 'New', 'text')]);
  assert.ok(drive.textOf('Old.md') && drive.textOf('New.md'));

  const expired = driveRemote({ token: async () => 'stale', fetch: drive.fetch, forget: () => { expired.forgot = true; } });
  const r = await runSync({ notes: [note('z1', 'Z', '1'), note('z2', 'Y', '2')], space: 'Home', scope: 'other', remote: expired, store: memoryStore(), merge: merge3 });
  assert.match(r.stopped, /sign-in expired/);
  assert.equal(r.written, 0);
  assert.ok(expired.forgot);
});

test('runSync: a Drive error on one note is reported and the rest go on', async () => {
  const { drive, run } = setup();
  const real = drive.fetch;
  drive.fetch = async (url, init) => (/Bad/.test(String(url)) || (init?.body instanceof FormData && /Bad/.test(await init.body.get('metadata').text())) ? new Response('{"error":{"message":"boom"}}', { status: 500 }) : real(url, init));
  const remote = driveRemote({ token: async () => 'good', fetch: drive.fetch });
  const r = await runSync({ notes: [note('a1', 'Bad', '1'), note('b1', 'Good', '2')], space: 'Home', scope: 's', remote, store: memoryStore(), merge: merge3 });
  assert.equal(r.written, 1);
  assert.deepEqual(r.failed.map(f => f.title), ['Bad']);
});

test('driveToken: asks by popup with drive.file for the same account, keeps the token under an hour', async () => {
  let asks = 0, scopes = [], clock = 0;
  class Provider { addScope(s) { scopes.push(s); } static credentialFromResult(r) { return { accessToken: r.t }; } }
  const A = { GoogleAuthProvider: Provider, reauthenticateWithPopup: async () => ({ t: 'tok' + ++asks }) };
  const t = driveToken({ A, auth: { currentUser: { uid: 'u' } }, now: () => clock });
  assert.equal(await t.get(), 'tok1');
  assert.equal(await t.get(), 'tok1');
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/drive.file']);
  clock = 56 * 60 * 1000;
  assert.equal(await t.get(), 'tok2');
  t.forget();
  assert.equal(await t.get(), 'tok3');

  const closed = driveToken({ A: { ...A, reauthenticateWithPopup: async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); } }, auth: { currentUser: {} } });
  await assert.rejects(closed.get(), /closed/);
  await assert.rejects(driveToken({ A, auth: { currentUser: null } }).get(), /Sign in first/);
});

test('block: a note that contains the marks round-trips', () => {
  const text = 'a\n<!-- notes:end -->\nb <!-- notes:start -->\nc';
  const x = extractBlock(`top\n${wrapBlock(text, fp(text))}\nbottom`);
  assert.equal(x?.inner, text);
  assert.equal(x?.after, '\nbottom');
});

test('paths: a new note with the same title does not take an existing note’s file', () => {
  const first = notePaths([{ id: 'zzz111', title: 'Todo' }], 'S');
  const kept = { zzz111: { path: first.get('zzz111') } };
  const next = notePaths([{ id: 'aaa111', title: 'Todo' }, { id: 'zzz111', title: 'Todo' }], 'S', kept);
  assert.equal(next.get('zzz111'), 'S/Todo.md');
  assert.equal(next.get('aaa111'), 'S/Todo (aaa111).md');
});
