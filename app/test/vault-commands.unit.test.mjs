import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, available, fullName, withRecent, ranRecent } from '../src/vault-ui/commands.js';
import { PLUGINS, featureOn } from '../src/vault-ui/plugins.js';

/** a context: every Vault default, the given options over them @param {Record<string, unknown>} [values] @param {Partial<{ write: boolean, note: boolean, admin: boolean, bin: boolean }>} [o] */
const ctx = (values = {}, { write = true, note = true, admin = false, bin = true } = {}) => {
  /** @type {string[]} */
  const ran = [];
  const act = new Proxy({}, { get: (_, k) => (...a) => ran.push([String(k), ...a].join(':')) });
  return { on: k => featureOn('vault', values, k), canWrite: () => write, note: () => (note ? /** @type {any} */ ({ id: 'n' }) : null),
    admin: () => admin, binOn: () => bin, act: /** @type {any} */ (act), ran };
};
const ids = (/** @type {any} */ c) => available(c).map(x => x.id);

test('commands: ids unique, each plugin a real one, each with a name and an icon', () => {
  assert.equal(new Set(COMMANDS.map(c => c.id)).size, COMMANDS.length);
  const keys = new Set(PLUGINS.map(p => p.key));
  for (const c of COMMANDS) {
    assert.ok(c.name && c.icon, c.id);
    if (c.plugin) assert.ok(keys.has(c.plugin), `${c.id}: ${c.plugin}`);
  }
});

test('commands: none of a Core plugin that is off', () => {
  for (const p of PLUGINS.filter(x => x.group === 'core')) {
    const list = available(/** @type {any} */ (ctx({ [p.key]: false })));
    assert.equal(list.some(c => c.plugin === p.key), false, p.key);
  }
  assert.ok(ids(ctx()).includes('daily:today'));
  assert.equal(ids(ctx({ pDaily: false })).includes('daily:today'), false);
  assert.equal(ids(ctx({ pPalette: false })).includes('switcher:open'), true);
});

test('commands: the Notes extras only when on (Haiku for admins, the bin with its option)', () => {
  const off = ids(ctx());
  assert.equal(off.some(id => id.startsWith('extra:')), false);
  const on = { xNoteList: true, xHaiku: true, xMore: true, xSelect: true };
  assert.deepEqual(ids(ctx(on, { admin: true })).filter(id => id.startsWith('extra:')), ['extra:list', 'extra:haiku', 'extra:bin', 'extra:select']);
  assert.equal(ids(ctx(on, { admin: false })).includes('extra:haiku'), false);
  assert.equal(ids(ctx(on, { bin: false })).includes('extra:bin'), false);
});

test('commands: a viewer gets no writing ones; no note open, none for a note', () => {
  const viewer = ids(ctx({}, { write: false }));
  for (const id of ['file:new', 'daily:today', 'note:rename', 'note:move', 'note:delete']) assert.equal(viewer.includes(id), false, id);
  assert.ok(viewer.includes('note:copy-path'));
  const none = ids(ctx({}, { note: false }));
  for (const id of ['note:rename', 'editor:reading', 'bookmarks:add', 'files:reveal']) assert.equal(none.includes(id), false, id);
});

test('commands: run calls the shell\'s action; names grouped; recent ones first', () => {
  const c = ctx();
  COMMANDS.find(x => x.id === 'daily:prev')?.run(/** @type {any} */ (c));
  COMMANDS.find(x => x.id === 'outline:show')?.run(/** @type {any} */ (c));
  assert.deepEqual(c.ran, ['daily:-1', 'right:outline']);
  assert.equal(fullName(/** @type {any} */ (COMMANDS.find(x => x.id === 'daily:today'))), 'Daily notes: Open today’s daily note');
  assert.equal(fullName(/** @type {any} */ (COMMANDS.find(x => x.id === 'file:new'))), 'Create new note');
  const list = available(/** @type {any} */ (c));
  const ordered = withRecent(list, ['outline:show', 'gone', 'tab:new']);
  assert.deepEqual(ordered.slice(0, 2).map(x => x.id), ['outline:show', 'tab:new']);
  assert.equal(ordered.length, list.length);
  assert.deepEqual(ranRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.equal(ranRecent(Array.from({ length: 10 }, (_, i) => `c${i}`), 'new').length, 10);
});
