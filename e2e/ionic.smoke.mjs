// The Ionic trial (app/ionic/, docs/decisions/0020-ionic-trial.md): sign in, write a note, open and change it, find it,
// the details and settings sheets, dark mode, and back to the classic page's list with the same notes. A smoke test
// only: the classic page's specs cover the data (sync, spaces, conflicts), which both pages share.
import { test, expect, signIn, uniq } from './fixtures.mjs';

const IONIC = '/app/ionic/?emulator';
const wide = (/** @type {import('@playwright/test').Page} */ page) => (page.viewportSize()?.width || 0) >= 992;

test('the Ionic page: write, open, change, find, details, settings, dark mode', async ({ page }) => {
  await signIn(page, 'member', { path: IONIC });
  // no sideways scroll on the list
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // + opens a new note; what is typed is saved (no Save button), and back shows it in the list
  const title = uniq('Ionic');
  await page.locator('#new').click();
  await page.locator('.note-title input:not(.cloned-input)').fill(title);
  await expect(page.locator('html[data-editor=ready]')).toHaveCount(1);
  await page.locator('.cm-content').click();
  await page.keyboard.type('First line with #trial');
  await page.locator('ion-back-button').click();
  const row = page.locator('#items ion-item', { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('First line with #trial');

  // open it again, change it, and the list says the new words
  await row.click();
  await expect(page.locator('.note-title input:not(.cloned-input)')).toHaveValue(title);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' and more');
  // the read view shows it as Markdown, the tag a link
  await page.locator('.toggle-read').click();
  await expect(page.locator('.read-view')).toContainText('and more');
  // details: a sheet with the folder box
  await page.locator('.details').click();
  await expect(page.locator('ion-modal.sheet .d-folder')).toBeVisible();
  await page.locator('ion-modal.sheet .d-folder input:not(.cloned-input)').fill('Work');
  await page.locator('ion-modal.sheet .d-folder input:not(.cloned-input)').press('Enter');
  await expect(page.locator('ion-toast')).toHaveCount(1);
  // a tap above the sheet closes it
  await page.locator('ion-modal.sheet ion-backdrop').click({ position: { x: 20, y: 20 } });
  await expect(page.locator('ion-modal.sheet')).toHaveCount(0);
  await page.locator('ion-back-button').click();
  await expect(row).toContainText('and more');
  await expect(row).toContainText('Work');

  // search finds it; a word that isn't there finds nothing
  await page.locator('#search input:not(.cloned-input)').fill(title);
  await expect(page.locator('#items ion-item')).toHaveCount(1);
  await page.locator('#search input:not(.cloned-input)').fill('zzzqqq');
  await expect(page.locator('#items ion-item')).toHaveCount(0);
  await page.locator('#search input:not(.cloned-input)').fill('');

  // the menu (a drawer on a phone, beside the list on a computer): the folder filters the list
  if (!wide(page)) await page.locator('ion-menu-button').click();
  await page.locator('#menu-folders ion-item[data-folder="Work"]').click();
  await expect(page.locator('#filter-chip')).toBeVisible();
  await expect(row).toBeVisible();

  // settings: a sheet; Dark turns the page dark
  if (!wide(page)) await page.locator('ion-menu-button').click();
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('ion-segment-button[value=dark]').click();
  await expect(page.locator('html.ion-palette-dark')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(30, 30, 30)');
  await page.locator('ion-segment-button[value=light]').click();
  await expect(page.locator('html.ion-palette-dark')).toHaveCount(0);

  // the classic page, same sign-in and notes
  await page.goto('/app/?emulator');
  await expect(page.locator('#items')).toContainText(title);
});
