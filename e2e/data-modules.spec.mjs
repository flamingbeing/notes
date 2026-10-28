// The D2 modules, each off until the device turns it on: bulk edit (tag, merge, delete to the bin), the bin (restore),
// feedback (a member sends, an admin reads), and share-in's chooser.
import { test, expect, signIn, synced, uniq, toNotes } from './fixtures.mjs';

const turnOn = async (page, ...names) => {
  await page.click('#open-settings');
  for (const n of names) await page.check(`#opt-${n}`);
  await page.evaluate(() => document.getElementById('tab-notes').click());
};
const add = (page, title, body = 'text') => page.evaluate(([t, b]) => window.starter.add(t, b), [title, body]);

test('every option starts off: no Select button, no Bin or Feedback buttons', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await synced(a);
  await expect(a.locator('#select')).toBeHidden();
  await a.click('#open-settings');
  await expect(a.locator('#open-bin')).toBeHidden();
  await expect(a.locator('#open-feedback')).toBeHidden();
  for (const n of ['binScreen', 'bulkEdit', 'shareIn', 'feedbackOn']) await expect(a.locator(`#opt-${n}`)).not.toBeChecked();
});

test('bulk edit tags and merges, a delete goes to the bin, and the bin brings it back', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const x = uniq('ax'), y = uniq('ay'), z = uniq('az');
  expect(await add(a, x, 'one')).toBe('');
  expect(await add(a, y, 'two')).toBe('');
  expect(await add(a, z, 'three')).toBe('');
  await turnOn(a, 'bulkEdit', 'binScreen');
  await a.click('#select');
  for (const t of [x, y]) await a.locator('#items .ui-row', { hasText: t }).click();
  await a.click('#bulk-edit');
  await a.fill('#bulk-tag', 'picked');
  await a.click('#bulk-tag-go');
  await expect(a.locator('.toast', { hasText: 'Done' })).toBeVisible();
  await a.click('#select');   // the bulk run ended select mode; this starts it again
  for (const t of [x, y]) await a.locator('#items .ui-row', { hasText: t }).click();
  await a.click('#bulk-edit');
  await a.fill('#bulk-merge-title', `${x} merged`);
  await a.click('#bulk-merge');
  await expect(a.locator('#items .ui-row', { hasText: `${x} merged` })).toBeVisible();
  await expect(a.locator('#items .ui-row', { hasText: new RegExp(`^${y}$`) })).toHaveCount(0);
  await synced(a);
  // the merged originals are in the bin; bring one back
  await a.click('#open-settings');
  await a.click('#open-bin');
  await expect(a.locator('#bin-items li', { hasText: y })).toBeVisible();
  await a.locator('#bin-items li', { hasText: y }).getByRole('button', { name: 'Restore' }).click();
  await a.click('#bin-close');
  await toNotes(a);
  await expect(a.locator('#items .ui-row', { hasText: new RegExp(`^${y}$`) })).toBeVisible();
  await expect(a.locator('#items .ui-row', { hasText: z })).toBeVisible();
});

test('feedback: a member sends, an admin reads and marks it done', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await turnOn(a, 'feedbackOn');
  const text = uniq('fb');
  await a.click('#open-settings');
  await a.click('#open-feedback');
  await a.fill('#feedback-text', text);
  await a.click('#feedback-send');
  await expect(a.locator('#feedback-msg')).toContainText('Sent');
  await expect(a.locator('#feedback-inbox')).toBeHidden();
  const b = await phone();
  await signIn(b, 'admin');
  await turnOn(b, 'feedbackOn');
  await b.click('#open-settings');
  await b.click('#open-feedback');
  await expect(b.locator('#feedback-items li', { hasText: text })).toBeVisible();
  await b.locator('#feedback-items li', { hasText: text }).getByRole('button', { name: 'Done' }).click();
  await expect(b.locator('#feedback-items li', { hasText: `✓ ${text}` })).toBeVisible();
});
