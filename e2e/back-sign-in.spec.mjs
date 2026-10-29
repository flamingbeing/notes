// Back after a redirect sign-in: the page the sign-in left from is kept whole by the browser (the back/forward cache),
// still on the sign-in screen. Back to it must open it as it is now (the list), and Back from there leaves the app.
// Playwright turns that cache off, so this test has its own browser with it on.
import { test as base, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { APP, db, uniq } from './fixtures.mjs';

const test = base.extend({
  bfPage: async ({ baseURL }, use) => {
    const browser = await chromium.launch({
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    });
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // each document's pageshows (true: brought back from the cache)
    await context.addInitScript(() => { addEventListener('pageshow', e => { window.__shown = (window.__shown || []).concat(e.persisted); }); });
    await use(await context.newPage());
    await browser.close();
  },
});

// On a first page the kit's first Back stays and toasts "Press Back again to close"; the second leaves (Chrome skips the
// guard until the first tap, so the toast may not come).
async function backPastGuard(page) {
  const url = page.url();
  await page.goBack({ waitUntil: 'commit' });
  if (page.url() === url && await page.getByText('Press Back again to close').isVisible().catch(() => false)) await page.goBack({ waitUntil: 'commit' });
}

test('Back after signing in never shows the sign-in screen again, and Back from the list leaves', async ({ bfPage: page }) => {
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  // the redirect: the page leaves while signed out, and the sign-in lands on a new load of the app
  await page.goto(`${APP}&back`);
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), `${uniq('u')}@example.com`);
  await expect(page.locator('#no-access')).toBeVisible();
  await db.put(`members/${await page.locator('#uid').textContent()}`, { role: 'member', v: 1 });
  await expect(page.locator('#list-view')).toBeVisible();

  // (a page from the cache fires no load event)
  await backPastGuard(page);
  await expect.poll(() => page.evaluate(() => window.__shown).catch(() => null)).toEqual([false]);   // loaded again
  expect(new URL(page.url()).search).toBe('?emulator');
  await expect(page.locator('#list-view')).toBeVisible();
  await expect(page.locator('#signed-out')).toBeHidden();

  await backPastGuard(page);
  await expect.poll(() => page.url()).toBe('about:blank');
});
