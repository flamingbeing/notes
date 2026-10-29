// Back with tabs (app-ui tabBack): switching tabs adds at most one history step; Back on another tab goes to the
// first tab; Back on the first tab leaves the app.
import { test, expect, signIn } from './fixtures.mjs';

const tap = (page, id) => page.evaluate(i => /** @type {HTMLElement} */ (document.getElementById(i)).click(), id);
const current = page => page.evaluate(() => document.querySelector('.ui-tabbar .ui-tab[aria-current="page"]')?.id);

test('tabs add at most one Back step; Back goes to the first tab, then leaves', async ({ phone }) => {
  const page = await phone();
  await signIn(page);
  await expect.poll(() => current(page)).toBe('tab-notes');
  const before = await page.evaluate(() => history.length);

  for (const id of ['drawer-open', 'open-settings']) {
    await tap(page, id);
    await expect.poll(() => current(page)).toBe(id);
  }
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);

  await page.goBack();
  await expect.poll(() => current(page)).toBe('tab-notes');

  const app = page.url();
  const left = await page.goBack();
  expect(left === null || page.url() !== app).toBe(true);
});
