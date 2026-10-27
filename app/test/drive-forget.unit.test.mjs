import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetDrive } from '../public/drive/forget.js';

test('forgetDrive drops the last-sync times and the ledger database, nothing else', async () => {
  const kept = new Map([['drive-last:u:s', '1'], ['drive-last:v:', '2'], ['notes:open:u', 'x']]);
  const storage = { get length() { return kept.size; }, key: i => [...kept.keys()][i] ?? null, removeItem: k => kept.delete(k) };
  const deleted = [];
  const idb = { deleteDatabase: name => { const r = {}; deleted.push(name); queueMicrotask(() => r.onsuccess()); return r; } };
  await forgetDrive({ storage, idb });
  assert.deepEqual([...kept.keys()], ['notes:open:u']);
  assert.deepEqual(deleted, ['notes-drive']);
});
