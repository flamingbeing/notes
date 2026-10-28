// The tab pages on a 412 px phone in the band look (look B): nothing above the bar (a signed-in page once left a ~49 px
// strip there), the Settings page's cards all as wide, and a tapped tab slides its page in unless Reduce Motion is on.
import { test, expect, signIn } from './fixtures.mjs';

const band = async page => {
  await page.addInitScript(() => localStorage.setItem('core-theme', JSON.stringify({ look: 'b' })));
  await page.setViewportSize({ width: 412, height: 840 });
  await signIn(page);
};
const tap = (page, id) => page.evaluate(i => /** @type {HTMLElement} */ (document.getElementById(i)).click(), id);

test('nothing above the band on any tab page, and the Settings cards are as wide', async ({ phone }) => {
  const page = await phone();
  await band(page);
  await expect(page.locator('html')).toHaveAttribute('data-header', 'band');
  for (const [id, screen] of [['tab-notes', '#home'], ['drawer-open', '#folders'], ['open-settings', '#settings']]) {
    await tap(page, id);
    await expect(page.locator(screen)).toBeVisible();
    // the bar sits at the safe area's top (0 in the browser, which has none), and the band (the large title) under it
    const bar = await page.locator('.ui-bar').boundingBox();
    expect(bar?.y, `${screen}: bar top`).toBe(0);
    const title = await page.locator(`${screen} .ui-large-title`).boundingBox();
    expect(title?.y, `${screen}: band top`).toBe((bar?.y ?? 0) + (bar?.height ?? 0));
  }
  const widths = await page.locator('#settings-body .ui-settings-group > .ui-list, #settings-body .ui-settings-part > .ui-list')
    .evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  expect(widths.length).toBeGreaterThan(5);
  expect(new Set(widths).size, `card widths ${widths}`).toBe(1);
});

test('a tapped tab slides its page in from its side; Reduce Motion switches without it', async ({ phone }) => {
  const page = await phone();
  await band(page);
  /** starts the tap, then reads what animates the page that arrived */
  const slide = (id, screen) => page.evaluate(async ([i, s]) => {
    document.getElementById(i)?.click();
    await new Promise(r => requestAnimationFrame(r));
    const el = /** @type {HTMLElement} */ (document.querySelector(s));
    return el.getAnimations().map(a => /** @type {KeyframeEffect} */ (a.effect).getKeyframes()[0].transform);
  }, [id, screen]);
  const right = await slide('drawer-open', '#folders');   // Folders is to the right of Notes: starts at the right
  expect(right).toHaveLength(1);
  expect(right[0]).toMatch(/^translateX\(1\d\dpx\)$/);
  await expect(page.locator('#folders')).toBeVisible();
  await page.waitForTimeout(400);
  const left = await slide('tab-notes', '#home');          // and back to the left
  expect(left[0]).toMatch(/^translateX\(-1\d\dpx\)$/);
  await page.waitForTimeout(400);
  expect(await page.locator('.ui-screens').evaluate(e => e.classList.contains('is-tab-sliding'))).toBe(false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await slide('drawer-open', '#folders')).toEqual([]);
  await expect(page.locator('#folders')).toBeVisible();
});
