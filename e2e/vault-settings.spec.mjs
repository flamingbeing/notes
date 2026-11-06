// The Vault layout's Settings (vault-ui/settings.js): a sheet with a search, the Options card (a row per page) and the
// Core plugins card (the pages of the plugins that are on); a page slides in over the one before, Back steps out page
// by page and then closes the sheet. Every option is bound to the settings api, its control #opt-<key> as in Classic.
import { test, expect, signIn, openSettings } from './fixtures.mjs';
import axe from './axe.mjs';

const vault = { layout: /** @type {const} */ ('vault') };
/** axe's serious problems, less the faint words the reference look keeps on purpose ([data-faint]) */
const problems = async page => {
  const all = await axe(page);
  const faint = await page.evaluate(lines => lines.map(l => {
    const [rule, target] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
    try { return rule === 'color-contrast' && !!document.querySelector(target)?.closest('[data-faint]'); } catch { return false; }
  }), all);
  return all.filter((_, i) => !faint[i]);
};
/** Settings opened from the left sidebar's gear */
const open = async page => {
  if (!await page.locator('#vl-left').isVisible()) await page.click('#vl-side-btn');   // (it stays open under Settings)
  await expect(page.locator('#vl-left')).toBeVisible();
  await page.click('#vl-gear');
  await expect(page.locator('#vl-settings')).toBeVisible();
  await expect(page.locator('#vl-settings [data-page=root]')).toBeVisible();
};
/** the page showing (the one on top, slid in) */
const shown = page => page.locator('#vl-settings .vl-set-page:not([hidden])').last();
/** a finger's path on the screen (Chromium's touch events, through the devtools protocol) */
const touches = async (page, points) => {
  const c = await page.context().newCDPSession(page);
  const at = ([x, y]) => [{ x, y }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(points[0]) });
  for (const p of points.slice(1)) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(p) }); await page.waitForTimeout(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
};
const settled = page => expect.poll(() => shown(page).evaluate(e => getComputedStyle(e).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

test('the gear opens Settings: the Options and Core plugins cards; a search finds Line numbers, kept over a reload', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await open(page);
  const root = page.locator('#vl-settings [data-page=root]');
  await expect(root.getByRole('heading', { name: 'Options' })).toBeVisible();
  await expect(root.getByRole('heading', { name: 'Core plugins' })).toBeVisible();
  for (const name of ['General', 'Appearance', 'Editor', 'Files and links', 'Mobile toolbar', 'Account and spaces', 'Core plugins', 'About']) {
    await expect(page.locator('#vl-settings .vl-set-nav', { hasText: new RegExp(`^${name}$`) }).first()).toBeVisible();
  }
  for (const id of ['backlinks', 'palette', 'daily']) await expect(page.locator(`#vl-set-go-${id}`)).toBeVisible();
  await expect(page.locator('#vl-set-go-tabs')).toBeHidden();   // (the Tab bar extra is off)

  await page.fill('#vl-set-q', 'Line numbers');
  const hit = page.locator('#vl-set-results .vl-set-hit', { hasText: 'Line numbers' });
  await expect(hit).toContainText('Editor');
  await hit.click();
  await expect(page.locator('#vl-set-title-editor')).toBeVisible();
  await expect(page.locator('#opt-lineNumbers')).not.toBeChecked();
  await page.locator('#opt-lineNumbers').click();
  await expect(page.locator('#opt-lineNumbers')).toBeChecked();

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await open(page);
  await page.click('#vl-set-go-editor');
  await expect(page.locator('#opt-lineNumbers')).toBeChecked();
});

test('Back steps out page by page, then closes; the X closes from a page', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await open(page);
  await page.click('#vl-set-go-plugins');
  await expect(page.locator('#vl-set-title-plugins')).toBeVisible();
  await settled(page);
  await page.click('#vl-set-gear-daily');
  await expect(page.locator('#vl-set-title-daily')).toBeVisible();
  await settled(page);
  await expect(page.locator('#opt-dailyFolder')).toBeVisible();
  await expect(page.locator('#vl-settings .vl-set-page:not([hidden])')).toHaveCount(1);   // one screen at a time

  await page.goBack();
  await expect(page.locator('#vl-set-title-plugins')).toBeVisible();
  await expect(page.locator('#vl-set-title-daily')).toBeHidden();
  await page.locator('#vl-settings [data-page=plugins] .vl-set-back').click();
  await expect(page.locator('#vl-set-title-root')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#vl-settings')).toBeHidden();

  await open(page);
  await page.click('#vl-set-go-about');
  await settled(page);
  await page.locator('#vl-settings [data-page=about] .vl-set-close').click();
  await expect(page.locator('#vl-settings')).toBeHidden();
  await page.goBack();   // (no step of Settings left: Back goes on in the app)
  await expect(page.locator('#vl-settings')).toBeHidden();
});

test('a swipe right on a page goes Back; a drag down on the root closes Settings', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await open(page);
  await page.click('#vl-set-go-about');
  await settled(page);
  await touches(page, [[30, 500], [50, 501], [100, 502], [170, 503], [240, 504], [300, 505]]);
  await expect(page.locator('#vl-set-title-about')).toBeHidden();
  await expect(page.locator('#vl-set-title-root')).toBeVisible();
  await settled(page);
  await touches(page, [[200, 40], [200, 60], [200, 140], [200, 260], [200, 380], [200, 500]]);
  await expect(page.locator('#vl-settings')).toBeHidden();
  await page.goBack();   // (its history step went with it: Back stays in the app)
  await expect(page.locator('#vl-left')).toBeHidden();
});

test('a Core plugin off takes its view away: Tags view off, no Tags in the sidebar picker', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await open(page);
  await page.click('#vl-set-go-plugins');
  await expect(page.locator('#opt-pTags')).toBeChecked();
  await page.locator('#opt-pTags').click();
  await expect(page.locator('#opt-pTags')).not.toBeChecked();
  // (a gear shows only on a plugin that is on)
  await page.locator('#opt-pDaily').click();
  await expect(page.locator('#vl-set-gear-daily')).toBeHidden();
  await page.locator('#vl-settings [data-page=plugins] .vl-set-back').click();
  await expect(page.locator('#vl-set-go-daily')).toBeHidden();
  await page.click('#vl-settings-close');
  await expect(page.locator('#vl-settings')).toBeHidden();

  await expect(page.locator('#vl-left')).toBeVisible();   // (the sidebar stayed open under Settings)
  await page.click('#vl-view-pill');
  await expect(page.locator('#vl-view-menu')).toBeVisible();
  await expect(page.locator('#vl-view-files')).toBeVisible();
  await expect(page.locator('#vl-view-tags')).toHaveCount(0);
});

test('Log out in General signs out', async ({ phone }) => {
  const page = await phone(vault);
  const { email } = await signIn(page);
  await open(page);
  await page.click('#vl-set-go-general');
  await expect(page.locator('#who')).toContainText(email);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.locator('#signed-out')).toBeVisible();
  await expect(page.locator('#vl-settings')).toBeHidden();
});

test('Layout to Classic reloads to the tab bar; the Classic Settings keep every section', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await open(page);
  await page.click('#vl-set-go-appearance');
  await expect(page.locator('#opt-layout')).toHaveValue('vault');
  await Promise.all([page.waitForEvent('load'), page.locator('#opt-layout').selectOption({ label: 'Classic layout' })]);
  await expect.poll(() => page.evaluate(() => window.starter?.ready), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('#tab-notes')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.layout)).toBe('classic');
  await expect(page.locator('#vl-settings')).toHaveCount(0);
  await openSettings(page);
  const menu = page.locator('.ui-settings-menu-groups .ui-settings-go');
  for (const name of ['List', 'Editor', 'More', 'Advanced', 'Tab bar', 'This device', 'Notes and files', 'Account']) {
    await expect(menu.filter({ hasText: new RegExp(`^${name}`) }).first()).toBeAttached();
  }
});

test('axe: the root and two pages, light and dark', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    expect(await problems(page), `the root (${scheme})`).toEqual([]);
    for (const id of ['editor', 'general']) {
      await page.click(`#vl-set-go-${id}`);
      await settled(page);
      expect(await problems(page), `${id} (${scheme})`).toEqual([]);
      await page.locator(`#vl-settings [data-page=${id}] .vl-set-back`).click();
      await expect(page.locator('#vl-set-title-root')).toBeVisible();
      await settled(page);
    }
    await page.click('#vl-settings-close');
    await expect(page.locator('#vl-settings')).toBeHidden();
  }
});
