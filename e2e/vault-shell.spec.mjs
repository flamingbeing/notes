// The Vault layout's shell (the default layout): the note page is home, with the empty page when no note is open, the
// navigation pill (Back, Forward; hidden while the keyboard is up), the ribbon sheet (Back closes it first), the Core
// plugins page (a Notes extra brings a Classic feature back) and the switch back to the Classic layout.
import { test, expect, signIn, serverHas, uniq, db } from './fixtures.mjs';
import axe from './axe.mjs';

const vault = { layout: /** @type {const} */ ('vault') };
/** axe's serious problems, less the faint words the reference look keeps on purpose ([data-faint]: counts, disabled arrows) */
const problems = async page => {
  const all = await axe(page);
  const faint = await page.evaluate(lines => lines.map(l => {
    const [rule, target] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
    try { return rule === 'color-contrast' && !!document.querySelector(target)?.closest('[data-faint]'); } catch { return false; }
  }), all);
  return all.filter((_, i) => !faint[i]);
};
/** a note put straight on the server, in the person's own notes */
const put = (uid, title, body = '') => db.put(`spaces/${uid}/notes/${uniq('n')}`, { title, body, updatedAt: Date.now() });

test('a new account shows No file is open; Create new note saves one; a reload opens it again', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await expect(page.locator('#vl-empty')).toBeVisible();
  await expect(page.getByText('No file is open')).toBeVisible();
  await expect(page.locator('#vl-title')).toHaveText('New tab');
  expect(await problems(page)).toEqual([]);

  await page.click('#vl-empty-new');
  await expect(page.locator('#vl-empty')).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText('Untitled');
  await serverHas('Untitled');

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#vl-title')).toHaveText('Untitled');
  await expect(page.locator('#vl-empty')).toBeHidden();
  expect(await problems(page)).toEqual([]);
});

test('a link opens the next note; Back and Forward in the pill go between them', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('A'), b = uniq('B');
  await put(uid, b, 'the second note');
  await put(uid, a, `go to [[${b}]]`);
  await expect.poll(() => page.evaluate(t => window.starter.vault?.open(t), a)).toBe(true);
  await expect(page.locator('#vl-title')).toHaveText(a);
  await expect(page.locator('#vl-back')).toHaveAttribute('aria-disabled', 'true');

  await page.click('#vl-mode-btn');   // the read view: its links open
  await page.locator('#edit-read a', { hasText: b }).first().click();
  await expect(page.locator('#vl-title')).toHaveText(b);
  await expect(page.locator('#vl-back')).toHaveAttribute('aria-disabled', 'false');

  await page.click('#vl-back');
  await expect(page.locator('#vl-title')).toHaveText(a);
  await expect(page.locator('#vl-fwd')).toHaveAttribute('aria-disabled', 'false');
  await page.click('#vl-fwd');
  await expect(page.locator('#vl-title')).toHaveText(b);
});

test('the pill hides while the keyboard is up; Back closes the ribbon sheet and the note stays', async ({ phone }) => {
  const page = await phone(vault);
  const { uid } = await signIn(page);
  const a = uniq('A');
  await put(uid, a, 'text');
  await expect.poll(() => page.evaluate(t => window.starter.vault?.open(t), a)).toBe(true);
  await expect(page.locator('#vl-nav')).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add('ui-keyboard-open'));
  await expect(page.locator('#vl-nav')).toBeHidden();
  expect(await page.locator('#vl-nav').evaluate(n => /** @type {HTMLElement} */ (n).inert)).toBe(true);
  await page.evaluate(() => document.documentElement.classList.remove('ui-keyboard-open'));
  await expect(page.locator('#vl-nav')).toBeVisible();

  await page.click('#vl-ribbon');
  await expect(page.locator('#vl-ribbon-sheet')).toBeVisible();
  await expect(page.locator('#vl-rib-settings')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#vl-ribbon-sheet')).toBeHidden();
  await expect(page.locator('#vl-title')).toHaveText(a);
  await expect(page.locator('#edit')).toBeVisible();
});

test('Core plugins: the Tab bar extra brings the tab bar back; Layout to Classic loads the Classic layout', async ({ phone }) => {
  const page = await phone(vault);
  await signIn(page);
  await expect(page.locator('#vl-empty')).toBeVisible();
  await expect(page.locator('#tabbar')).toBeHidden();
  await page.click('#vl-ribbon');
  await page.click('#vl-rib-settings');
  await expect(page.locator('#vl-settings')).toBeVisible();
  await page.click('#vl-set-go-plugins');
  await expect(page.locator('#opt-pDaily')).toBeChecked();
  await expect(page.locator('#opt-xTabBar')).not.toBeChecked();
  await page.locator('#opt-xTabBar').check();
  await expect(page.locator('#tabbar')).toBeVisible();

  await page.goBack();   // the page, then
  await page.click('#vl-set-go-appearance');
  await page.locator('#opt-layout').selectOption({ label: 'Classic layout' });
  await expect(page.locator('#tab-notes')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.layout)).toBe('classic');
  await expect(page.locator('#vl-nav')).toHaveCount(0);
});
