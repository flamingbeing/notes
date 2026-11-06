// The Vault layout's sheets: the quick switcher (the pill's search, "Go to file": the box at the bottom, the letters
// matched in bold, Enter on a new name makes the note), the command palette (Ctrl+P: runs a command), the ribbon menu
// (its rows, a random note), the tabs sheet (the counter follows a new tab and a closed one), Back closing each first,
// and axe on each in light and dark.
import { test, expect, signIn, serverHas, uniq, db } from './fixtures.mjs';
import axe from './axe.mjs';

const vault = { layout: /** @type {const} */ ('vault') };
/** axe's serious problems, less the faint words the reference look keeps on purpose ([data-faint]) */
const problems = async page => {
  const all = await axe(page);
  const faint = await page.evaluate(lines => lines.map(l => {
    const [rule, target] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
    try { return rule === 'color-contrast' && !!document.querySelector(target)?.closest('[data-faint]'); } catch { return false; }
  }), all);
  return all.filter((_, i) => !faint[i]);
};
/** a note put straight on the server, in the person's own notes */
const put = (uid, title, body = '', path = '') => db.put(`spaces/${uid}/notes/${uniq('n')}`, { title, body, path, updatedAt: Date.now() });
const openNote = (page, t) => expect.poll(() => page.evaluate(x => window.starter.vault?.open(x), t)).toBe(true);
/** made-up notes: two that match "gp" */
const seed = async uid => {
  const tag = uniq('x').slice(-5);
  const names = { garden: `Garden plan ${tag}`, grocery: `Grocery picks ${tag}`, bread: `Bread ${tag}` };
  await put(uid, names.garden, '# Garden plan\n\nBeds.', 'Projects');
  await put(uid, names.grocery, 'Milk, eggs.');
  await put(uid, names.bread, 'Flour, water, salt.', 'Cooking');
  return names;
};

test('the quick switcher: the box at the bottom, bold letters, the first row selected; Enter on a new name makes the note', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const n = await seed(uid);
  await expect(page.locator('#vl-empty')).toBeVisible();
  await page.click('#vl-empty-go');
  await expect(page.locator('#vl-switcher')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#vl-switcher')).toBeHidden();
  await expect(page.locator('#vl-empty')).toBeVisible();

  await openNote(page, n.bread);
  await page.click('#vl-search');
  const sheet = page.locator('#vl-switcher');
  await expect(sheet).toBeVisible();
  const q = page.locator('#vl-switcher-q');
  await expect(q).toBeFocused();
  await expect(q).toHaveAttribute('placeholder', 'Find or create a note...');
  // the box at the bottom; the sheet's top under the header
  const box = /** @type {{ y: number, height: number }} */ (await page.locator('.vl-pick-box').first().boundingBox());
  expect(box.y + box.height).toBeGreaterThan(780);
  expect(Math.round(box.height)).toBe(50);
  await expect.poll(async () => Math.round((await sheet.boundingBox())?.y ?? 0)).toBe(102);
  // nothing typed: the note opened last first
  await expect(page.locator('#vl-switcher-o0')).toHaveText(n.bread);
  await expect(page.locator('#vl-switcher-o0')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#vl-switcher-create')).toBeHidden();

  await q.fill(`gp ${n.garden.slice(-5)}`);
  await expect(page.locator('#vl-switcher-create')).toBeVisible();
  const first = page.locator('#vl-switcher-o0');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first.locator('b').first()).toBeVisible();
  expect(await page.locator('#vl-switcher-list [role=option]').count()).toBeGreaterThanOrEqual(1);
  await q.press('ArrowDown');
  await q.press('ArrowUp');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  const name = await first.locator('.vl-pick-text').textContent();
  await q.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(String(name));

  // a name nothing matches: Enter makes it
  const fresh = uniq('Pond ideas');
  await page.click('#vl-search');
  await q.fill(fresh);
  await expect(page.locator('#vl-switcher .vl-pick-none')).toBeVisible();
  await q.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(fresh);
  await serverHas(fresh);
  // the clear button: the words, then the sheet
  await page.click('#vl-search');
  await q.fill('abc');
  await page.click('#vl-switcher-clear');
  await expect(q).toHaveValue('');
  await page.click('#vl-switcher-clear');
  await expect(sheet).toBeHidden();
});

test('the command palette: Ctrl+P, "Group: Command" rows; it runs Open today’s daily note, kept first next time; Back closes it', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const n = await seed(uid);
  await openNote(page, n.bread);
  await page.keyboard.press('Control+p');
  const sheet = page.locator('#vl-palette');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#vl-palette-q')).toHaveAttribute('placeholder', 'Select a command...');
  await expect(page.locator('#vl-palette-o0 .vl-pick-group')).toHaveText('Quick switcher: ');
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(n.bread);

  await page.keyboard.press('Control+p');
  await page.fill('#vl-palette-q', 'today daily');
  await expect(page.locator('#vl-palette-o0')).toHaveText('Daily notes: Open today’s daily note');
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await expect(page.locator('#vl-title')).toHaveText(today);
  await serverHas(today);
  await page.keyboard.press('Control+p');
  await expect(page.locator('#vl-palette-o0')).toHaveText('Daily notes: Open today’s daily note');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('the ribbon menu: its rows; Open random note opens another note; Back closes it first', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const n = await seed(uid);
  await openNote(page, n.bread);
  await page.click('#vl-ribbon');
  const sheet = page.locator('#vl-ribbon-sheet');
  await expect(sheet).toBeVisible();
  for (const id of ['switcher', 'daily', 'palette', 'new', 'random', 'search', 'bookmarks', 'settings'])
    await expect(page.locator(`#vl-rib-${id}`)).toBeVisible();
  await expect(sheet.locator('.vl-card').first().locator('.vl-row-label')).toHaveText([
    'Open quick switcher', 'Open today’s daily note', 'Open command palette', 'Create new note', 'Open random note', 'Search', 'Bookmarks']);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(n.bread);

  await page.click('#vl-ribbon');
  await page.click('#vl-rib-random');
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).not.toHaveText(n.bread);
  await expect(page.locator('#vl-title')).toHaveText(new RegExp(`^(${n.garden}|${n.grocery})$`));

  // Search: the left sidebar's Search view
  await page.click('#vl-ribbon');
  await page.click('#vl-rib-search');
  await expect(page.locator('#vl-left')).toBeVisible();
  await expect(page.locator('#vl-search-input')).toBeVisible();
});

test('the tabs sheet: "N tabs", + then a note gives 2; a tab’s cross closes it (1); Back closes the sheet', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const n = await seed(uid);
  await openNote(page, n.bread);
  await expect(page.locator('#vl-tabs .vl-count')).toHaveText('1');
  await page.click('#vl-new');
  await expect(page.locator('#vl-empty')).toBeVisible();
  await page.click('#vl-search');
  await page.fill('#vl-switcher-q', n.garden);
  await page.keyboard.press('Enter');
  await expect(page.locator('#vl-title')).toHaveText(n.garden);
  await expect(page.locator('#vl-tabs .vl-count')).toHaveText('2');

  await page.click('#vl-tabs');
  const sheet = page.locator('#vl-tabs-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.vl-sheet-title')).toHaveText('2 tabs');
  await expect(page.locator('#vl-tab-0 .vl-row-label')).toHaveText(n.bread);
  await expect(page.locator('#vl-tab-0 .vl-row-sub')).toHaveText('Cooking');
  await expect(page.locator('#vl-tab-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vl-tabs-new')).toBeVisible();
  await expect(page.locator('#vl-tabs-close-all')).toBeVisible();
  await page.click('#vl-tab-close-0');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.vl-sheet-title')).toHaveText('1 tab');
  await expect(page.locator('#vl-tabs .vl-count')).toHaveText('1');
  await expect(page.locator('#vl-title')).toHaveText(n.garden);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(n.garden);

  // a tap on a tab shows it; Close all leaves the empty page
  await page.click('#vl-new');
  await page.click('#vl-tabs');
  await page.click('#vl-tab-0');
  await expect(page.locator('#vl-title')).toHaveText(n.garden);
  await page.click('#vl-tabs');
  await page.click('#vl-tabs-close-all');
  await expect(page.locator('#vl-empty')).toBeVisible();
  await expect(page.locator('#vl-tabs .vl-count')).toHaveText('1');
});

test('axe: the switcher, the palette, the ribbon and the tabs sheet, light and dark', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const n = await seed(uid);
  await openNote(page, n.bread);
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.click('#vl-search');
    await page.fill('#vl-switcher-q', 'gp');
    await expect(page.locator('#vl-switcher-o0')).toBeVisible();
    expect(await problems(page), `switcher (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-switcher')).toBeHidden();
    await page.keyboard.press('Control+p');
    await expect(page.locator('#vl-palette-o0')).toBeVisible();
    expect(await problems(page), `palette (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-palette')).toBeHidden();
    await page.click('#vl-ribbon');
    await expect(page.locator('#vl-rib-settings')).toBeVisible();
    expect(await problems(page), `ribbon (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-ribbon-sheet')).toBeHidden();
    await page.click('#vl-tabs');
    await expect(page.locator('#vl-tab-0')).toBeVisible();
    expect(await problems(page), `tabs (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-tabs-sheet')).toBeHidden();
  }
});
