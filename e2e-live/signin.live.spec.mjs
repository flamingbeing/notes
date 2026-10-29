// Live smoke test (workflow "Live smoke"; not part of `npx playwright test`). Signs the test user in on the deployed
// site and runs one round trip in its own vault with made-up data: a new note, a picture attached, the vault exported as
// a zip and that zip imported back (everything is skipped: import never overwrites), then the picture and the note are
// removed again. The test user is an app member (its own members/{uid} doc) and in no shared space, so nothing but its
// own vault is touched; a smoke note left behind by a failed run is removed at the start. (The deleted note's bin entry
// stays in the test user's vault: the app has no "empty the bin".)
// Google sign-in only on the site, so the test user (email + password) is signed in through the API
// (app-devkit playwright/live.mjs). Run: LIVE_URL=... LIVE_SPEC=e2e-live LIVE_TEST_EMAIL=... LIVE_TEST_PASSWORD=...
//   npx playwright test -c .devkit/playwright/live.config.mjs
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { test, expect } from '@playwright/test';
import { liveUser, watchConsole, signInViaApi } from '../.devkit/playwright/live.mjs';
import { firebaseConfig } from '../app/src/config.js';

const { email, password } = liveUser();
test.skip(!email || !password || !firebaseConfig.apiKey, 'no test user, or the app has no web config yet');

const PREFIX = 'Live smoke';
const PNG = path.resolve('e2e/fixtures/vault/Ideas/img/sprout.png');   // a made-up picture
const SPROUT = /!\[\[sprout[^\]]*\]\]/;

// The note page's Details panel, opened
/** @param {import('@playwright/test').Page} page */
async function openDetails(page) {
  const more = page.locator('#edit-more');
  if (!await more.evaluate(d => /** @type {HTMLDetailsElement} */ (d).open)) await more.locator('summary').click();
}

// Removes every smoke note in the list (its files first, then the note itself, to the bin).
/** @param {import('@playwright/test').Page} page */
async function removeSmokeNotes(page) {
  await page.evaluate(() => document.getElementById('tab-notes').click());   // on a phone the list is the Notes tab page: Settings or Folders may be the open one
  await expect(page.locator('#items')).toBeVisible();
  const left = page.locator('#items .ui-row', { hasText: PREFIX });
  for (let n = await left.count(); n > 0; n = await left.count()) {
    await left.first().click();
    await expect(page.locator('#edit')).toBeVisible();
    await openDetails(page);   // the attachments sit in the Details panel
    const files = page.locator('#edit-files li');
    for (let f = await files.count(); f > 0; f = await files.count()) {
      await files.first().getByRole('button', { name: 'Remove', exact: true }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
      await expect(files).toHaveCount(f - 1);
    }
    await page.click('#edit-delete');
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await expect(page.locator('#edit')).toBeHidden();
    await expect(left).toHaveCount(n - 1);
  }
}

const synced = page => expect.poll(() => page.evaluate(() => window.starter.status), { timeout: 30_000 }).toBe('synced');

test('the test user signs in on the live site; a note with a picture exports, imports back unchanged, and goes', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchConsole(page);
  await page.goto('/');
  await expect(page.locator('#signed-out')).toBeVisible();
  await signInViaApi(page, { apiKey: firebaseConfig.apiKey, authDomain: firebaseConfig.authDomain, email, password });
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible({ timeout: 30_000 });   // a member sees the list
  await page.click('#open-settings');   // who is signed in sits in the Settings sheet
  await expect(page.locator('#who')).toHaveText(email);
  await expect.poll(() => page.evaluate(() => window.starter.ready), { timeout: 30_000 }).toBe(true);
  await removeSmokeNotes(page);

  const title = `${PREFIX} ${Date.now().toString(36)}`;
  await test.step('a new note with a picture', async () => {
    // + opens a draft; it becomes a note when it is saved (closed with a title), then it is opened again for the picture
    await page.click('#new');
    await expect(page.locator('#edit')).toBeVisible();
    await page.fill('#edit-text', title);
    await page.locator('#edit button[value=close]').click();
    await expect(page.locator('#items')).toContainText(title);
    await page.locator('#items .ui-row', { hasText: title }).first().click();
    await expect(page.locator('#edit')).toBeVisible();
    await page.setInputFiles('#edit-attach-input', PNG);
    await expect(page.locator('#edit-files li')).toHaveCount(1);
    await expect(page.locator('#edit-files')).not.toContainText('(uploading)', { timeout: 60_000 });
    await expect(page.locator('#edit-body')).toHaveValue(SPROUT);
    await page.locator('#edit button[value=close]').click();
    await expect(page.locator('#items')).toContainText(title);
    await synced(page);
  });

  const zipPath = test.info().outputPath('export.zip');
  await test.step('export the vault as a zip', async () => {
    await page.click('#open-settings');
    await page.click('#open-transfer');
    await expect(page.locator('#transfer')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#transfer-export')]);
    await download.saveAs(zipPath);
    const zip = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
    expect(Object.keys(zip)).toContain(`${title}.md`);
    expect(new TextDecoder().decode(zip[`${title}.md`])).toMatch(SPROUT);
    const pics = Object.keys(zip).filter(k => /(^|\/)sprout[^/]*\.(png|webp|jpe?g)$/.test(k));
    expect(pics.length).toBeGreaterThan(0);
    expect(zip[pics[0]].length).toBeGreaterThan(0);
  });

  await test.step('import it back: everything is already there, nothing is written', async () => {
    await page.setInputFiles('#transfer-zip', zipPath);
    await expect(page.locator('#transfer-plan')).toHaveText(/^0 notes, 0 files; \d+ skipped \(\d+ already there/);
    await expect(page.locator('#transfer-go')).toBeHidden();
    await page.click('#transfer-close');
  });

  await test.step('clean up: the picture and the note go', async () => {
    await removeSmokeNotes(page);
    await expect(page.locator('#items')).not.toContainText(title);
    await synced(page);
  });
  expect(errors).toEqual([]);
});

test('signed in at 412 px: no gap above the band, a tapped tab slides, toasts sit above the tab bar', async ({ page }, info) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto('/');
  await signInViaApi(page, { apiKey: firebaseConfig.apiKey, authDomain: firebaseConfig.authDomain, email, password });
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.starter.ready), { timeout: 30_000 }).toBe(true);
  const bar = await page.locator('.ui-bar').boundingBox();
  expect(bar?.y).toBe(0);
  const title = await page.locator('#home .ui-large-title').boundingBox();
  expect(title?.y).toBe((bar?.y ?? 0) + (bar?.height ?? 0));   // the band header follows the bar directly
  // a tapped tab slides its page in (a Web Animation on the page)
  const slid = await page.evaluate(async () => {
    document.getElementById('drawer-open').click();
    await new Promise(r => requestAnimationFrame(r));
    return Array.from(document.querySelector('#folders').getAnimations(), a => /** @type {KeyframeEffect} */ (a.effect).getKeyframes()[0].transform);
  });
  expect(slid).toHaveLength(1);
  expect(slid[0]).toMatch(/^translateX\(\d+px\)$/);
  await expect(page.locator('#folders')).toBeVisible();
  // toasts: the stack's bottom edge clears the tab bar's top
  const gap = await page.evaluate(() => {
    const t = document.querySelector('#toasts .toasts');   // the region app-ui's toaster() adds inside the host
    const m = document.createElement('div'); m.className = 'toast'; m.textContent = 'Test toast'; t.append(m);
    const r = m.getBoundingClientRect(), b = document.querySelector('.ui-tabbar').getBoundingClientRect();
    return { toastBottom: r.bottom, tabTop: b.top };
  });
  expect(gap.toastBottom).toBeLessThanOrEqual(gap.tabTop);
  await page.screenshot({ path: info.outputPath('signed-in-412.png') });
  await page.evaluate(() => document.getElementById('tab-notes').click());
});
