// The Vault layout's note page: Source mode (the Markdown shown, ** and all), the view button to the read view and
// back, the mobile toolbar over the keyboard (bold wraps the selection; it scrolls sideways), the Linked mentions under
// the note (a group's tap opens the note linking here), the note menu (Rename… relinks, Bookmark… ticks and shows in
// the drawer’s card, Delete file asks first, goes to the bin and Undo brings it back), the title renamed in the header, a viewer's
// smaller menu, and axe on both views in light and dark.
import { test, expect, signIn, serverHas, serverNotes, uniq, db } from './fixtures.mjs';
import axe from './axe.mjs';

const vault = { layout: /** @type {const} */ ('vault') };
/** axe's serious problems, less the faint words the reference look keeps on purpose ([data-faint]: counts, chevrons) */
const problems = async page => {
  const all = await axe(page);
  const faint = await page.evaluate(lines => lines.map(l => {
    const [rule, target] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
    try { return rule === 'color-contrast' && !!document.querySelector(target)?.closest('[data-faint]'); } catch { return false; }
  }), all);
  return all.filter((_, i) => !faint[i]);
};
/** a note put straight on the server, in the person's own notes */
const put = (uid, title, { body = '', path = '', links = [] } = {}) =>
  db.put(`spaces/${uid}/notes/${uniq('n')}`, { title, body, path, tags: [], links, aliases: [], updatedAt: Date.now() });
/** a note opened by its title (as the shot tool does), its page shown */
const open = async (page, title) => {
  await expect.poll(() => page.evaluate(t => window.starter.vault?.open(t), title)).toBe(true);
  await expect(page.locator('#vl-title')).toHaveText(title);
};
/** the note menu, open */
const menu = async page => {
  await page.click('#vl-more-btn');
  await expect(page.locator('#vl-menu')).toBeVisible();
};
const noLonger = title => expect.poll(async () => (await serverNotes()).some(n => n.data.title === title), { timeout: 15_000 }).toBe(false);

test('Source mode shows the Markdown as typed; the view button goes to the read view (links underlined) and back', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Src'), b = uniq('Other');
  await put(uid, b, { body: 'the other note' });
  await put(uid, a, { body: `# Heading\n\nSome **bold** words and [[${b}]].\n\n- one\n- two`, links: [b.toLowerCase()] });
  await open(page, a);
  await expect(page.locator('#edit-cm')).toBeVisible();
  await expect(page.locator('#edit-cm .cm-content')).toContainText('Some **bold** words');
  await expect(page.locator('#edit-cm .cm-content')).toContainText(`[[${b}]]`);
  // (the heading bigger than the text; the link's words in the link colour)
  const size = sel => page.locator(sel).first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  expect(await size('#edit-cm .cm-hd1')).toBeGreaterThan(await size('#edit-cm .cm-line'));
  await expect(page.locator('#edit-cm .cm-wl-text').first()).toHaveCSS('color', 'rgb(120, 82, 238)');

  await expect(page.locator('#vl-mode-btn')).toHaveAttribute('aria-label', 'Reading view');
  await page.click('#vl-mode-btn');
  await expect(page.locator('#edit-read')).toBeVisible();
  await expect(page.locator('#edit-cm')).toBeHidden();
  await expect(page.locator('#vl-mode-btn')).toHaveAttribute('aria-label', 'Editing view');
  const link = page.locator('#edit-read a', { hasText: b });
  await expect(link).toBeVisible();
  expect(await link.evaluate(e => getComputedStyle(e).textDecorationLine)).toContain('underline');
  await expect(page.locator('#edit-read strong')).toHaveText('bold');
  await page.click('#vl-mode-btn');
  await expect(page.locator('#edit-cm')).toBeVisible();
  await expect(page.locator('#edit-read')).toBeHidden();
});

test('the mobile toolbar shows over the keyboard while editing; Bold wraps the selection; it scrolls sideways', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Tb');
  await put(uid, a, { body: 'plain word' });
  await open(page, a);
  const bar = page.locator('#vl-toolbar');
  await page.locator('#edit-cm .cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Shift+ArrowLeft');
  await expect(bar).toBeHidden();   // (no keyboard yet)
  await page.evaluate(() => document.documentElement.classList.add('ui-keyboard-open'));
  await expect(bar).toBeVisible();
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await bar.boundingBox());
  expect(Math.round(box.height)).toBe(42);
  expect(Math.round(box.y + box.height)).toBe(844);
  expect(Math.round(/** @type {{ width: number }} */ (await page.locator('#vl-tb-bold').boundingBox()).width)).toBe(48);
  expect(await bar.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
  await expect(page.locator('#vl-tb-spacing')).toBeHidden();
  await page.click('#vl-tb-bold');
  await expect(page.locator('#edit-cm .cm-content')).toHaveText('plain **word**');
  await expect(page.locator('#vl-tb-bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#edit-cm .cm-content')).toBeFocused();
  await serverHas('plain **word**', { body: true });

  // off in the read view, and with the keyboard down
  await page.evaluate(() => document.documentElement.classList.remove('ui-keyboard-open'));
  await expect(bar).toBeHidden();
});

test('Linked mentions: the notes linking here, how many; a tap on a group opens that note', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Target'), b = uniq('Source');
  await put(uid, a, { body: 'the target' });
  await put(uid, b, { body: `first line\nsee [[${a}]] here`, links: [a.toLowerCase()] });
  await open(page, a);
  const block = page.locator('#vl-mentions');
  await expect(block).toBeVisible();
  await expect(page.locator('#vl-mn-title')).toHaveText('Linked mentions');
  await expect(page.locator('#vl-mn-count')).toHaveText('1');
  const group = block.locator(`.vl-mn-group`).first();
  await expect(group.locator('.vl-mn-gtitle')).toHaveText(b);
  await expect(group.locator('.vl-mn-snip mark')).toHaveText(`[[${a}]]`);
  await group.locator('.vl-mn-gtitle').click();
  await expect(page.locator('#vl-title')).toHaveText(b);
  // (the note opened from here shows its own: none link to it)
  await expect(page.locator('#vl-mn-count')).toHaveText('0');
});

test('the note menu: Rename… relinks, Bookmark… ticks and shows in the drawer, Delete file asks, goes to the bin and Undo restores it', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Alpha'), b = uniq('Beta'), a2 = uniq('Gamma');
  await put(uid, a, { body: 'the target' });
  await put(uid, b, { body: `see [[${a}]]`, links: [a.toLowerCase()] });
  await open(page, a);

  await menu(page);
  for (const id of ['close', 'backlinks', 'read', 'source', 'rename', 'move', 'bookmark', 'find', 'copy', 'share', 'delete']) await expect(page.locator(`#vl-menu-${id}`)).toBeVisible();
  await expect(page.locator('#vl-menu-backlinks')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#vl-menu-rename');
  await expect(page.locator('#vl-prompt-input')).toHaveValue(a);
  await page.fill('#vl-prompt-input', a2);
  await page.click('#vl-prompt-ok');
  await serverHas(a2);
  await serverHas(`[[${a2}]]`, { body: true });
  await expect(page.locator('#vl-title')).toHaveText(a2);

  await menu(page);
  await expect(page.locator('#vl-menu-bookmark')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#vl-menu-bookmark');
  await expect(page.locator('#vl-menu')).toBeHidden();
  await menu(page);
  await expect(page.locator('#vl-menu-bookmark')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vl-menu-bookmark .vl-tick')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#vl-menu')).toBeHidden();
  await page.click('#vl-side-btn');
  await expect(page.locator('#vl-files .vl-marks')).toContainText(a2);
  await page.goBack();
  await expect(page.locator('#vl-left')).toBeHidden();

  // Backlinks in document: off for this note, then on again
  await menu(page);
  await page.click('#vl-menu-backlinks');
  await expect(page.locator('#vl-mentions')).toBeHidden();
  await menu(page);
  await page.click('#vl-menu-backlinks');
  await expect(page.locator('#vl-mentions')).toBeVisible();

  // Delete file asks first: Cancel keeps the note; Delete sends it to the bin
  await menu(page);
  await page.click('#vl-menu-delete');
  await expect(page.locator('#vl-confirm')).toBeVisible();
  await expect(page.locator('#vl-confirm-text')).toContainText(a2);
  await expect(page.locator('#vl-confirm-cancel')).toBeFocused();
  await page.click('#vl-confirm-cancel');
  await expect(page.locator('#vl-confirm')).toBeHidden();
  await expect(page.locator('#vl-title')).toContainText(a2);
  await menu(page);
  await page.click('#vl-menu-delete');
  await page.click('#vl-confirm-ok');
  await noLonger(a2);
  await expect(page.locator('#vl-empty')).toBeVisible();
  await page.locator('#toasts button', { hasText: 'Undo' }).click();
  await expect(page.locator('#toasts')).toContainText('Restored', { timeout: 15_000 });
  await serverHas(a2);
});

test('a tap on the header title renames the note in place; Esc puts it back', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Old'), b = uniq('Linker'), a2 = uniq('New');
  await put(uid, a, { body: 'renamed here' });
  await put(uid, b, { body: `see [[${a}]]`, links: [a.toLowerCase()] });
  await open(page, a);
  await page.click('#vl-title');
  const input = page.locator('#vl-title-input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(a);
  await input.fill('something else');
  await input.press('Escape');
  await expect(input).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(a);

  await page.click('#vl-title');
  await input.fill(a2);
  await input.press('Enter');
  await expect(input).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(a2);
  await serverHas(a2);
  await serverHas(`[[${a2}]]`, { body: true });
});

test('a viewer: the menu has the views, Copy path and Share only; the title does not rename', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page, 'viewer');
  const a = uniq('Seen');
  await db.put(`spaces/${uid}/notes/${uniq('n')}`, { title: a, body: 'read me', updatedAt: Date.now() });
  await open(page, a);
  await menu(page);
  for (const id of ['close', 'read', 'source', 'copy', 'share']) await expect(page.locator(`#vl-menu-${id}`)).toBeVisible();
  for (const id of ['rename', 'move', 'bookmark', 'find', 'details', 'delete']) await expect(page.locator(`#vl-menu-${id}`)).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#vl-menu')).toBeHidden();
  await page.click('#vl-title');
  await expect(page.locator('#vl-title-input')).toBeHidden();
});

test('axe: the note in Source mode and the read view, with its mentions and menu, light and dark', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Plan'), b = uniq('Jobs');
  await put(uid, a, { body: '# Plan\n\nBeds along the **fence**.\n\n- [ ] Buy seeds\n- North bed\n  - Basil\n\n---\n\n#garden' });
  await put(uid, b, { body: `## Now\n- Dig the beds from [[${a}]]`, links: [a.toLowerCase()] });
  await open(page, a);
  await expect(page.locator('#vl-mn-count')).toHaveText('1');
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await problems(page), `Source mode (${scheme})`).toEqual([]);
    await page.click('#vl-mode-btn');
    await expect(page.locator('#edit-read')).toBeVisible();
    expect(await problems(page), `the read view (${scheme})`).toEqual([]);
    await page.click('#vl-mode-btn');
    await menu(page);
    expect(await problems(page), `the note menu (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-menu')).toBeHidden();
  }
});
