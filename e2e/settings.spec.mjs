// @core/settings on the sample Settings sheet: a device value stays on this device, an account value reaches the
// account's other devices, the settings file drops what it should not carry, and the open sheet passes axe.
import { test, expect, signIn, signInAgain, synced, reveal } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

const open = async page => { await page.click('#open-settings'); await expect(page.locator('#settings')).toBeVisible(); };

test('a device value stays on this device; an account value reaches the other one', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await synced(a);
  await open(a);
  await reveal(a, '#opt-bigRows');
  await a.check('#opt-bigRows');
  await reveal(a, '#opt-itemCount');
  await a.check('#opt-itemCount');
  await a.evaluate(() => document.getElementById('tab-notes').click());
  await expect(a.locator('#items')).toHaveClass(/big/);
  await expect(a.locator('#count')).toBeVisible();
  await synced(a);

  const b = await phone();
  await signInAgain(b, email);
  await expect(b.locator('#count')).toBeVisible();                 // the account's option arrived
  await expect(b.locator('#items')).not.toHaveClass(/big/);        // this device's did not
  await open(b);
  await reveal(b, '#opt-bigRows');
  await expect(b.locator('#opt-bigRows')).not.toBeChecked();
  await reveal(b, '#opt-itemCount');
  await expect(b.locator('#opt-itemCount')).toBeChecked();

  // and a change on b comes back to a without a reload
  await reveal(b, '#opt-itemCount');
  await b.uncheck('#opt-itemCount');
  await expect(a.locator('#count')).toBeHidden({ timeout: 15_000 });
  await expect(a.locator('#items')).toHaveClass(/big/);
});

test('the device value survives sign-out and a reload', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await open(a);
  await reveal(a, '#opt-bigRows');
  await a.check('#opt-bigRows');
  await a.evaluate(() => document.getElementById('tab-notes').click());
  await open(a);
  await reveal(a, '#sign-out');
  await a.click('#sign-out');
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.reload();
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.evaluate(e => window.starter.signInAs(e), email);
  await expect(a.locator('#list-view')).toBeVisible();
  await expect(a.locator('#items')).toHaveClass(/big/);
});

test('a settings file: exported, imported on another account, bad keys dropped', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await synced(a);
  await open(a);
  await reveal(a, '#opt-itemCount');
  await a.check('#opt-itemCount');
  await reveal(a, '#settings input[type=file]');
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export', exact: true }).click()]);
  const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(file.kind).toBe('core-settings');
  expect(file.settings).toEqual({ itemCount: true });             // the device option stays behind

  const b = await phone();
  await signIn(b, 'member');
  await synced(b);
  await open(b);
  const bad = { ...file, settings: { ...file.settings, bigRows: true, nope: 1 } };
  await b.setInputFiles('#settings input[type=file]', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(b.locator('#settings .ui-settings-status')).toContainText('Imported: 1 change, 2 left out');
  await reveal(b, '#opt-itemCount');
  await expect(b.locator('#opt-itemCount')).toBeChecked();
  await reveal(b, '#opt-bigRows');
  await expect(b.locator('#opt-bigRows')).not.toBeChecked();
  await b.setInputFiles('#settings input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(b.locator('#settings .ui-settings-status')).toContainText('not JSON');
  await reveal(b, '#opt-itemCount');
  await expect(b.locator('#opt-itemCount')).toBeChecked();
});

test('the Settings sheet passes axe', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await open(a);
  expect(await AxeBuilder(a)).toEqual([]);
});

test('the toggles in Settings stay switch-sized, not stretched like text boxes', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await a.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('open-settings')).click());
  await reveal(a, '#opt-itemCount');
  const sw = a.locator('#settings-body .ui-switch').first();
  await expect(sw).toBeVisible();
  const w = await sw.evaluate(el => el.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(w).toBeLessThan(4);
});

test('arrange tabs: Folders moves and comes off the bar, listed in Settings to open it; kept after reload', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await a.click('#open-settings');
  await a.locator('.ui-settings-menu-groups .ui-settings-go').filter({ hasText: /^Tab bar/ }).click();
  await a.getByRole('button', { name: 'Move up: Folders' }).click();
  await expect(a.locator('#tabbar > [data-tab-id]').first()).toHaveAttribute('data-tab-id', 'folders');
  await a.getByRole('switch', { name: 'On the tab bar: Folders' }).click();
  await expect(a.locator('#drawer-open')).toHaveAttribute('data-off-bar', '');
  await expect(a.locator('#drawer-open')).toBeHidden();
  await expect(a.getByRole('switch', { name: 'On the tab bar: Settings' })).toBeDisabled();
  await a.reload();
  await expect(a.locator('#drawer-open')).toBeHidden();
  await a.click('#open-settings');
  await expect(a.locator('.ui-settings-menu').getByRole('button', { name: 'Folders', exact: true })).toBeVisible();
});
