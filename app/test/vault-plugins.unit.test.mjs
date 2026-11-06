import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGINS, GROUPS, featureOn } from '../src/vault-ui/plugins.js';
import { OPTIONS, TEXTS, SWITCHES } from '../src/settings/options.js';

// every feature the Classic layout has and the Vault layout leaves out by default comes back with one of these
const EXTRAS = ['xTabBar', 'xNoteList', 'xSwipeTabs', 'xSwipeBack', 'xSelect', 'xDetails', 'xLineSpacing', 'xDayButtons', 'xSyncButton', 'xHaiku', 'xMore', 'xAdvanced'];
const CORE = ['pBacklinks', 'pBookmarks', 'pPalette', 'pDaily', 'pFiles', 'pOutgoing', 'pOutline', 'pSwitcher', 'pRandom', 'pSearch', 'pTags', 'pWordCount'];

test('every Notes extra and Core plugin has a toggle: a device option with a row on the page', () => {
  const keys = PLUGINS.map(p => p.key);
  for (const k of [...EXTRAS, ...CORE]) {
    assert.ok(keys.includes(k), `${k} on the page`);
    assert.equal(OPTIONS[k]?.scope, 'device', `${k} is a device option`);
    assert.ok(SWITCHES.includes(k), `${k} is a switch`);
  }
  assert.equal(new Set(keys).size, keys.length, 'no key twice');
  for (const p of PLUGINS) {
    assert.ok(p.label && p.sub && p.icon, `${p.key} has a label, a line and an icon`);
    assert.equal(p.group, p.key.startsWith('x') ? 'extra' : 'core');
  }
  assert.ok(GROUPS.extra.sub.length > 0);
});

test('Vault defaults: its own features on (Random note off), the Classic extras off', () => {
  assert.equal(OPTIONS.pRandom.default, false); assert.equal(featureOn('vault', {}, 'pRandom'), false);
  assert.equal(featureOn('vault', { pRandom: true }, 'pRandom'), true);
  for (const k of CORE.filter(x => x !== 'pRandom')) { assert.equal(OPTIONS[k].default, true, k); assert.equal(featureOn('vault', {}, k), true, k); }
  for (const k of EXTRAS) { assert.equal(OPTIONS[k].default, false, k); assert.equal(featureOn('vault', {}, k), false, k); }
  assert.equal(featureOn('vault', { xTabBar: true }, 'xTabBar'), true);
  assert.equal(featureOn('vault', key => key === 'pSearch' ? false : undefined, 'pSearch'), false);
  assert.equal(featureOn('vault', {}, 'nope'), false);
});

test('Classic: every Notes extra is on whatever its toggle says, the Vault plugins do not apply', () => {
  for (const k of EXTRAS) assert.equal(featureOn('classic', { [k]: false }, k), true, k);
  for (const k of CORE) assert.equal(featureOn('classic', { [k]: true }, k), false, k);
});

test('layout option: Vault by default, cleaned to one of the two; enum options are not text boxes', () => {
  const { layout } = OPTIONS;
  assert.equal(layout.scope, 'device');
  assert.equal(layout.default, 'vault');
  assert.equal(layout.clean('classic'), 'classic');
  assert.equal(layout.clean('vault'), 'vault');
  assert.equal(layout.clean('other'), 'vault');
  assert.equal(layout.clean(undefined), 'vault');
  assert.equal(OPTIONS.vStartFile.clean('daily'), 'daily');
  assert.equal(OPTIONS.vStartFile.clean('x'), 'last');
  assert.equal(OPTIONS.vEditMode.clean('live'), 'live');
  assert.equal(OPTIONS.vNewTabView.clean('read'), 'read');
  assert.equal(OPTIONS.vInlineTitle.default, false);
  assert.equal(OPTIONS.vDailyOnStart.default, false);
  for (const k of ['layout', 'vEditMode', 'vNewTabView', 'vStartFile', 'lineSpacing']) assert.ok(!TEXTS.includes(k), k);
  assert.deepEqual(TEXTS.sort(), ['dailyFolder', 'newFolder']);
  for (const k of Object.keys(OPTIONS).filter(k => /^[pvx][A-Z]/.test(k) || k === 'layout')) assert.equal(OPTIONS[k].scope, 'device', k);
});
