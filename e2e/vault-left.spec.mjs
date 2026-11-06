// The Vault layout's left sidebar: a drawer the sidebar button or a swipe on the note opens (a tap on the shade, Back
// or a swipe closes it), its views (Files, Search, Tags, Bookmarks) picked from the pill and kept, the file tree with
// its folders, tools and row menu (rename relinks, new folders and notes land where asked), the space row's counts and
// Settings gear, the Search view's results and Match case, a tag's tap, and axe on each view in light and dark.
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
const put = (uid, title, { body = '', path = '', tags = [], links = [] } = {}) =>
  db.put(`spaces/${uid}/notes/${uniq('n')}`, { title, body, path, tags, links, aliases: [], updatedAt: Date.now() });
/** the drawer opened by its button, slid all the way in */
const openLeft = async page => {
  await page.click('#vl-side-btn');
  await expect(page.locator('#vl-left')).toBeVisible();
  await expect.poll(() => page.locator('#vl-left').evaluate(d => Math.round(d.getBoundingClientRect().left))).toBe(0);
};
const closedLeft = page => expect(page.locator('#vl-left')).toBeHidden();
/** a finger's path on the screen (Chromium's touch events, through the devtools protocol) */
const touches = async (page, points, { holdMs = 0 } = {}) => {
  const c = await page.context().newCDPSession(page);
  const at = ([x, y]) => [{ x, y }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(points[0]) });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (const p of points.slice(1)) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(p) }); await page.waitForTimeout(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
};
/** a long-press on an element's middle */
const longPress = async (page, locator) => {
  const b = /** @type {{ x: number, y: number, width: number, height: number }} */ (await locator.boundingBox());
  await touches(page, [[b.x + b.width / 2, b.y + b.height / 2]], { holdMs: 700 });
};
const row = (page, title) => page.locator('#vl-files .vl-tree-row', { hasText: title }).first();
const folder = (page, path) => page.locator(`#vl-files .vl-folder[data-path="${path}"]`);
/** a view picked from the pill */
const pick = async (page, key) => {
  await page.click('#vl-view-pill');
  await expect(page.locator('#vl-view-menu')).toBeVisible();
  await page.click(`#vl-view-${key}`);
  await expect(page.locator('#vl-view-menu')).toBeHidden();
};

test('the sidebar button opens the drawer (its look filled); a tap on the shade, then Back, close it', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  await put(uid, uniq('Note'));
  await openLeft(page);
  await expect(page.locator('#vl-side-btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#vl-files')).toBeVisible();
  // (the note slid aside by the drawer's width)
  const w = await page.locator('#vl-left').evaluate(d => d.getBoundingClientRect().width);
  expect(Math.round(w)).toBe(Math.round(Math.min(417, 390 * 0.84)));
  await expect.poll(() => page.locator('#edit').evaluate(e => Math.round(e.getBoundingClientRect().left))).toBe(Math.round(w));
  await page.mouse.click(370, 420);
  await closedLeft(page);
  await expect(page.locator('#vl-side-btn')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.locator('#edit').evaluate(e => Math.round(e.getBoundingClientRect().left))).toBe(0);

  await openLeft(page);
  await page.goBack();
  await closedLeft(page);
  await expect(page.locator('#edit')).toBeVisible();
});

test('a swipe right on the note opens the drawer; a swipe left on it closes it', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await expect(page.locator('#vl-empty')).toBeVisible();
  await page.waitForFunction(() => !!document.getElementById('vl-left'));
  await touches(page, [[120, 420], [135, 421], [170, 422], [220, 423], [280, 424], [330, 425]]);
  await expect(page.locator('#vl-left')).toBeVisible();
  await expect.poll(() => page.locator('#vl-left').evaluate(d => Math.round(d.getBoundingClientRect().left))).toBe(0);
  await touches(page, [[300, 420], [285, 421], [240, 422], [180, 423], [120, 424], [60, 425]]);
  await closedLeft(page);
  // (from the screen's edge it is the phone's Back: nothing opens)
  await touches(page, [[10, 420], [40, 421], [90, 422], [160, 423], [240, 424]]);
  await page.waitForTimeout(300);
  await expect(page.locator('#vl-left')).toBeHidden();
});

test('the view picker switches views; the choice is kept over a reload', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await openLeft(page);
  await expect(page.locator('#vl-view-pill')).toContainText('Files');
  await page.click('#vl-view-pill');
  await expect(page.locator('#vl-view-files')).toHaveAttribute('aria-checked', 'true');
  for (const key of ['files', 'search', 'tags', 'bookmarks']) await expect(page.locator(`#vl-view-${key}`)).toBeVisible();
  await expect(page.locator('#vl-view-notes')).toHaveCount(0);   // (the Note list extra is off)
  await page.click('#vl-view-tags');
  await expect(page.locator('#vl-tags')).toBeVisible();
  await expect(page.locator('#vl-files')).toBeHidden();
  await expect(page.locator('#vl-view-pill')).toContainText('Tags');
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await openLeft(page);
  await expect(page.locator('#vl-tags')).toBeVisible();
  await expect(page.locator('#vl-view-pill')).toContainText('Tags');
});

test('Files: a nested folder opens, a note in it opens and the drawer shuts; collapse all; the sort', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const deep = uniq('Deep');
  await put(uid, deep, { body: 'deep down', path: 'Outer/Inner' });
  await put(uid, 'Top note', { body: 'top' });
  await openLeft(page);
  await expect(folder(page, 'Outer')).toBeVisible();
  await page.click('#vl-files-fold');   // collapse all
  await expect(folder(page, 'Outer')).toHaveAttribute('aria-expanded', 'false');
  await expect(folder(page, 'Outer/Inner')).toHaveCount(0);
  await folder(page, 'Outer').click();
  await expect(folder(page, 'Outer/Inner')).toHaveAttribute('aria-expanded', 'false');
  await folder(page, 'Outer/Inner').click();
  await expect(row(page, deep)).toBeVisible();
  // (a level in: the name 17 px further in than its folder's)
  const pad = await page.evaluate(() => [...document.querySelectorAll('#vl-files .vl-tree-row')].map(r => parseFloat(getComputedStyle(r).paddingLeft)));
  expect(pad.slice(0, 3)).toEqual([29, 46, 63]);
  await row(page, deep).click();
  await closedLeft(page);
  await expect(page.locator('#vl-title')).toHaveText(deep);

  await openLeft(page);
  await expect(row(page, deep)).toHaveAttribute('aria-current', 'page');
  await page.click('#vl-files-sort');
  await expect(page.locator('#vl-sort-name-asc')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#vl-sort-name-desc');
  await expect(page.locator('#vl-files-sort-sheet')).toBeHidden();
  const order = await page.locator('#vl-files .vl-tree-row').allTextContents();
  expect(order[0]).toBe('Outer');
  expect(order.at(-1)).toBe('Top note');
});

test('a new folder, then a new note: the note is saved in that folder', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await openLeft(page);
  const name = uniq('Box');
  await page.click('#vl-files-folder');
  await expect(page.locator('#vl-prompt')).toBeVisible();
  await page.fill('#vl-prompt-input', name);
  await page.click('#vl-prompt-ok');
  await expect(folder(page, name)).toBeVisible();
  await expect(page.locator('.vl-space-count')).toHaveText('0 files, 1 folder');
  await page.click('#vl-files-new');
  await closedLeft(page);
  await expect(page.locator('#vl-title')).toHaveText('Untitled');
  await expect.poll(async () => (await serverNotes()).some(n => n.data.title === 'Untitled' && n.data.path === name), { timeout: 15_000 }).toBe(true);
});

test('long-press a note: Rename saves the new name and its links follow; Bookmark shows it in the card and the Bookmarks view', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('Alpha'), b = uniq('Beta'), a2 = uniq('Gamma');
  await put(uid, a, { body: 'the target' });
  await put(uid, b, { body: `see [[${a}]]`, links: [a.toLowerCase()] });
  await openLeft(page);
  await longPress(page, row(page, a));
  await expect(page.locator('#vl-file-menu')).toBeVisible();
  for (const id of ['vl-fm-tab', 'vl-fm-rename', 'vl-fm-move', 'vl-fm-mark', 'vl-fm-copy', 'vl-fm-delete']) await expect(page.locator(`#${id}`)).toBeVisible();
  await page.click('#vl-fm-rename');
  await expect(page.locator('#vl-prompt-input')).toHaveValue(a);
  await page.fill('#vl-prompt-input', a2);
  await page.click('#vl-prompt-ok');
  await serverHas(a2);
  await serverHas(`[[${a2}]]`, { body: true });
  await expect(row(page, a2)).toBeVisible();

  await row(page, b).click({ button: 'right' });   // (right-click: the same menu)
  await expect(page.locator('#vl-fm-mark')).toHaveText('Bookmark');
  await page.click('#vl-fm-mark');
  await expect(page.locator('#vl-files .vl-marks')).toContainText(b);
  await pick(page, 'bookmarks');
  await expect(page.locator('#vl-bookmarks .vl-bm-row')).toHaveText([b]);
});

test('the space row counts the files and folders; the gear opens Settings', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  await put(uid, 'One', { path: 'P' });
  await put(uid, 'Two', { path: 'P/Q' });
  await put(uid, 'Three');
  await openLeft(page);
  await expect(page.locator('.vl-space-name')).toHaveText('My notes');
  await expect(page.locator('.vl-space-count')).toHaveText('3 files, 2 folders');
  await page.click('#vl-space');
  await expect(page.locator('#vl-spaces-sheet')).toBeVisible();
  await expect(page.locator('#vl-space-mine')).toHaveAttribute('aria-checked', 'true');
  await page.goBack();
  await expect(page.locator('#vl-spaces-sheet')).toBeHidden();
  await page.click('#vl-gear');
  await expect(page.locator('#vl-settings')).toBeVisible();
});

test('Search: the count of notes, the matches marked; Match case changes the counts; a tag tap searches tag:', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  await put(uid, 'First', { body: 'Zebrafin here' });
  await put(uid, 'Second', { body: 'a zebrafin, then zebrafin again' });
  await put(uid, 'Fruit', { body: 'an apple #fruit/apple', tags: ['fruit/apple'] });
  await openLeft(page);
  await pick(page, 'search');
  await expect(page.locator('#vl-search-view .vl-search-field')).toBeVisible();
  await page.fill('#vl-search-input', 'zebrafin');
  await expect(page.locator('#vl-search-count')).toHaveText('2 results');
  await expect(page.locator('.vl-search-matches')).toHaveText('Matches text: “zebrafin”');
  await expect(page.locator('#vl-search-results mark')).toHaveCount(3);
  await expect(page.locator('.vl-group-count')).toHaveText(['2', '1']);
  await page.click('#vl-search-case');
  await expect(page.locator('#vl-search-case')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vl-search-count')).toHaveText('1 result');
  await page.click('#vl-search-case');
  await page.fill('#vl-search-input', 'nothingmatchesthis');
  await expect(page.getByText('No matches found.')).toBeVisible();

  await pick(page, 'tags');
  await expect(page.locator('#vl-tags .vl-tag-row[data-tag="fruit"]')).toContainText('1');
  await page.locator('#vl-tags .vl-tag-row[data-tag="fruit"]').click();
  await expect(page.locator('#vl-search-view')).toBeVisible();
  await expect(page.locator('#vl-search-input')).toHaveValue('tag:#fruit');
  await expect(page.locator('#vl-search-count')).toHaveText('1 result');
});

test('axe: each view of the sidebar, light and dark', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  await put(uid, 'Plan', { body: 'beds and basil #garden/veg', path: 'Projects/Garden', tags: ['garden/veg'] });
  await put(uid, 'Bread', { body: 'flour and basil', path: 'Cooking' });
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLeft(page);
    for (const key of ['files', 'search', 'tags', 'bookmarks']) {
      await pick(page, key);
      if (key === 'search') { await page.fill('#vl-search-input', 'basil'); await expect(page.locator('#vl-search-count')).toHaveText('2 results'); }
      expect(await problems(page), `${key} (${scheme})`).toEqual([]);
    }
    await page.click('#vl-view-pill');
    expect(await problems(page), `the view picker (${scheme})`).toEqual([]);
    await page.keyboard.press('Escape');
    await pick(page, 'files');
    await longPress(page, row(page, 'Bread'));
    await expect(page.locator('#vl-file-menu')).toBeVisible();
    expect(await problems(page), `the file menu (${scheme})`).toEqual([]);
    await page.goBack();
    await expect(page.locator('#vl-file-menu')).toBeHidden();
    await page.goBack();
    await closedLeft(page);
  }
});
