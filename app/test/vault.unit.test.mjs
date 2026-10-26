// Vault import and export planning (app/src/notes/vault.js): what an import adds and skips, and the files an export holds.
// Fake names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, summary, exportFiles, fileNameFor, safeSegments } from '../src/notes/vault.js';

const none = { notes: [], files: [] };
const e = (path, size = 10) => ({ path, size });

test('vault: paths that could escape the vault are refused', () => {
  assert.deepEqual(safeSegments('a/./b//c.md'), ['a', 'b', 'c.md']);
  assert.deepEqual(safeSegments('a\\b.md'), ['a', 'b.md']);
  for (const bad of ['../x.md', 'a/../../x.md', '/etc/x.md', 'C:/x.md', 'c:\\x.md', '', '/', 'a\0b']) assert.equal(safeSegments(bad), null, bad);
  const plan = planImport([e('../evil.md'), e('ok.md')], none);
  assert.deepEqual(plan.skipped, [{ from: '../evil.md', why: 'unsafe path' }]);
  assert.deepEqual(plan.notes.map(n => n.title), ['ok']);
});

test('vault: notes by folder, other files kept, app folders and hidden files skipped', () => {
  const plan = planImport([e('Welcome.md'), e('Ideas/Garden plan.md'), e('Ideas/img/sprout.png', 99), e('.obsidian/app.json'), e('Ideas/.hidden'), e('.DS_Store'), e('.trash/old.md'), e('Notes.MD')], none);
  assert.deepEqual(plan.notes.map(n => [n.path, n.title]), [['', 'Welcome'], ['Ideas', 'Garden plan'], ['', 'Notes']]);
  assert.deepEqual(plan.files, [{ path: 'Ideas/img', name: 'sprout.png', size: 99, from: 'Ideas/img/sprout.png' }]);
  assert.deepEqual(plan.skipped.map(s => s.why).sort(), ['app folder', 'app folder', 'hidden file', 'hidden file']);
  assert.equal(summary(plan), '3 notes, 1 file; 4 skipped (2 app folder, 2 hidden file)');
});

test('vault: one shared top folder (a vault zipped as a folder) is dropped', () => {
  const plan = planImport([e('My vault/A.md'), e('My vault/sub/B.md'), e('My vault/pic.png')], none);
  assert.deepEqual(plan.notes.map(n => [n.path, n.title, n.from]), [['', 'A', 'My vault/A.md'], ['sub', 'B', 'My vault/sub/B.md']]);
  assert.equal(plan.files[0].path, '');
  // two top folders: kept as folders
  assert.deepEqual(planImport([e('x/A.md'), e('y/B.md')], none).notes.map(n => n.path), ['x', 'y']);
});

test('vault: nothing is overwritten: what is there is skipped, and so is a repeat inside the import', () => {
  const have = { notes: [{ title: 'Welcome', path: '' }, { title: 'Garden plan', path: 'Ideas' }], files: [{ name: 'Sprout.png', path: 'Ideas/img' }] };
  const plan = planImport([e('welcome.md'), e('Ideas/Garden plan.md'), e('Ideas/img/sprout.png'), e('New.md'), e('new.md'), e('Other/Welcome.md')], have);
  assert.deepEqual(plan.notes.map(n => (n.path ? n.path + '/' : '') + n.title), ['New', 'Other/Welcome']);
  assert.equal(plan.files.length, 0);
  assert.equal(plan.skipped.filter(s => s.why === 'already there').length, 4);
});

test('vault: size caps and the empty cases', () => {
  const plan = planImport([e('big.md', 2_000_000), e('huge.bin', 200_000_000), e('.md'), e('ok.md')], none);
  assert.deepEqual(plan.skipped.map(s => s.why).sort(), ['no name', 'too big', 'too big for a note']);
  assert.equal(plan.notes.length, 1);
  assert.equal(summary({ notes: [], files: [], skipped: [] }), '0 notes, 0 files');
  assert.equal(planImport(Array.from({ length: 5001 }, (_, i) => e(`n${i}.md`)), none).skipped[0].why, 'more than 5000 files');
});

test('vault: an export holds each note at its folder and each file with its path; no two at one path', () => {
  const out = exportFiles(
    [{ title: 'A/B: c', path: 'Ideas', body: 'x' }, { title: 'Dup', path: '', body: '1' }, { title: 'dup', path: '', body: '2' }, { title: '', path: '../up', body: '' }],
    [{ name: 'p.png', path: 'Ideas/img' }, { name: 'p.png', path: 'Ideas/img' }, { name: 'q.png' }]);
  assert.deepEqual(out.map(f => f.path), ['Ideas/A-B- c.md', 'Dup.md', 'dup (2).md', 'up/Untitled.md', 'Ideas/img/p.png', 'Ideas/img/p (2).png', 'q.png']);
  assert.equal(fileNameFor('.hidden'), 'hidden.md');
});
