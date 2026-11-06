import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzy, rank, fold } from '../src/vault-ui/fuzzy.js';

test('fuzzy: the letters in order, not side by side; out of order is no match', () => {
  assert.ok(fuzzy('gpl', 'Garden plan'));
  assert.equal(fuzzy('lpg', 'Garden plan'), null);
  assert.equal(fuzzy('xyz', 'Garden plan'), null);
  assert.equal(fuzzy('garden plans', 'Garden plan'), null);
});

test('fuzzy: case and accents ignored, spaces typed are free', () => {
  assert.ok(fuzzy('CAFE', 'Café menu'));
  assert.ok(fuzzy('café', 'Cafe menu'));
  assert.ok(fuzzy('cafe menu', 'Café menu'));
  assert.deepEqual(fold('Éa').text, 'ea');
});

test('fuzzy: ranges are where the letters are in the original, side by side ones joined', () => {
  assert.deepEqual(fuzzy('gar', 'Garden plan')?.ranges, [[0, 3]]);
  assert.deepEqual(fuzzy('gpl', 'Garden plan')?.ranges, [[0, 1], [7, 9]]);
  assert.deepEqual(fuzzy('cafe', 'Café')?.ranges, [[0, 4]]);
  // (an accent typed as its own mark goes with its letter)
  assert.deepEqual(fuzzy('e', 'Café')?.ranges, [[3, 5]]);
  assert.deepEqual(fuzzy('', 'Anything'), { score: 0, ranges: [] });
});

test('fuzzy: letters starting words are preferred over the first ones found', () => {
  assert.deepEqual(fuzzy('pl', 'Apple plan')?.ranges, [[6, 8]]);
  assert.deepEqual(fuzzy('kp', 'Kickoff plan')?.ranges, [[0, 1], [8, 9]]);
});

test('rank: side by side and word starts first; a name that starts with it before one that has it later', () => {
  const titles = ['Reading list', 'Garden plan', 'Spring garden jobs', 'Grand plan', 'Ginger and pear'];
  assert.deepEqual(rank('garden', titles, t => t).map(r => r.item), ['Garden plan', 'Spring garden jobs']);
  const gp = rank('gp', titles, t => t).map(r => r.item);
  assert.deepEqual(gp.slice(0, 2).sort(), ['Garden plan', 'Grand plan']);
  assert.equal(gp.includes('Reading list'), false);
  // (no query: all, as given)
  assert.deepEqual(rank('', titles, t => t).map(r => r.item), titles);
});
