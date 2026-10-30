// Sign-in, roles from the role doc, and the notes list: add, edit, delete to the bin; filter by tag and folder; today's note.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, openNote, synced, serverHas, serverNotes, db, uniq, APP, fillBody, showOnly, details, reveal } from './fixtures.mjs';

test('signed out: the sign-in screen, accessible', { tag: '@smoke' }, async ({ phone }) => {
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

test('a member adds, edits and deletes; the delete lands in the bin', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'member');
  const t = uniq('note');
  await add(page, t);
  await synced(page);
  await serverHas(t);
  expect(await AxeBuilder(page)).toEqual([]);

  await openNote(page, t);
  await fillBody(page, 'Some text #idea');
  await details(page);
  await page.fill('#edit-path', 'work/ideas');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.click('#edit-save');
  await serverHas('Some text #idea', { body: true });
  const saved = (await serverNotes()).find(n => n.data.title === t);
  expect(saved.path).toBe(`spaces/${uid}/notes/${saved.path.split('/').pop()}`);
  expect(saved.data).toMatchObject({ path: 'work/ideas', tags: ['idea'] });
  await expect(page.locator('#items .ui-row', { hasText: t })).toContainText('work/ideas/');

  await openNote(page, t);
  await page.click('#edit-delete');
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();   // the confirm
  await expect(page.locator('#items')).not.toContainText(t);
  await expect.poll(async () => (await db.list(`spaces/${uid}/bin`)).some(b => b.data?.title === t), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await serverNotes()).some(n => n.data.title === t)).toBe(false);
});

test('the drawer shows one tag or folder; search knows tag: and path:', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('f');
  for (const [title, body, path] of [[`${t} one`, '#red', 'a'], [`${t} two`, '#blue', 'a/b'], [`${t} three`, '#red/dark', 'c']]) {
    expect(await page.evaluate(([title, body]) => window.starter.add(title, body), [title, body])).toBe('');
    if (path) {
      await openNote(page, title);
      await details(page);
      await page.fill('#edit-path', path);
      await page.click('#edit-save');
    }
  }
  await expect(page.locator('#items .ui-row')).toHaveCount(3);
  const shown = () => page.locator('#items .ui-row').allTextContents();
  await showOnly(page, 'tag:red');
  await expect(page.locator('#filter-name')).toHaveText('#red');
  await expect.poll(async () => (await shown()).map(x => x.split(' ').slice(1, 2)[0]).sort()).toEqual(['one', 'three']);
  await showOnly(page, 'path:a');
  await expect.poll(async () => (await shown()).length).toBe(2);
  await showOnly(page, 'path:a/b');
  await expect.poll(async () => (await shown()).length).toBe(1);
  await page.click('#filter-clear');
  await expect(page.locator('#filter-chip')).toBeHidden();
  await page.fill('#q', 'tag:blue');
  await expect.poll(async () => (await shown()).length).toBe(1);
  await page.fill('#q', 'path:c');
  await expect.poll(shown).toEqual([`${t} three c/`]);
});

test('a new note: + opens an empty page in the folder for new notes; nothing typed leaves nothing behind', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.click('#open-settings');
  await reveal(page, '#opt-newFolder');
  await page.fill('#opt-newFolder', 'Inbox/');
  await reveal(page, '#opt-newFolder');
  await page.locator('#opt-newFolder').press('Tab');
  await reveal(page, '#opt-newFolder');
  await expect(page.locator('#opt-newFolder')).toHaveValue('Inbox');
  await page.evaluate(() => document.getElementById('tab-notes').click());

  await page.click('#new');
  await expect(page.locator('#edit-text')).toBeFocused();
  await page.locator('#edit button[value=close]').click();
  await expect(page.locator('#edit')).toBeHidden();
  await synced(page);
  await expect(page.locator('#items .ui-row')).toHaveCount(0);

  // text but no title: "Untitled", in Inbox
  await page.click('#new');
  await fillBody(page, 'just a thought');
  await page.locator('#edit button[value=close]').click();
  await expect(page.locator('#items .ui-row', { hasText: 'Untitled' })).toContainText('Inbox/');
  await serverHas('just a thought', { body: true });
  await page.click('#new');
  await fillBody(page, 'another');
  await page.locator('#edit button[value=close]').click();
  await expect(page.locator('#items .ui-row', { hasText: 'Untitled 2' })).toHaveCount(1);
});

test('each note opened is a step back: Back goes to the note before, then the list; a reload opens the note again', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('step');
  expect(await page.evaluate(t => window.starter.add(t + ' to', 'the end'), t)).toBe('');
  expect(await page.evaluate(t => window.starter.add(t + ' from', `see [[${t} to]]`), t)).toBe('');
  await openNote(page, t + ' from');
  await expect(page).toHaveURL(/#\/note\//);
  await details(page);
  await expect(page.locator('#edit-where')).toContainText('1 link');
  await page.locator('#edit-links button', { hasText: t + ' to' }).click();
  await expect(page.locator('#edit-text')).toHaveValue(t + ' to');
  await page.reload();
  await expect(page.locator('#edit-text')).toHaveValue(t + ' to');
  await page.goBack();
  await expect(page.locator('#edit')).toBeHidden();
  await expect(page).not.toHaveURL(/#/);

  await openNote(page, t + ' from');
  await page.locator('#edit-links button', { hasText: t + ' to' }).click();
  await expect(page.locator('#edit-text')).toHaveValue(t + ' to');
  await page.goBack();
  await expect(page.locator('#edit-text')).toHaveValue(t + ' from');
  await page.goBack();
  await expect(page.locator('#edit')).toBeHidden();
  // Close goes back to the list in the history too
  await openNote(page, t + ' from');
  await page.locator('#edit-links button', { hasText: t + ' to' }).click();
  await page.locator('#edit button[value=close]').click();
  await expect(page.locator('#edit')).toBeHidden();
  await expect(page).not.toHaveURL(/#/);
});

test('today’s note: one per date, the same note on two phones', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'member');
  await page.click('#daily');
  await expect(page.locator('#edit')).toBeVisible();
  const iso = await page.locator('#edit-text').inputValue();
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await fillBody(page, 'first line');
  await page.click('#edit-save');
  await page.click('#daily');
  await expect(page.locator('#edit-body')).toHaveValue('first line');
  await page.locator('#edit button[value=close]').click();
  await expect.poll(async () => (await serverNotes()).filter(n => n.path === `spaces/${uid}/notes/day-${iso}`).length, { timeout: 15_000 }).toBe(1);
});

test('the next working day’s note: a weekday after today, its own note', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.click('#nextday');
  await expect(page.locator('#edit')).toBeVisible();
  const iso = await page.locator('#edit-text').inputValue();
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv'));
  expect(iso > today).toBe(true);
  expect([0, 6]).not.toContain(new Date(iso + 'T12:00').getDay());
});

test('a viewer reads but cannot add or edit', async ({ phone }) => {
  const t = uniq('seen');
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await db.put(`spaces/${uid}/notes/${t}`, { title: t, body: 'read me', updatedAt: Date.now() });
  await expect(page.locator('#items')).toContainText(t);
  await expect(page.locator('#new')).toBeHidden();
  await expect(page.locator('#daily')).toBeHidden();
  await expect(page.locator('#nextday')).toBeHidden();
  await openNote(page, t);
  await expect(page.locator('#edit-body')).toHaveValue('read me');
  await expect(page.locator('#edit-body')).toHaveAttribute('readonly', '');
  await expect(page.locator('#edit-save')).toBeHidden();
});

test('a role change reaches the page by itself (role doc v ahead of the token)', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await expect(page.locator('#new')).toBeHidden();
  await db.put(`members/${uid}`, { role: 'member', v: 2 });
  await expect(page.locator('#new')).toBeVisible();
  await db.del(`members/${uid}`);
  await expect(page.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

// S1: removing someone ends their access, not only their role doc: the Worker deletes the doc and revokes the account
// (revoked/{uid}: the rules and the files route refuse at once; claims cleared; refresh tokens ended)
test('an admin removes a member: the page loses the list, writes and uploads are refused, the session ends', async ({ phone }) => {
  const admin = await phone(), gone = await phone();
  const { uid: adminUid } = await signIn(admin, 'admin');
  const { uid } = await signIn(gone, 'member');
  const upload = () => gone.evaluate(async uid => {
    const { getAuth } = await import('firebase/auth');
    const t = await getAuth().currentUser?.getIdToken().catch(() => '');
    return (await fetch(`/api/files/${uid}/f1`, { method: 'PUT', body: 'x', headers: { Authorization: `Bearer ${t}` } })).status;
  }, uid);
  expect(await upload()).toBe(201);
  // a page can't delete a role doc any more (the rules), and only admins may ask the Worker
  expect(await gone.evaluate(u => window.starter.members().remove(u), adminUid)).toBe('Admins only.');
  expect(await admin.evaluate(u => window.starter.members().remove(u), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toBeFalsy();
  expect(await db.get(`revoked/${uid}`)).toBeTruthy();
  expect(await upload()).toBe(403);
  await expect(gone.locator('#list-view')).toBeHidden({ timeout: 15_000 });
  // after a token refresh the token carries no role; the sessions were ended (validSince: real Firebase then refuses the
  // refresh token and the page signs out; the Auth emulator doesn't check it on refresh, so the test reads the account)
  expect(await gone.evaluate(async () => {
    const { getAuth } = await import('firebase/auth');
    const u = getAuth().currentUser;
    return u ? (await u.getIdTokenResult(true).then(r => r.claims.g ?? 'none', e => e.code)) : 'signed out';
  })).not.toHaveProperty('_');
  const account = await (await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1/projects/demo-notes/accounts:lookup`,
    { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) })).json();
  expect(Number(account.users[0].validSince)).toBeGreaterThan(0);
  // added back later: the next claims ask clears revoked/ and the list returns
  expect(await admin.evaluate(u => window.starter.members().setRole(u, 'viewer'), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toMatchObject({ role: 'viewer', v: 1 });
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
    await expect(page.locator('#new')).toBeVisible();
    await refresh();
    await db.put(`members/${uid}`, { role: 'viewer', v: v + 1 });
    await expect(page.locator('#new')).toBeHidden();
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
