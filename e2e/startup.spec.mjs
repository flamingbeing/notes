// Startup: the list as last shown paints before any module loads (public/snap.js), a row tapped then opens once the
// app is ready, and signing out forgets it.
import { test, expect, signIn, add, openSettings, uniq, APP } from './fixtures.mjs';

test('the last list paints at once; a tap waits for the app; sign-out forgets it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('snap');
  await add(page, t);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('notes:snap') || '')).toContain(t);

  // the app's own script (or the Vite build's entry) held back: the kept list shows anyway, and a tap on its row is kept
  let release = () => {};
  const held = new Promise(r => { release = r; });
  await page.route(/\/(src\/app|assets\/main-[^/]+)\.js$/, async route => { await held; await route.continue(); });
  await page.goto(APP, { waitUntil: 'commit' });
  await expect(page.locator('#items .ui-row', { hasText: t })).toBeVisible();
  await expect(page.locator('#signed-out')).toBeHidden();
  expect(await page.evaluate(() => window.starter?.ready ?? false)).toBe(false);
  await page.locator('#items .ui-row', { hasText: t }).click();
  release();
  await expect(page.locator('#edit')).toBeVisible();
  await expect(page.locator('#edit-text')).toHaveValue(t);
  await page.unroute(/\/src\/app\.js$/);

  // signed out: nothing kept, the next start is the sign-in screen with no list behind it
  await page.locator('#edit button[value=close]').click();
  await openSettings(page);
  await page.click('#sign-out');
  await expect(page.locator('#signed-out')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('notes:snap'))).toBeNull();
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  await expect(page.locator('#list-view')).toBeHidden();
});
