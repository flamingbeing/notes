// The phone's top bar at 360 px: menu left, the title truly centred, the sync button last; Today, Next day and New
// beside the search box, not in the bar.
import { test, expect, signIn, add, uniq, synced } from './fixtures.mjs';

test('360 px: centred title, sync button last, tools beside the search, no sideways scroll', async ({ phone }) => {
  const page = await phone();
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, 'member');
  await add(page, uniq('bar'));
  await synced(page);
  const box = async sel => (await page.locator(sel).boundingBox());
  // the title is invisible at the top (the large title shows); read its box anyway
  const bar = await box('#list-view .ui-bar'), title = await box('#list-view .ui-bar-title');
  expect(Math.abs((title.x + title.width / 2) - (bar.x + bar.width / 2))).toBeLessThanOrEqual(1);
  const sync = await box('#sync-btn'), menu = await box('.ui-bar-menu');
  expect(menu.x).toBeLessThan(title.x);
  expect(sync.x).toBeGreaterThan(title.x + title.width - 1);
  expect(sync.x + sync.width).toBeGreaterThan(bar.width - 24);
  for (const id of ['#daily', '#nextday', '#new']) {
    await expect(page.locator(id)).toBeVisible();
    const b = await box(id), q = await box('#q');
    expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThan(q.x + q.width - 1);
    expect(await page.locator(`.ui-bar ${id}`).count()).toBe(0);
  }
  expect((await box('#q')).width).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator('#sync-btn')).toHaveAttribute('aria-label', /^Saved\. Sync now$/);
  await expect(page.locator('#sync-btn')).toHaveAttribute('title', /^Saved\. Sync now$/);
});

test('the sync button: a tap syncs now and the icon lifts; offline shows the struck cloud', async ({ phone }) => {
  const page = await phone();
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, 'member');
  await synced(page);
  const btn = page.locator('#sync-btn');
  await expect(btn).toHaveAttribute('data-state', 'synced');
  const before = await page.evaluate(() => Number(window.starter.syncTaps ?? 0));
  await btn.click();
  await expect(btn).toHaveAttribute('data-state', 'syncing');
  expect(await btn.locator('.ui-icon').evaluate(e => getComputedStyle(e).animationName)).toBe('ui-sync-lift');
  await expect.poll(() => page.evaluate(() => Number(window.starter.syncTaps ?? 0))).toBe(before + 1);
  await expect(btn).toHaveAttribute('data-state', 'synced');

  await page.context().setOffline(true);
  await add(page, uniq('off'));
  await expect(btn).not.toHaveAttribute('data-state', 'synced');
  await expect(btn).toHaveAttribute('aria-label', /Sending|Offline|Needs you|Not saved/);
  await page.context().setOffline(false);
  await synced(page);
  await expect(btn).toHaveAttribute('data-state', 'synced');
});

test('reduced motion: the syncing icon holds still', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  await synced(page);
  await page.click('#sync-btn');
  await expect(page.locator('#sync-btn')).toHaveAttribute('data-state', 'syncing');
  expect(await page.locator('#sync-btn .ui-icon').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
});
