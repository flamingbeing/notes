import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, OPTION_PAGES, PLUGIN_PAGES, optionPages, pluginCards, TOOLBAR } from '../src/vault-ui/settings-map.js';
import { PLUGINS } from '../src/vault-ui/plugins.js';
import { OPTIONS } from '../src/settings/options.js';

// driveOn is changed by the Google Drive copy sheet (Files and links > Google Drive copy), not by a row of its own
const ELSEWHERE = new Set(['driveOn']);

test('every option has a page in the Vault layout settings', () => {
  const at = optionPages();
  const ids = new Set(PAGES.map(p => p.id));
  for (const key of Object.keys(OPTIONS)) {
    if (ELSEWHERE.has(key)) continue;
    assert.ok(at[key], `${key} has a page`);
    assert.ok(ids.has(at[key]), `${key}: page ${at[key]} exists`);
  }
  for (const page of PAGES) for (const r of page.rows) if ('key' in r) assert.ok(OPTIONS[r.key], `${page.id}: ${r.key} is an option`);
});

test('the root: the option pages in order, then a page per plugin with options', () => {
  assert.deepEqual(OPTION_PAGES.map(p => p.title), ['General', 'Appearance', 'Editor', 'Files and links', 'Mobile toolbar', 'Account and spaces', 'Core plugins', 'About']);
  assert.deepEqual(OPTION_PAGES.map(p => p.icon), ['circleUserRound', 'palette', 'pencilLine', 'folderCog', 'tabletSmartphone', 'users', 'toyBrick', 'info']);
  for (const p of PLUGIN_PAGES) assert.ok(PLUGINS.some(x => x.key === p.plugin && x.gear === p.id), `${p.id} is ${p.plugin}'s gear page`);
  assert.equal(new Set(PAGES.map(p => p.id)).size, PAGES.length, 'no page id twice');
});

test('every Notes extra has a toggle, and a page when it has options', () => {
  const at = optionPages();
  for (const p of PLUGINS) {
    assert.equal(at[p.key], 'plugins', `${p.key} is switched on the Core plugins page`);
    assert.equal(typeof OPTIONS[p.key].default, 'boolean', `${p.key} is a switch`);
    if (p.gear) assert.ok(PLUGIN_PAGES.some(pg => pg.id === p.gear && pg.plugin === p.key), `${p.key}: its page`);
  }
  for (const k of ['xTabBar', 'xNoteList', 'xMore', 'xAdvanced', 'xHaiku']) assert.ok(PLUGINS.find(p => p.key === k)?.gear, `${k} has options`);
});

test('Core plugins rows are alphabetical in each card', () => {
  const cards = pluginCards();
  assert.deepEqual(cards.map(c => c.group), ['core', 'extra']);
  for (const { rows } of cards) {
    const names = rows.map(r => r.label);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  }
  assert.equal(cards.reduce((n, c) => n + c.rows.length, 0), PLUGINS.length);
});

test('the mobile toolbar list: distinct commands, each with an icon and a label', () => {
  assert.equal(new Set(TOOLBAR.map(t => t.id)).size, TOOLBAR.length);
  for (const t of TOOLBAR) assert.ok(t.icon && t.label);
});
