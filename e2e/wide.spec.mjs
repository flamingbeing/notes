// The adaptive shell: from 600 px the side bar, the list and the open note sit side by side (the note page is not modal).
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, openNote, uniq } from './fixtures.mjs';

test('a laptop gets the side bar and the note beside the list; a phone gets the tab bar', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('wide'), b = uniq('wide');
  await add(page, a);
  await add(page, b);
  await expect(page.locator('.ui-tabbar')).toBeVisible();
  await expect(page.locator('.ui-sidebar')).toBeHidden();

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('.ui-sidebar')).toBeVisible();
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await expect(page.locator('#detail')).toBeVisible();

  await openNote(page, a);
  await expect(page.locator('#edit')).toBeVisible();
  expect(await page.locator('#edit').evaluate(d => d.matches(':modal'))).toBe(false);
  await expect(page.locator('#items .ui-row', { hasText: b })).toBeVisible();
  await expect(page.locator('#edit-text')).toHaveValue(a);

  expect(await AxeBuilder(page)).toEqual([]);

  // the list stays usable with a note open: another click opens that note
  await openNote(page, b);
  await expect(page.locator('#edit-text')).toHaveValue(b);

  // Esc closes the page though it is not modal
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit')).toBeHidden();

  // the side bar's search and Settings work without the tab bar
  await page.fill('#q-w', a);
  await expect(page.locator('#items .ui-row', { hasText: b })).toHaveCount(0);
  await page.click('#open-settings-w');
  await expect(page.locator('#settings-panel')).toBeVisible();
});

test('a note open while the window crosses 600 px stays open, beside the list on a laptop and over it on a phone', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('turn'), b = uniq('turn');
  await add(page, a);
  await add(page, b);
  await openNote(page, a);
  expect(await page.locator('#edit').evaluate(d => d.matches(':modal'))).toBe(true);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(() => page.locator('#edit').evaluate(d => d.open && !d.matches(':modal'))).toBe(true);
  await expect(page.locator('#items .ui-row', { hasText: b })).toBeVisible();
  await expect(page.locator('#edit-text')).toHaveValue(a);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(() => page.locator('#edit').evaluate(d => d.open && d.matches(':modal'))).toBe(true);
  await expect(page.locator('#edit-text')).toHaveValue(a);
});
