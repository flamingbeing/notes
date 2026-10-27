import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binLabel, daysLeft, isExpired, noteOf, sortBin, BIN_DAYS } from '../src/bin/bin.js';

const DAY = 864e5, now = Date.UTC(2026, 9, 27);
const entry = (id, days, extra = {}) => ({ id: `notes:${id}`, kind: 'notes', deletedAt: now - days * DAY, data: { id, title: id, body: 'x', updatedAt: 5, serverAt: 6 }, ...extra });

test('30 days: days left and expiry', () => {
  assert.equal(daysLeft(now, now), BIN_DAYS);
  assert.equal(daysLeft(now - 29.5 * DAY, now), 1);
  assert.equal(isExpired(entry('a', 29), now), false);
  assert.equal(isExpired(entry('a', 31), now), true);
  assert.equal(isExpired({}, now), false);
});
test('label', () => {
  assert.equal(binLabel(entry('a', 0), now), 'deleted today · 30 days left');
  assert.equal(binLabel(entry('a', 29), now), 'deleted 29 days ago · 1 day left');
});
test('noteOf drops stamps, refuses other kinds and broken data', () => {
  assert.deepEqual(noteOf(entry('a', 1), 'notes'), { id: 'a', title: 'a', body: 'x' });
  assert.equal(noteOf(entry('a', 1), 'files'), null);
  assert.equal(noteOf({ kind: 'notes', data: { title: 't' } }, 'notes'), null);
  assert.equal(noteOf(null, 'notes'), null);
});
test('sortBin: newest first, files hidden, expired to purge', () => {
  const r = sortBin([entry('old', 5), entry('new', 1), entry('gone', 40), entry('f', 2, { kind: 'files' })], 'notes', now);
  assert.deepEqual(r.show.map(e => e.data.id), ['new', 'old']);
  assert.deepEqual(r.purge.map(e => e.data.id), ['gone']);
});

test('an entry with no date, or one in the future, is never purged', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(isExpired({}, now), false);
  assert.equal(isExpired({ deletedAt: 0 }, now), false);
  assert.equal(isExpired({ deletedAt: now + 1e9 }, now), false);
  assert.equal(isExpired({ deletedAt: now - 31 * 864e5 }, now), true);
});
