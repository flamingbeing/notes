// Shared steps for the specs. Every test uses its own made-up accounts (so its own vault) and its own note titles, so
// tests run side by side. A page that reports a Content-Security-Policy violation fails its test.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fsAdmin } from '../.devkit/playwright/helpers.mjs';

export const db = fsAdmin('demo-notes');
export const APP = '/app/?emulator';
export const uniq = (p = 't') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// SYNC_DIR: a local app-sync build (its entry files and src/) served in place of core.anawj.com/sync/<version>/, so
// app-sync's CI can run these tests against a candidate before it is released (its consumer-test job).
const SYNC_DIR = process.env.SYNC_DIR ? path.resolve(process.env.SYNC_DIR) : '';
async function routeSync(context, served) {
  await context.route(/^https:\/\/core\.anawj\.com\/sync\/[^/]+\/(.+)$/, route => {
    const rel = new URL(route.request().url()).pathname.split('/').slice(3).join('/');
    const file = path.join(SYNC_DIR, rel);
    if (!file.startsWith(SYNC_DIR + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not in SYNC_DIR' });
    served.n++;
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
}

// The page loads its modules live from core.anawj.com (the import map). One failed fetch there (a 5xx, a reset) leaves the
// app unbooted, which the tests see as #signed-out staying hidden (3 of 68 phone tests on notes#33, nothing in the code
// changed). So a failed fetch is tried again; after that the page's own request goes out as it would have.
async function routeCoreRetry(context) {
  await context.route(/^https:\/\/core\.anawj\.com\//, async route => {
    for (let i = 0; i < 3; i++) {
      let response = null;
      try { response = await route.fetch({ timeout: 8_000 }); } catch { /* retry */ }
      if (response && response.status() < 500) return route.fulfill({ response }).catch(() => {});   // closed page: nothing to serve
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
    await route.continue().catch(() => {});
  });
}

export const test = base.extend({
  // a new phone: its own browser context; CSP reports collected for the check after the test
  phone: async ({ browser }, use) => {
    const made = [];
    await use(async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.__csp = [];
        addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const served = { n: 0, built: 0 };
      await routeCoreRetry(context);
      if (SYNC_DIR) await routeSync(context, served);   // registered later: wins over the retry route
      // APP_DIR (a Vite build, e2e/serve.mjs): count the built bundle's loads, so the run proves it tested dist/
      if (process.env.APP_DIR) context.on('request', r => { if (/\/app\/assets\/[^/]+\.js$/.test(r.url())) served.built++; });
      const page = await context.newPage();
      made.push({ context, page, served });
      return page;
    });
    for (const { context, page, served } of made) {
      const v = await page.evaluate(() => window.__csp || []).catch(() => []);
      await context.close();
      expect(v, 'CSP violations').toEqual([]);
      if (SYNC_DIR) expect(served.n, 'app-sync files served from SYNC_DIR').toBeGreaterThan(0);
      if (process.env.APP_DIR) expect(served.built, 'the built bundle (APP_DIR) loaded').toBeGreaterThan(0);
    }
  },
});
export { expect };

// Sign in as a new made-up Google account; with a role, an admin "adds" it (the role doc) and the page picks the
// new claims up by itself. -> { uid, email }
export async function signIn(page, role = 'member', { path = APP } = {}) {
  const email = `${uniq('u')}@example.com`;
  await page.goto(path);
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), email);
  await expect(page.locator('#no-access')).toBeVisible();
  const uid = await page.locator('#uid').textContent();
  if (role) {
    await db.put(`members/${uid}`, { role, v: 1 });
    await expect(page.locator('#list-view')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  }
  return { uid, email };
}

// The same account on a second phone (a new context signs in with the same made-up Google credential)
export async function signInAgain(page, email) {
  await page.goto(APP);
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.evaluate(e => window.starter.signInAs(e), email);
  await expect(page.locator('#list-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
}

// A new note by its title: + opens an empty note page with the title box ready; Close makes it and closes the page.
export async function add(page, title) {
  await page.click('#new');
  await expect(page.locator('#edit')).toBeVisible();
  await expect(page.locator('#edit-text')).toBeFocused();
  await page.fill('#edit-text', title);
  await page.locator('#edit button[value=close]').click();
  await expect(page.locator('#items')).toContainText(title);
}
// The Settings sheet opened (it holds the theme switch, the options and Sign out; its button shows once signed in)
export async function openSettings(page) {
  await page.click('#open-settings');
  await expect(page.locator('#settings')).toBeVisible();
}
// The drawer (the bar's ☰) opened, and something in it clicked
export async function drawer(page, selector) {
  await page.click('#drawer-open');
  await page.click(selector);
}
// One folder ('path:<folder>') or tag ('tag:<tag>') picked in the drawer; '' shows all notes
export const showOnly = (page, value) => drawer(page, `#drawer button[data-filter="${value}"]`);
// The open note's Details (folder, links, files, Move) unfolded (they stay as last left on this device)
export async function details(page) {
  const more = page.locator('#edit-more');
  if (!await more.evaluate(d => /** @type {HTMLDetailsElement} */ (d).open)) await more.locator('summary').click();
}
// A note's whole text set at once, as if typed (the editor, once loaded, hides the textarea it writes into; an input
// event on the textarea brings the editor along)
export const fillBody = (page, text) => page.locator('#edit-body').evaluate((el, t) => {
  const a = /** @type {HTMLTextAreaElement} */ (el);
  a.value = t; a.dispatchEvent(new Event('input'));
}, text);
// Open a note from the list (its button's name starts with the title; a folder follows it)
export const openNote = (page, title) => page.locator('#items .ui-row', { hasText: title }).first().click();
export const synced = page => expect.poll(() => page.evaluate(() => window.starter.status), { timeout: 15_000 }).toBe('synced');
// Every note on the server, in every vault and space: [{ path, data }] (db.list leaves document paths out)
export async function serverNotes() {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const r = await fetch(`http://${host}/v1/projects/demo-notes/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notes', allDescendants: true }] } }),
  });
  const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue)
    : 'doubleValue' in v ? v.doubleValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'nullValue' in v ? null : v;
  return (await r.json()).filter(x => x.document).map(({ document: d }) => ({
    path: d.name.split('/documents/')[1],
    data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)])),
  }));
}
// a note with this title (or one whose text has it) is on the server
export const serverHas = (text, { body = false } = {}) => expect.poll(async () => (await serverNotes())
  .some(n => body ? String(n.data.body).includes(text) : n.data.title === text), { timeout: 15_000 }).toBe(true);
// The server path of the note with this title (spaces/<space>/notes/<id>)
export async function notePathOf(title) {
  return (await serverNotes()).find(n => n.data.title === title)?.path;
}
