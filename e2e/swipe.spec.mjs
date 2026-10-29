// Swipe between the tab pages on a phone, with a finger from the DevTools protocol (Chromium): the next page slides in
// beside the finger mid-swipe, quick flicks one after another all count, a finger can catch the gliding pages, and a
// right swipe on Notes (the first page) only stretches it: no drawer comes out (it took swipes meant to change tab). The kit's own tests (app-ui) cover the feel in detail; these check this app wires it.
import { test, expect, signIn, add, openNote, fillBody, serverHas } from './fixtures.mjs';

const Y = 560;
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  return {
    async move(x0, x1, { steps = 10, ms = 16, lift = true } = {}) {
      await send('touchStart', x0, Y);
      for (let i = 1; i <= steps; i++) { await send('touchMove', x0 + (x1 - x0) * i / steps, Y); await page.waitForTimeout(ms); }
      if (lift) await send('touchEnd', 0, 0);
    },
    lift: () => send('touchEnd', 0, 0),
  };
}
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
const shown = page => page.evaluate(() => [...document.querySelectorAll('.ui-screens > .ui-screen')].filter(s => !s.hidden).map(s => s.id));
const x = (page, id) => page.evaluate(i => Math.round(/** @type {HTMLElement} */ (document.getElementById(i)).getBoundingClientRect().x), id);
const load = async phone => { const page = await phone(); await page.setViewportSize({ width: 390, height: 840 }); await signIn(page); await settled(page); return page; };   // (settled: the sign-in's view transition covers the page, and a touch on it goes nowhere)

test('mid-swipe the next page slides in beside the finger; let go past half, it lands', async ({ phone }) => {
  const page = await load(phone);
  const f = await finger(page);
  await f.move(300, 80, { lift: false });
  await expect.poll(() => x(page, 'home')).toBe(-220);
  expect(await x(page, 'folders'), 'Folders beside Notes').toBe(170);
  await f.lift();
  await settled(page);
  expect(await shown(page)).toEqual(['folders']);
});

test('quick flicks one after another all count', async ({ phone }) => {
  const page = await load(phone);
  const f = await finger(page);
  for (let i = 0; i < 2; i++) { await f.move(320, 160, { steps: 4, ms: 8 }); await page.waitForTimeout(40); }
  await settled(page);
  expect(await shown(page)).toEqual(['settings']);
});

test('a finger on the gliding pages holds them where they are', async ({ phone }) => {
  const page = await load(phone);
  const f = await finger(page);
  await f.move(300, 100, { steps: 20 });
  await page.waitForTimeout(50);
  await f.move(200, 200, { steps: 1, ms: 0, lift: false });
  const a = await x(page, 'folders');
  await page.waitForTimeout(150);
  expect(await x(page, 'folders'), 'held').toBe(a);
  await f.lift();
  await settled(page);
  expect(await shown(page)).toEqual(['folders']);
});

test('a right swipe on Notes only stretches it: no drawer, and a left swipe after it still changes tab', async ({ phone }) => {
  const page = await load(phone);
  const f = await finger(page);
  await f.move(60, 260);
  await settled(page);
  await expect(page.locator('#list-view')).not.toHaveClass(/is-drawer-(open|moving)/);
  await expect(page.locator('#side')).toBeHidden();
  expect(await shown(page)).toEqual(['home']);
  await f.move(300, 80);
  await settled(page);
  expect(await shown(page)).toEqual(['folders']);
});

// a finger anywhere: a drag from one point to another, or a hold
async function fingerAt(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  return {
    async drag([x0, y0], [x1, y1], { steps = 10, ms = 16 } = {}) {
      await send('touchStart', x0, y0);
      for (let i = 1; i <= steps; i++) { await send('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await page.waitForTimeout(ms); }
      await send('touchEnd', 0, 0);
    },
    async hold([x, y], ms) { await send('touchStart', x, y); await page.waitForTimeout(ms); await send('touchEnd', 0, 0); },
  };
}

test('a swipe on the empty space under a short page still changes tab, on every tab', async ({ phone }) => {
  const page = await load(phone);
  await add(page, 'Made-up note');
  const f = await fingerAt(page);
  const under = await page.evaluate(() => Math.round(document.getElementById('items').getBoundingClientRect().bottom) + 60);
  expect(under, 'room under the list').toBeLessThan(760);
  await f.drag([320, 760], [80, 760]);
  await settled(page);
  expect(await shown(page)).toEqual(['folders']);
  await f.drag([320, 760], [80, 760]);
  await settled(page);
  expect(await shown(page)).toEqual(['settings']);
  await f.drag([80, 760], [320, 760]);
  await settled(page);
  expect(await shown(page)).toEqual(['folders']);
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight), 'no page scroll added').toBe(true);
});

test('a swipe right on a note takes it back to the list, saved; not from the left edge, not mostly downward', async ({ phone }) => {
  const page = await load(phone);
  await add(page, 'Swipe test note');
  await openNote(page, 'Swipe test note');
  await expect(page.locator('#edit')).toBeVisible();
  await fillBody(page, 'Made-up words to keep');
  const f = await fingerAt(page);
  // from the edge: the phone's own Back owns it, the page stays
  await f.drag([8, 400], [300, 400]);
  await settled(page);
  await expect(page.locator('#edit')).toBeVisible();
  // mostly downward: a scroll, the page stays
  await f.drag([100, 300], [160, 600]);
  await settled(page);
  await expect(page.locator('#edit')).toBeVisible();
  // a short drag let go slowly springs back
  await f.drag([100, 400], [160, 400], { steps: 6, ms: 60 });
  await page.waitForTimeout(300);
  await expect(page.locator('#edit')).toBeVisible();
  expect(await page.locator('#edit').evaluate(d => d.style.transform)).toBe('');
  // mid-swipe the page follows the finger
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 400 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80 + i * 20, y: 400 }] }); await page.waitForTimeout(16); }
  expect(await page.locator('#edit').evaluate(d => Math.round(d.getBoundingClientRect().x)), 'the page under the finger').toBeGreaterThan(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#edit')).toBeHidden();
  await expect(page.locator('#home')).toBeVisible();
  await serverHas('Made-up words to keep', { body: true });
});

test('a hold on a note starts select mode with it ticked (no menu); Select all then takes both; a right-click still opens the menu', async ({ phone }) => {
  const page = await load(phone);
  await add(page, 'Held note one');
  await add(page, 'Held note two');
  const row = page.locator('#items .ui-row', { hasText: 'Held note one' }).first();
  const b = await row.boundingBox();
  const f = await fingerAt(page);
  await f.hold([b.x + 60, b.y + b.height / 2], 700);
  await expect(page.locator('#items')).toHaveClass(/is-editing/);
  await expect(page.locator('.ui-menu')).toHaveCount(0);
  await expect(page.locator('#items [aria-selected=true]')).toHaveCount(1);
  await expect(page.locator('#edit')).toBeHidden();
  await page.locator('[data-select-all="#items"]').click();
  await expect(page.locator('#items [aria-selected=true]')).toHaveCount(2);
  // a right-click (a mouse) still gives the row's menu
  await page.keyboard.press('Escape');
  await expect(page.locator('#items')).not.toHaveClass(/is-editing/);
  await row.click({ button: 'right' });
  await expect(page.locator('.ui-menu[role=menu]')).toBeVisible();
});
