// Swipe between the tab pages on a phone, with a finger from the DevTools protocol (Chromium): the next page slides in
// beside the finger mid-swipe, quick flicks one after another all count, a finger can catch the gliding pages, and a
// right swipe on Notes (the first page) pulls the side bar out as a drawer with the finger; a left swipe or a tap on
// the shade puts it back. The kit's own tests (app-ui) cover the feel in detail; these check this app wires it.
import { test, expect, signIn } from './fixtures.mjs';

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
const load = async phone => { const page = await phone(); await page.setViewportSize({ width: 390, height: 840 }); await signIn(page); return page; };

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

test('a right swipe on Notes pulls the side bar out with the finger; a left swipe or a tap on the shade closes it', async ({ phone }) => {
  const page = await load(phone);
  const side = page.locator('#side');
  const f = await finger(page);
  await f.move(60, 260, { lift: false });
  await expect.poll(async () => { const b = await side.boundingBox(); return b ? Math.round(b.x + b.width) : null; }, 'out by the finger’s travel').toBe(200);
  expect(await x(page, 'home'), 'Notes stays').toBe(0);
  await f.lift();
  await settled(page);
  await expect(page.locator('#list-view')).toHaveClass(/is-drawer-open/);
  expect(await shown(page)).toEqual(['home']);
  await f.move(350, 120, { steps: 6 });
  await settled(page);
  await expect(page.locator('#list-view')).not.toHaveClass(/is-drawer-(open|moving)/);
  await f.move(60, 300, { steps: 6 });
  await settled(page);
  await expect(page.locator('#list-view')).toHaveClass(/is-drawer-open/);
  await page.locator('.ui-drawer-shade').click({ position: { x: 370, y: 400 } });
  await settled(page);
  await expect(page.locator('#list-view')).not.toHaveClass(/is-drawer-(open|moving)/);
  await expect(side).toBeHidden();
});
