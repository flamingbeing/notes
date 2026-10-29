// The Haiku tab: hidden for a member, shown for an admin; Paste fills the box, Run replaces it with the reply (on
// localhost the Worker's canned reply, no network), Undo puts it back, Copy copies it. The text is never stored.
import { test, expect, signIn, fillBody, toNotes } from './fixtures.mjs';

// a page clipboard the test can read and fill (the real one needs permissions not every browser grants)
const fakeClipboard = page => page.addInitScript(() => {
  let held = '';
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => held, writeText: async t => { held = t; } } });
  window.__clip = { get: () => held, set: t => { held = t; } };
});

test('a member has no Haiku tab', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(page.locator('#open-settings')).toBeVisible();
  await expect(page.locator('#open-haiku')).toBeHidden();
  await expect(page.locator('#open-haiku-w')).toBeHidden();
});

test('an admin pastes, runs, undoes and copies; the text is never stored', async ({ phone }) => {
  const page = await phone();
  await fakeClipboard(page);
  await signIn(page, 'admin');
  await page.click('#open-haiku');
  await expect(page.locator('#haiku')).toBeVisible();
  // no Prompts folder yet: the built-in prompt
  await expect(page.locator('#haiku-prompt')).toHaveText('Tidy this text');
  await expect(page.locator('#haiku-edit')).toBeHidden();
  await expect(page.locator('#haiku')).toContainText('Not saved');

  await page.evaluate(() => window.__clip.set('pt for lap chole, fasted from 0200'));
  await page.click('#haiku-paste');
  await expect(page.locator('#haiku-text')).toHaveValue('pt for lap chole, fasted from 0200');
  await page.click('#haiku-run');
  await expect(page.locator('#haiku-text')).toHaveValue('[Haiku test reply]\npt for lap chole, fasted from 0200');
  await expect(page.locator('#haiku-spin')).toBeHidden();
  await page.click('#haiku-undo');
  await expect(page.locator('#haiku-text')).toHaveValue('pt for lap chole, fasted from 0200');
  await expect(page.locator('#haiku-undo')).toBeHidden();
  await page.click('#haiku-run');
  await page.click('#haiku-copy');
  await expect(page.locator('#toasts')).toContainText('Copied');
  expect(await page.evaluate(() => window.__clip.get())).toBe('[Haiku test reply]\npt for lap chole, fasted from 0200');
  // nothing of the text on this device's storage
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('lap chole');
});

test('prompts are notes in Prompts/: listed by title, New prompt makes one there', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'admin');
  await page.click('#open-haiku');
  await page.click('#haiku-new');
  await expect(page.locator('#edit')).toBeVisible();
  await page.fill('#edit-text', 'Premeds');
  await fillBody(page, 'Premeds\nReformat this.');
  await page.locator('#edit button[value=close]').click();
  await page.click('#open-haiku');
  await expect(page.locator('#haiku-prompt option')).toHaveText(['Premeds']);
  await expect(page.locator('#haiku-edit')).toBeVisible();
  await page.click('#haiku-edit');
  await expect(page.locator('#edit-text')).toHaveValue('Premeds');
  await page.locator('#edit button[value=close]').click();
  await toNotes(page);
  await expect(page.locator('#items')).toContainText('Prompts/');
});
