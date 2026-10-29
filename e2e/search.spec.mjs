// @core/search on the notes: the box filters the list (titles, text and tags), a phrase, -word, an operator and a
// misspelt operator
// behave, "/" focuses the box, and the page passes axe with a query typed.
import { test, expect, signIn, add, uniq } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

// the add form clears itself a moment after the note shows; wait for that before the next one. A toast lasts 4 s and an
// earlier add can still have its own on screen, so wait for a new "Added" toast to be put on the page (watched from before
// the add) instead of looking for one afterwards, when it may be gone or there may be two.
const addOne = async (page, text) => {
  const toasted = page.evaluate(() => new Promise(done => {
    const watch = new MutationObserver(records => {
      if (records.some(r => [...r.addedNodes].some(n => n instanceof Element && n.matches('.toast') && /Added/.test(n.textContent || '')))) { watch.disconnect(); done(true); }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  }));
  await add(page, text);
  expect(await toasted).toBe(true);
};
// each row's title (and folder), without a search result's passage
const shown = page => page.locator('#items .ui-row').evaluateAll(rows => rows.map(r => [...r.querySelector('.ui-row-main').childNodes].filter(n => !(n instanceof Element && n.matches('.row-snippet'))).map(n => n.textContent).join('')));

test('the search box narrows the list, with phrase, leave-out, operators and a hint', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const tag = uniq('s').replace(/[^a-z]/g, '');
  await addOne(a, `${tag} spinal for knee`);
  expect(await a.evaluate(t => window.starter.add(t, 'the plan: #urgent and a bodyonlyword'), `${tag} epidural for hip, 12 hours`)).toBe('');
  await addOne(a, `${tag} spinal day surgery`);
  const q = a.locator('#q');

  await q.fill(`${tag} spinal`);
  await expect.poll(() => shown(a)).toHaveLength(2);
  await expect(a.locator('#count')).toHaveText('2 of 3 notes');

  await q.fill(`${tag} -spinal`);
  await expect.poll(() => shown(a)).toEqual([`${tag} epidural for hip, 12 hours`]);

  await q.fill(`"${tag} spinal day"`);
  await expect.poll(() => shown(a)).toEqual([`${tag} spinal day surgery`]);

  await q.fill(`${tag} tag:urgent`);
  await expect.poll(() => shown(a)).toEqual([`${tag} epidural for hip, 12 hours`]);

  await q.fill('bodyonlyword');
  await expect.poll(() => shown(a)).toEqual([`${tag} epidural for hip, 12 hours`]);

  await q.fill(`${tag} pth:work`);
  await expect(a.locator('#search-msg')).toHaveText('Did you mean path:?');

  await q.fill(`${tag} nothing-like-this`);
  await expect(a.locator('#search-msg')).toHaveText('No matches');

  await q.fill('');
  await expect(a.locator('#count')).toHaveText('3 notes');
  expect((await shown(a)).filter(t => t.startsWith(tag))).toHaveLength(3);
});

test('"/" focuses the search box; axe passes with a query typed', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  // (the "Added" toast springs in once the note is made: wait for that, so axe's wait for animations covers it)
  await addOne(a, uniq('axe'));
  await a.locator('body').press('/');
  await expect(a.locator('#q')).toBeFocused();
  await a.fill('#q', 'tag:none');
  expect(await AxeBuilder(a)).toEqual([]);
});

test('a result shows the passage with the searched word, marked, in place of the note’s start', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const tag = uniq('p').replace(/[^a-z]/g, '');
  const body = `Shopping for the weekend trip. ${'Bread, milk, apples and more. '.repeat(6)}Remember the ${tag}lantern before leaving on Saturday morning.`;
  expect(await a.evaluate(([t, b]) => window.starter.add(t, b), [`Trip ${tag}`, body])).toBe('');
  const row = a.locator('#items .ui-row', { hasText: `Trip ${tag}` });
  await expect(row).toBeVisible();
  await expect(row.locator('.row-snippet')).toHaveCount(0);
  await a.locator('#q').fill(`${tag}lan`);
  const mark = row.locator('.row-snippet mark');
  await expect(mark).toHaveText(`${tag}lantern`);
  await expect(row.locator('.row-snippet')).toContainText('Remember the');
  await expect(row.locator('.row-snippet')).not.toContainText('Shopping');
  const lines = await row.locator('.row-snippet').evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeLessThanOrEqual(2);
  // the box cleared: the note's start again
  await a.locator('#q').fill('');
  await expect(row.locator('.row-snippet')).toHaveCount(0);
});
