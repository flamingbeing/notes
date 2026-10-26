// Sign-in, roles from the role doc, and the notes list: add, edit, delete to the bin; filter by tag and folder; today's note.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, openNote, synced, serverHas, serverNotes, db, uniq, APP } from './fixtures.mjs';

test('signed out: the sign-in screen, accessible', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
});

test('an account with no role sees no list until an admin adds it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, null);
  await expect(page.locator('#list-view')).toBeHidden();
  await expect(page.locator('#uid')).not.toBeEmpty();
});

test('a member adds, edits and deletes; the delete lands in the bin', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'member');
  const t = uniq('note');
  await add(page, t);
  await synced(page);
  await serverHas(t);
  expect(await AxeBuilder(page)).toEqual([]);

  await openNote(page, t);
  await page.fill('#edit-body', 'Some text #idea');
  await page.fill('#edit-path', 'work/ideas');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.click('#edit-save');
  await serverHas('Some text #idea', { body: true });
  const saved = (await serverNotes()).find(n => n.data.title === t);
  expect(saved.path).toBe(`spaces/${uid}/notes/${saved.path.split('/').pop()}`);
  expect(saved.data).toMatchObject({ path: 'work/ideas', tags: ['idea'] });
  await expect(page.locator('#items li', { hasText: t })).toContainText('work/ideas/');

  await openNote(page, t);
  await page.click('#edit-delete');
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();   // the confirm
  await expect(page.locator('#items')).not.toContainText(t);
  await expect.poll(async () => (await db.list(`spaces/${uid}/bin`)).some(b => b.data?.title === t), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await serverNotes()).some(n => n.data.title === t)).toBe(false);
});

test('the filter shows one tag or folder; search knows tag: and path:', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('f');
  for (const [title, body, path] of [[`${t} one`, '#red', 'a'], [`${t} two`, '#blue', 'a/b'], [`${t} three`, '#red/dark', 'c']]) {
    expect(await page.evaluate(([title, body]) => window.starter.add(title, body), [title, body])).toBe('');
    if (path) {
      await openNote(page, title);
      await page.fill('#edit-path', path);
      await page.click('#edit-save');
    }
  }
  await expect(page.locator('#items li')).toHaveCount(3);
  const shown = () => page.locator('#items li button').allTextContents();
  await page.selectOption('#filter', 'tag:red');
  await expect.poll(async () => (await shown()).map(x => x.split(' ').slice(1, 2)[0]).sort()).toEqual(['one', 'three']);
  await page.selectOption('#filter', 'path:a');
  await expect.poll(async () => (await shown()).length).toBe(2);
  await page.selectOption('#filter', 'path:a/b');
  await expect.poll(async () => (await shown()).length).toBe(1);
  await page.selectOption('#filter', '');
  await page.fill('#q', 'tag:blue');
  await expect.poll(async () => (await shown()).length).toBe(1);
  await page.fill('#q', 'path:c');
  await expect.poll(shown).toEqual([`${t} three c/`]);
});

test('today’s note: one per date, the same note on two phones', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'member');
  await page.click('#daily');
  await expect(page.locator('#edit')).toBeVisible();
  const iso = await page.locator('#edit-text').inputValue();
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.fill('#edit-body', 'first line');
  await page.click('#edit-save');
  await page.click('#daily');
  await expect(page.locator('#edit-body')).toHaveValue('first line');
  await page.locator('#edit button[value=cancel]').click();
  await expect.poll(async () => (await serverNotes()).filter(n => n.path === `spaces/${uid}/notes/day-${iso}`).length, { timeout: 15_000 }).toBe(1);
});

test('a viewer reads but cannot add or edit', async ({ phone }) => {
  const t = uniq('seen');
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await db.put(`spaces/${uid}/notes/${t}`, { title: t, body: 'read me', updatedAt: Date.now() });
  await expect(page.locator('#items')).toContainText(t);
  await expect(page.locator('#add')).toBeHidden();
  await expect(page.locator('#daily')).toBeHidden();
  await openNote(page, t);
  await expect(page.locator('#edit-body')).toHaveValue('read me');
  await expect(page.locator('#edit-body')).toHaveAttribute('readonly', '');
  await expect(page.locator('#edit-save')).toBeHidden();
});

test('a role change reaches the page by itself (role doc v ahead of the token)', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await expect(page.locator('#add')).toBeHidden();
  await db.put(`members/${uid}`, { role: 'member', v: 2 });
  await expect(page.locator('#add')).toBeVisible();
  await db.del(`members/${uid}`);
  await expect(page.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

// A token refresh restarts Firestore's Listen stream; a role change written just then must still reach the page (the
// Firestore emulator before v1.22 lost such changes: firebase-tools is pinned past it, package.json "rules")
test('a role change during a token refresh still reaches the page', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  const refresh = () => page.evaluate(async () => { const { getAuth } = await import('firebase/auth'); void getAuth().currentUser?.getIdToken(true); });
  for (let v = 2; v < 10; v += 2) {
    await refresh();
    await db.put(`members/${uid}`, { role: 'member', v });
    await expect(page.locator('#add')).toBeVisible();
    await refresh();
    await db.put(`members/${uid}`, { role: 'viewer', v: v + 1 });
    await expect(page.locator('#add')).toBeHidden();
  }
});

test('a note too big to save keeps the sheet open with the text, so nothing typed is lost', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('big');
  await add(page, t);
  await openNote(page, t);
  await page.locator('#edit-body').evaluate((el, n) => {
    const a = /** @type {HTMLTextAreaElement} */ (el);
    a.value = 'x'.repeat(n); a.dispatchEvent(new Event('input'));
  }, 1_100_000);
  await page.click('#edit-save');
  await expect(page.locator('.toast', { hasText: 'too big to save' })).toBeVisible();
  await expect(page.locator('#edit')).toBeVisible();
  expect(await page.locator('#edit-body').evaluate(el => /** @type {HTMLTextAreaElement} */ (el).value.length)).toBe(1_100_000);
});
