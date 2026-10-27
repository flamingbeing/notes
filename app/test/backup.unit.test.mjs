// @core/backup: the round trips (gzip, CSV, Excel), the dry run, and a restore that only adds. Fake names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { buildBackup, packBackup, unpackBackup, backupName, backupToCsv, csvToBackup, looksLikeCsv, backupToXlsx, xlsxToBackup, planRestore, describePlan, restore } from '../public/backup/index.js';

// the page's import map names xlsx; here the same name points at the vendored file
register('data:text/javascript,' + encodeURIComponent(`export const resolve = (s, c, next) => s === 'xlsx' ? { url: ${JSON.stringify(new URL('../public/vendor/xlsx/0.20.3/xlsx.mjs', import.meta.url).href)}, shortCircuit: true } : next(s, c);`));

const now = new Date('2026-10-27T10:00:00Z');
const notes = [
  { id: 'a1', path: 'Ideas', title: 'Garden plan', body: 'Plant =beans, "peas"; and\nnew lines\r\nhere #garden', aliases: ['Plot'], updatedAt: 1788000000000, links: ['x'], tags: ['garden'], serverAt: 5, _edits: {} },
  { id: 'b2', path: '', title: '=SUM(1,1)', body: 'café ☕ 日本語', daily: '2026-10-27' },
];
const files = [{ id: 'f1', name: 'sprout.png', path: 'Ideas/img', size: 99, type: 'image/png', state: 'stored', thumb: true }];
const settings = { kind: 'core-settings', version: 1, settings: { itemCount: true } };
const backup = buildBackup({ notes, files, settings, space: { id: 'u1', name: '' }, now });

test('buildBackup keeps what a note is made from and leaves out what is worked out or internal', () => {
  assert.equal(backup.exportedAt, '2026-10-27T10:00:00.000Z');
  assert.deepEqual(backup.notes[0], { id: 'a1', path: 'Ideas', title: 'Garden plan', body: notes[0].body, aliases: ['Plot'], updatedAt: 1788000000000 });
  assert.deepEqual(backup.files, [{ id: 'f1', name: 'sprout.png', path: 'Ideas/img', size: 99, type: 'image/png' }]);
  assert.equal(buildBackup({ notes: [{ id: 'c', title: 't', body: '', updatedAt: { seconds: 1 } }] }).notes[0].updatedAt, undefined);
});

test('gzip: round trip, plain JSON read too, and a wrong file says so', async () => {
  const bytes = await packBackup(backup);
  assert.deepEqual([bytes[0], bytes[1]], [0x1f, 0x8b]);
  assert.deepEqual(await unpackBackup(bytes), { ...backup, skipped: 0 });
  assert.equal((await unpackBackup(new TextEncoder().encode(JSON.stringify(backup)))).notes.length, 2);
  await assert.rejects(unpackBackup(new TextEncoder().encode('{not json')), /not JSON/);
  await assert.rejects(unpackBackup(new TextEncoder().encode('{"format":"other"}')), /isn’t a backup from this app/);
  await assert.rejects(unpackBackup(new TextEncoder().encode(JSON.stringify({ ...backup, version: 2 }))), /newer version/);
  assert.equal(backupName(now), 'notes-backup-2026-10-27.json.gz');
});

test('CSV: readable columns, formula-looking cells made safe, and a lossless round trip', () => {
  const csv = backupToCsv(backup);
  assert.ok(looksLikeCsv(csv));
  assert.match(csv.split('\r\n')[0], /^﻿Kind,ID,Folder,Title,Text,Tags,Updated,Data$/);
  assert.ok(csv.includes("'=SUM(1,1)"), 'the title is shown as text');
  assert.deepEqual(csvToBackup(csv), { ...backup, skipped: 0 });
  // Excel in some countries saves with ; and without the BOM
  const semi = backupToCsv(backup).replace(/^﻿/, '').split('\r\n').map(l => l).join('\r\n');
  assert.equal(csvToBackup(semi).notes.length, 2);
});

test('CSV: rows that can’t be read are counted, a sheet that isn’t ours is null', () => {
  const csv = backupToCsv(backup).replace(/\r\n$/, '') + '\r\nnote,zz,,,,,,not json\r\ncolour,q,,,,,,{"a":1}\r\n';
  const back = csvToBackup(csv);
  assert.equal(back.skipped, 2);
  assert.equal(back.notes.length, 2);
  assert.equal(csvToBackup('Name,Value\r\na,1\r\n'), null);
});

test('Excel: round trip, and a note over the cell limit is split across Data columns and joined', async () => {
  const long = { id: 'big', title: 'Long', body: 'x'.repeat(70000) + ' end' };
  const b = buildBackup({ notes: [...notes, long], files, settings, space: null, now });
  const bytes = await backupToXlsx(b);
  assert.deepEqual([bytes[0], bytes[1]], [0x50, 0x4b]);
  const back = await xlsxToBackup(bytes);
  assert.deepEqual(back, { ...b, skipped: 0 });
  // text that is not a workbook reads as a sheet with no Kind and Data columns
  assert.equal(await xlsxToBackup(new TextEncoder().encode('not a workbook at all')), null);
});

const have = { noteIds: ['a1'], fileIds: [] };

test('dry run: what would be added, what is kept, what can’t come back', () => {
  const p = planRestore({ ...backup, skipped: 1 }, have);
  assert.deepEqual([p.add.map(n => n.id), p.present, p.filesMissing, p.settings, p.skipped], [['b2'], 1, 1, true, 1]);
  assert.equal(describePlan(p), 'Adds 1 note; 1 already here, kept as they are; 1 file listed but not in a backup (files are not restored); settings you haven’t changed are restored; 1 could not be read.');
  assert.equal(describePlan(planRestore(backup, { noteIds: ['a1', 'b2'], fileIds: ['f1'] })), 'Nothing to add; 2 already here, kept as they are; settings you haven’t changed are restored.');
});

test('dry run: settings are offered only when some would change', () => {
  assert.equal(planRestore(backup, { ...have, settingsWouldChange: () => false }).settings, false);
  assert.equal(planRestore(backup, { ...have, settingsWouldChange: s => s === settings }).settings, true);
  assert.equal(planRestore({ ...backup, settings: null }, have).settings, false);
  assert.equal(describePlan(planRestore(backup, { noteIds: ['a1', 'b2'], fileIds: ['f1'], settingsWouldChange: () => false })), 'Nothing to add; 2 already here, kept as they are.');
});

test('dry run: a repeated id counts once, and a record with no id is skipped', () => {
  const p = planRestore({ ...backup, notes: [...backup.notes, { ...backup.notes[1] }, /** @type {any} */ ({ title: 'no id' })] }, { noteIds: [], fileIds: [] });
  assert.deepEqual([p.add.length, p.skipped], [2, 2]);
});

test('restore: waits for the server’s copy, plans again from what is there then, and only adds', async () => {
  const log = [];
  let nowHave = { noteIds: ['a1'], fileIds: [] };
  const io = {
    ready: async () => { log.push('ready'); nowHave = { noteIds: ['a1', 'b2'], fileIds: [] }; return true; },   // the server's copy brought b2
    have: () => nowHave,
    saveNotes: async list => { log.push('save ' + list.map(n => n.id)); return 0; },
    applySettings: async s => { log.push('settings ' + JSON.stringify(s)); },
  };
  const r = await restore(backup, io);
  assert.deepEqual(log, ['ready', 'settings ' + JSON.stringify(settings)]);
  assert.deepEqual([r.added, r.refused, r.plan.present], [0, 0, 2]);
  // nothing here yet: both are added
  nowHave = { noteIds: [], fileIds: [] }; log.length = 0;
  const again = await restore(backup, { ...io, ready: async () => true });
  assert.deepEqual([log[0], again.added], ['save a1,b2', 2]);
});

test('restore: refused saves are counted; no signal stops before anything is written', async () => {
  const r = await restore(backup, { ready: async () => true, have: () => ({ noteIds: [], fileIds: [] }), saveNotes: async () => 1 });
  assert.deepEqual([r.added, r.refused], [1, 1]);
  let wrote = false;
  await assert.rejects(restore(backup, { ready: async () => false, have: () => ({ noteIds: [], fileIds: [] }), saveNotes: async () => { wrote = true; return 0; } }), /still loading/);
  assert.equal(wrote, false);
});
