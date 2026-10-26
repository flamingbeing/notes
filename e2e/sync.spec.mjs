// Offline saves, two phones, merges and conflict copies, and renames (sign-out and forget: modules.spec.mjs).
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, signInAgain, add, openNote, synced, serverHas, serverNotes, uniq, APP } from './fixtures.mjs';

test('a save made offline is kept on the phone and sent once back online, even after closing the page', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const t = uniq('offline');
  await page.context().setOffline(true);
  await add(page, t);
  await expect.poll(() => page.evaluate(() => window.starter.status)).not.toBe('synced');
  // the page closes while offline; the outbox (IndexedDB) still holds the save
  const again = await page.context().newPage();
  await page.close();
  await page.context().setOffline(false);
  // still signed in on this phone: the list shows straight away, and the outbox sends what it kept
  await again.goto(APP);
  await expect(again.locator('#list-view')).toBeVisible();
  await serverHas(t);
  await synced(again);
});

test('two phones see each other’s changes', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('shared');
  await add(a, t);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
});

// Two phones on one note: a made it, b goes offline; each edits the body, b comes back.
async function twoEdits(a, b, t, mineB, theirsA) {
  expect(await a.evaluate(t => window.starter.add(t, 'one\ntwo\nthree'), t)).toBe('');
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
  await synced(a); await synced(b);
  await b.context().setOffline(true);
  await openNote(b, t);
  await expect(b.locator('#edit-body')).toHaveValue('one\ntwo\nthree');
  await b.fill('#edit-body', mineB);
  await b.click('#edit-save');
  await openNote(a, t);
  await a.fill('#edit-body', theirsA);
  await a.click('#edit-save');
  await serverHas(theirsA, { body: true });
  await b.context().setOffline(false);
}
const bodyOf = async title => (await serverNotes()).find(n => n.data.title === title)?.data.body;

test('edits of different lines on two phones, one offline, merge into one note', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('merge');
  await twoEdits(a, b, t, 'one from b\ntwo\nthree', 'one\ntwo\nthree from a');
  await expect.poll(() => bodyOf(t), { timeout: 20_000 }).toBe('one from b\ntwo\nthree from a');
  await synced(b);
  // both phones show the merged text; no conflict copy was made
  for (const p of [a, b]) {
    await openNote(p, t);
    await expect(p.locator('#edit-body')).toHaveValue('one from b\ntwo\nthree from a', { timeout: 15_000 });
    await p.locator('#edit button[value=cancel]').click();
  }
  expect((await serverNotes()).some(n => String(n.data.title).startsWith(t + ' (conflict'))).toBe(false);
});

test('the same line changed on two phones: the other phone’s text stays, this phone’s is kept as a conflict copy', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('clash');
  await twoEdits(a, b, t, 'one\ntwo from b\nthree', 'one\ntwo from a\nthree');
  await expect(b.locator('#toasts')).toContainText('kept as', { timeout: 20_000 });
  const copy = () => serverNotes().then(l => l.find(n => String(n.data.title).startsWith(t + ' (conflict, ')));
  await expect.poll(async () => (await copy())?.data.body, { timeout: 15_000 }).toBe('one\ntwo from b\nthree');
  expect((await copy()).data.title).toMatch(/\(conflict, \w+, \d{1,2} \w{3} \d\d:\d\d\)$/);
  await synced(b);
  expect(await bodyOf(t)).toBe('one\ntwo from a\nthree');
  await expect(a.locator('#items')).toContainText(t + ' (conflict', { timeout: 15_000 });
  await openNote(b, t);
  await expect(b.locator('#edit-body')).toHaveValue('one\ntwo from a\nthree', { timeout: 15_000 });
});

test('a rename rewrites the links to the note; a link to no note makes it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('ren');
  expect(await page.evaluate(t => window.starter.add(t + ' target', 'I am linked'), t)).toBe('');
  expect(await page.evaluate(t => window.starter.add(t + ' source', `See [[${t} target]] and [[${t} target|it]]; also [[${t} new]].`), t)).toBe('');
  await openNote(page, t + ' target');
  // backlinks: the source links here
  await expect(page.locator('#edit-backlinks')).toContainText(t + ' source');
  await page.fill('#edit-text', t + ' renamed');
  await page.click('#edit-save');
  await serverHas(`See [[${t} renamed]] and [[${t} renamed|it]]`, { body: true });
  const renamed = (await serverNotes()).find(n => n.data.title === t + ' renamed');
  expect(renamed.data.aliases).toEqual([t + ' target']);
  // a link to a missing note creates it on a click
  await openNote(page, t + ' source');
  await page.locator('#edit-links button.missing', { hasText: t + ' new' }).click();
  await expect(page.locator('#edit-text')).toHaveValue(t + ' new');
  await serverHas(t + ' new');
  expect(await AxeBuilder(page)).toEqual([]);
});
