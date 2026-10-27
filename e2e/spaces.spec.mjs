// Shared spaces with two or three made-up accounts: invite (in the app now, or at a first sign-in), roles (a viewer
// only reads), taking someone out (the space's notes leave their device), moving a note, and [[Space/Note]] links.
// (Reads by someone not in a space are refused by the rules: app/test/rules.test.mjs.)
import { test, expect, signIn, add, openNote, synced, serverHas, notePathOf, uniq, APP, drawer, details } from './fixtures.mjs';

// a new space by name; the owner opens it from the switcher
async function newSpace(page, name) {
  await drawer(page, '#space-new');
  await page.fill('#space-new-name', name);
  await page.click('#space-new-make');
  await expect(page.locator('#space-new-sheet')).toBeHidden();
  await expect(page.locator('#space option', { hasText: name })).toHaveCount(1, { timeout: 15_000 });
}
const open = async (page, label) => {
  await expect(page.locator('#space option', { hasText: label })).toHaveCount(1, { timeout: 15_000 });
  await page.selectOption('#space', { label });
  await expect(page.locator('#space-open')).toHaveJSProperty('hidden', false);
};
// this text anywhere in the page's IndexedDB (the app's copy of its notes, its outbox, Firestore's cache)
const onDevice = (page, text) => page.evaluate(async text => {
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  for (const { name } of await indexedDB.databases()) {
    const db = await req(indexedDB.open(name));
    try {
      for (const store of db.objectStoreNames) if (JSON.stringify(await req(db.transaction(store).objectStore(store).getAll())).includes(text)) return true;
    } finally { db.close(); }
  }
  return false;
}, text);
async function invite(page, email, role) {
  if (!await page.locator('#space-sheet').isVisible()) await drawer(page, '#space-open');
  await page.fill('#invite-email', email);
  await page.selectOption('#invite-role', role);
  await page.click('#space-invite button[type=submit]');
  await expect(page.locator('#space-msg')).toHaveText('');
}

test('an invited member sees the space and edits in it; a viewer only reads; someone not invited sees nothing', async ({ phone }) => {
  const a = await phone(), b = await phone(), v = await phone(), c = await phone();
  await signIn(a, 'member');
  const bob = await signIn(b, 'member'), vic = await signIn(v, 'member');
  await signIn(c, 'member');
  const name = uniq('Space'), t = uniq('in-space');
  await newSpace(a, name);
  await open(a, name);
  await add(a, t);
  await synced(a);
  expect(await notePathOf(t)).toMatch(/^spaces\/s-[A-Za-z0-9]+\/notes\//);
  await invite(a, bob.email, 'edit');
  await expect(a.locator('#space-people')).toContainText(bob.email, { timeout: 15_000 });
  await invite(a, vic.email, 'view');
  await expect(a.locator('#space-people')).toContainText(vic.email, { timeout: 15_000 });
  await a.click('#space-close');

  // b (can edit): opens it, sees the note, adds one that a sees
  await open(b, name);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
  await expect(b.locator('#new')).toBeVisible();
  const t2 = uniq('from-b');
  await add(b, t2);
  await expect(a.locator('#items')).toContainText(t2, { timeout: 15_000 });
  // b sees the people but none of the owner's controls
  await drawer(b, '#space-open');
  await expect(b.locator('#space-invite')).toBeHidden();
  await expect(b.locator('#space-delete')).toBeHidden();
  await expect(b.locator('#space-leave')).toBeVisible();
  await b.click('#space-close');

  // v (can view): reads, can't write
  await open(v, `${name} (view only)`);
  await expect(v.locator('#items')).toContainText(t, { timeout: 15_000 });
  await expect(v.locator('#new')).toBeHidden();
  await openNote(v, t);
  await expect(v.locator('#edit-body')).toHaveJSProperty('readOnly', true);
  await expect(v.locator('#edit-save')).toBeHidden();
  await expect(v.locator('#edit-move-box')).toBeHidden();
  await v.locator('#edit button[value=close]').click();

  // c: no spaces at all
  await expect(c.locator('#space')).toBeHidden();
  await expect(c.locator('#items')).not.toContainText(t);
});

test('someone taken out of a space loses it and its notes, here and after a reload; leaving works the same', async ({ phone }) => {
  const a = await phone(), b = await phone();
  await signIn(a, 'member');
  const bob = await signIn(b, 'member');
  const name = uniq('Out'), t = uniq('secret');
  await newSpace(a, name);
  await open(a, name);
  await add(a, t);
  await invite(a, bob.email, 'edit');
  await a.click('#space-close');
  await open(b, name);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
  await expect.poll(() => onDevice(b, t)).toBe(true);

  await drawer(a, '#space-open');
  await a.locator('#space-people li', { hasText: bob.email }).getByRole('button', { name: 'Remove' }).click();
  await a.getByRole('button', { name: 'Remove', exact: true }).last().click();   // the confirm
  await expect(a.locator('#space-people')).not.toContainText(bob.email, { timeout: 15_000 });

  await expect(b.locator('#toasts')).toContainText(`no longer in “${name}”`, { timeout: 15_000 });
  await expect(b.locator('#space')).toBeHidden();
  await expect(b.locator('#items')).not.toContainText(t);
  await expect.poll(() => onDevice(b, t), { timeout: 15_000 }).toBe(false);
  await b.reload();
  await expect(b.locator('#list-view')).toBeVisible();
  await expect.poll(() => b.evaluate(() => window.starter.ready)).toBe(true);
  await expect(b.locator('#items')).not.toContainText(t);
  await expect(b.locator('#space')).toBeHidden();

  // invited again, b leaves by themselves
  await invite(a, bob.email, 'view');
  await a.click('#space-close');
  await open(b, `${name} (view only)`);
  await drawer(b, '#space-open');
  await b.click('#space-leave');
  await b.getByRole('button', { name: 'Leave', exact: true }).last().click();
  await expect(b.locator('#space')).toBeHidden({ timeout: 15_000 });
  await expect(a.locator('#items')).toContainText(t);

  // invited again but not opening it: the space is only watched in the background (for links, kept in memory); taken
  // out, nothing of it is on the device
  await invite(a, bob.email, 'edit');
  await expect(b.locator('#space')).toBeVisible({ timeout: 15_000 });
  await a.locator('#space-people li', { hasText: bob.email }).getByRole('button', { name: 'Remove' }).click();
  await a.getByRole('button', { name: 'Remove', exact: true }).last().click();
  await expect(b.locator('#space')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => onDevice(b, t), { timeout: 15_000 }).toBe(false);
});

test('an admin invites someone not in the app yet: they join at their first sign-in; a taken-back invite does nothing', async ({ phone }) => {
  const a = await phone(), b = await phone(), c = await phone();
  await signIn(a, 'admin');
  const name = uniq('Pending'), t = uniq('waiting');
  await newSpace(a, name);
  await open(a, name);
  await add(a, t);
  const bEmail = `${uniq('new')}@example.com`, cEmail = `${uniq('new')}@example.com`;
  await invite(a, bEmail, 'edit');
  await expect(a.locator('#space-pending')).toContainText(bEmail, { timeout: 15_000 });
  await invite(a, cEmail, 'view');
  await expect(a.locator('#space-pending')).toContainText(cEmail, { timeout: 15_000 });
  await a.locator('#space-pending li', { hasText: cEmail }).getByRole('button', { name: 'Take back' }).click();
  await expect(a.locator('#space-pending')).not.toContainText(cEmail, { timeout: 15_000 });

  // b signs in for the first time: in the app (a member) and in the space, no admin step
  await b.goto(APP);
  await expect(b.locator('#signed-out')).toBeVisible();
  await b.evaluate(e => window.starter.signInAs(e), bEmail);
  await expect(b.locator('#list-view')).toBeVisible({ timeout: 15_000 });
  await open(b, name);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });
  await expect(a.locator('#space-pending-box')).toBeHidden({ timeout: 15_000 });
  await expect(a.locator('#space-people')).toContainText(bEmail);

  // c's invite was taken back: no access, no space
  await c.goto(APP);
  await c.evaluate(e => window.starter.signInAs(e), cEmail);
  await expect(c.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

test('a note moves from the vault to a space in one go; a [[Space/Note]] link opens it there', async ({ phone }) => {
  const a = await phone(), b = await phone();
  await signIn(a, 'member');
  const bob = await signIn(b, 'member');
  const name = uniq('Move'), t = uniq('moving'), home = uniq('home');
  await newSpace(a, name);
  await open(a, name);
  await invite(a, bob.email, 'edit');
  await a.click('#space-close');
  await a.selectOption('#space', { label: 'My notes' });
  await expect(a.locator('#space-open')).toHaveJSProperty('hidden', true);
  await add(a, t);
  expect(await a.evaluate(([h, n, x]) => window.starter.add(h, `see [[${n}/${x}]]`), [home, name, t])).toBe('');
  await synced(a);
  const before = await notePathOf(t);

  await openNote(a, t);
  await details(a);
  await a.selectOption('#edit-move', { label: name });
  await a.click('#edit-move-go');
  await a.getByRole('button', { name: 'Move', exact: true }).last().click();   // the confirm
  await expect(a.locator('#edit')).toBeHidden();
  await expect(a.locator('#items')).not.toContainText(t, { timeout: 15_000 });
  await expect.poll(async () => (await notePathOf(t)) !== before && !!(await notePathOf(t))?.startsWith('spaces/s-'), { timeout: 15_000 }).toBe(true);
  await open(b, name);
  await expect(b.locator('#items')).toContainText(t, { timeout: 15_000 });

  // the link in a's vault note opens the space, then the note
  await a.selectOption('#space', { label: 'My notes' });
  await openNote(a, home);
  await details(a);
  await a.locator('#edit-links button', { hasText: `${name}/${t}` }).click();
  await expect(a.locator('#edit-text')).toHaveValue(t, { timeout: 15_000 });
  await expect(a.locator('#space')).toHaveValue(/^s-/);
  await serverHas(home);
});
