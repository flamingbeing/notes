// The settings a backup restore may apply (app/src/transfer/backup-settings.js): never over a choice the person made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsToAdd } from '../src/transfer/backup-settings.js';

test('settings: only options still at their default are restored, never one the person changed', () => {
  const options = { itemCount: { default: false }, bigRows: { default: false }, dailyFolder: { default: '' } };
  const file = { kind: 'core-settings', version: 1, settings: { itemCount: true, bigRows: true, dailyFolder: 'Daily', unknown: 1 } };
  const current = { itemCount: false, bigRows: true, dailyFolder: '' };
  assert.deepEqual(settingsToAdd(file, k => current[k], options), { kind: 'core-settings', version: 1, settings: { itemCount: true, dailyFolder: 'Daily' } });
  assert.equal(settingsToAdd(file, k => ({ itemCount: true, bigRows: true, dailyFolder: 'x' })[k], options), null);
  assert.equal(settingsToAdd(null, () => 0, options), null);
});
