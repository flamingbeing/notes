// The Vault layout's right sidebar: a drawer from the right that a swipe left on the note (or the command palette)
// opens, its panes (Outline: the note's headings, a tap scrolls there; Outgoing links: a faint one makes the note;
// Backlinks; Calendar: a tap makes that day's note) and the footer (the note's words and characters, the sync state,
// which a tap syncs), and axe on each pane in light and dark.
import { test, expect, signIn, serverHas, synced, uniq, db } from './fixtures.mjs';
import axe from './axe.mjs';

const vault = { layout: /** @type {const} */ ('vault') };
/** axe's serious problems, less the faint words the reference look keeps on purpose ([data-faint]: counts, other months' days) */
const problems = async page => {
  const all = await axe(page);
  const faint = await page.evaluate(lines => lines.map(l => {
    const [rule, target] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
    try { return rule === 'color-contrast' && !!document.querySelector(target)?.closest('[data-faint], [aria-hidden="true"]'); } catch { return false; }
  }), all);
  return all.filter((_, i) => !faint[i]);
};
/** a note put straight on the server, in the person's own notes */
const put = (uid, title, body = '', path = '') => db.put(`spaces/${uid}/notes/${uniq('n')}`, { title, body, path, updatedAt: Date.now() });
/** a finger's path on the screen (Chromium's touch events, through the devtools protocol) */
const touches = async (page, points) => {
  const c = await page.context().newCDPSession(page);
  const at = ([x, y]) => [{ x, y }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(points[0]) });
  for (const p of points.slice(1)) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(p) }); await page.waitForTimeout(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach();
};
const filler = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the beds, the paths and the watering.`).join('\n\n');
/** a note with headings, links and enough text to scroll */
const seed = async uid => {
  const title = uniq('Garden plan'), other = uniq('Seeds');
  await put(uid, other, 'Tomato, basil, beans.', 'Projects');
  await put(uid, title, `# Garden plan\n\nSee [[${other}]] and [[Compost heap]].\n\n## Tasks\n\n${filler}\n\n## Beds\n\nThree raised beds.`, 'Projects');
  return { title, other };
};
const openNote = (page, t) => expect.poll(() => page.evaluate(x => window.starter.vault?.open(x), t)).toBe(true);
/** the drawer slid all the way in */
const isOpen = page => expect.poll(() => page.locator('#vl-right').evaluate(d => d.matches('[open]') && Math.round(d.getBoundingClientRect().right))).toBe(390);
/** a pane picked from the pill */
const pick = async (page, key) => {
  await page.click('#vl-right-pill');
  await expect(page.locator('#vl-right-menu')).toBeVisible();
  await page.click(`#vl-right-pick-${key}`);
  await expect(page.locator(`#vl-r-${key}`)).toBeVisible();
};

test('a swipe left on the note opens the right sidebar; the outline lists the headings and a tap scrolls there', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const { title } = await seed(uid);
  await openNote(page, title);
  await page.waitForFunction(() => !!document.getElementById('vl-right'));
  await touches(page, [[300, 420], [285, 421], [250, 422], [200, 423], [140, 424], [80, 425]]);
  await isOpen(page);
  await pick(page, 'outline');
  await expect(page.locator('#vl-outline .vl-outline-row')).toHaveText(['Garden plan', 'Tasks', 'Beds']);
  // (a level deeper: 17 px further in)
  const pad = await page.locator('#vl-outline .vl-outline-row').evaluateAll(rows => rows.map(r => parseFloat(getComputedStyle(r).paddingInlineStart)));
  expect(pad[1] - pad[0]).toBe(17);
  await page.locator('#vl-outline .vl-outline-row', { hasText: 'Beds' }).click();
  await expect(page.locator('#vl-right')).toBeHidden();
  await expect.poll(() => page.locator('#edit-scroll').evaluate(s => s.scrollTop)).toBeGreaterThan(300);
  // the choice is kept: the next open shows the outline
  await touches(page, [[300, 420], [285, 421], [250, 422], [200, 423], [140, 424], [80, 425]]);
  await isOpen(page);
  await expect(page.locator('#vl-r-outline')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#vl-right')).toBeHidden();
});

test('the palette opens the outgoing links: "Links 2", a faint one makes that note; the footer counts and syncs', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const { title, other } = await seed(uid);
  await openNote(page, title);
  await page.keyboard.press('Control+p');
  await expect(page.locator('#vl-palette')).toBeVisible();
  await page.fill('#vl-palette-q', 'show outgoing');
  await expect(page.locator('#vl-palette-o0')).toContainText('Show outgoing links');
  await page.keyboard.press('Enter');
  await isOpen(page);
  await expect(page.locator('#vl-r-outgoing')).toBeVisible();
  await expect(page.locator('#vl-r-outgoing .vl-rpane-count')).toHaveText('2');
  const rows = page.locator('#vl-out-rows .vl-out-row');
  await expect(rows).toHaveText([other, 'Compost heap']);
  await expect(rows.nth(1)).toHaveAttribute('data-faint', '');
  await expect(rows.nth(0)).not.toHaveAttribute('data-faint', '');

  // the footer: the note's name, its words and characters, the sync state
  await expect(page.locator('#vl-footer .vl-foot-name')).toHaveText(title);
  await expect(page.locator('#vl-foot-count')).toHaveText(/^\d+ words, \d[\d,]* characters$/);
  await synced(page);
  await expect(page.locator('#vl-sync')).toHaveAttribute('aria-label', /^Synced\. Sync now$/);
  await expect(page.locator('#vl-sync')).toHaveAttribute('data-state', 'synced');
  const before = await page.evaluate(() => Number(window.starter.syncTaps ?? 0));
  await page.click('#vl-sync');
  await expect.poll(() => page.evaluate(() => Number(window.starter.syncTaps ?? 0))).toBe(before + 1);

  await rows.nth(1).click();
  await expect(page.locator('#vl-right')).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText('Compost heap');
  await serverHas('Compost heap');
});

test('the calendar: a dot on a day with a daily note; a tap on another day makes that day’s note', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const { title } = await seed(uid);
  await openNote(page, title);
  await page.keyboard.press('Control+p');
  await page.fill('#vl-palette-q', 'show calendar');
  await page.keyboard.press('Enter');
  await isOpen(page);
  await expect(page.locator('#vl-r-calendar')).toBeVisible();
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await expect(page.locator(`.vl-cal-day[data-iso="${today}"]`)).toHaveClass(/vl-cal-now/);
  expect([5, 6]).toContain(await page.locator('.vl-cal-row:not(.vl-cal-wk)').count());
  await page.locator(`.vl-cal-day[data-iso="${today}"]`).click();
  await expect(page.locator('#vl-right')).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(today);
  await serverHas(today);
  await page.keyboard.press('Control+p');
  await page.fill('#vl-palette-q', 'show calendar');
  await page.keyboard.press('Enter');
  await isOpen(page);
  await expect(page.locator(`.vl-cal-day[data-iso="${today}"]`)).toHaveClass(/vl-cal-has/);
  await expect(page.locator(`.vl-cal-day[data-iso="${today}"]`)).toHaveAttribute('aria-current', 'date');
});

test('axe: each pane of the right sidebar, light and dark', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const { title } = await seed(uid);
  await put(uid, uniq('Kickoff'), `Notes on [[${title}]] and the beds.`);
  await openNote(page, title);
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.keyboard.press('Control+p');
    await page.fill('#vl-palette-q', 'show backlinks');
    await page.keyboard.press('Enter');
    await isOpen(page);
    for (const key of ['backlinks', 'outgoing', 'outline', 'calendar']) {
      await pick(page, key);
      if (key === 'backlinks') await expect(page.locator('#vl-rb-count')).toHaveText('1');
      expect(await problems(page), `${key} (${scheme})`).toEqual([]);
    }
    await page.click('#vl-right-pill');
    expect(await problems(page), `the pane picker (${scheme})`).toEqual([]);
    await page.keyboard.press('Escape');
    await page.goBack();
    await expect(page.locator('#vl-right')).toBeHidden();
  }
});
