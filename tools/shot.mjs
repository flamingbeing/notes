// Dev tool: a PNG of one of the app's screens at iPhone size (390x844, 3x), signed in as a made-up account on the
// Firestore emulator with sample notes, no real sign-in and no network but the UI kit (served from node_modules/app-ui).
//
//   node tools/shot.mjs <out.png> [--dark] [--tab home|folders|haiku|settings] [--note <title>] [--settings <page title>]
//                       [--role member|admin|viewer] [--opt key=<json>]... [--seed <file.json>]
//                       [--click <selector>]... [--eval <js in the page>]... [--wait <ms>] [--full]
//                       [--width 390 --height 844 --dpr 3] [--ui <app-ui dir>] [--keep]
//
// --tab: a tab's page id (default the first screen, the notes list). --note: open that note (its title, on the list).
// --settings: open the Settings tab, then that page (its menu row's title, start of the words). --role: the signed-in
// role (default member; Haiku needs admin). --opt: a device option set before the app starts (key=<json>, e.g.
// --opt bigRows=true), kept in localStorage as @core/settings keeps device values. --click / --eval run in order after
// that (a sheet, a swipe, a menu); --wait pauses; --full is the whole page.
// --seed: { "<firestore doc path>": { fields } }, default tools/shot-seed.json (made up). "{{today}}", "{{today-1}}" in
// a string become that day (YYYY-MM-DD); "{{now}}" alone is the time in ms, "{{now-90}}" that many minutes ago.
// Starts the emulators (a temp folder, so no log files land in the repo) and the e2e server unless already up, and
// stops what it started (--keep leaves them running, for a quicker next shot; stop them by PID). Needs Java,
// PW_CHROMIUM (tools/dev-setup.sh) and `npm ci`. Made-up data only; never a live project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { fsAdmin, waitForEmulators, waitFor } from '../.devkit/playwright/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opts = { click: /** @type {string[]} */ ([]), eval: /** @type {string[]} */ ([]), opt: /** @type {string[]} */ ([]) };
const out = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv.shift()) : '';
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (['dark', 'full', 'keep'].includes(k)) opts[k] = true;
  else if (['click', 'eval', 'opt'].includes(k)) opts[k].push(argv[++i]);
  else opts[k] = argv[++i];
}
if (!out) { console.error('usage: node tools/shot.mjs <out.png> [--dark] [--tab home|folders|haiku|settings] [--note <title>] [--settings <title>] [--opt key=json] [--click sel]... [--wait ms] [--full]'); process.exit(2); }

const PORT = Number(opts.port || 4173);
// emulator ports: the usual 8080 / 9099, or the hosts in FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (swift has
// another service on 8080: export FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199)
const FS = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const port = h => Number(h.split(':').pop());
const UI_DIR = path.resolve(opts.ui || path.join(ROOT, 'node_modules/app-ui'));
const CORE = path.join(ROOT, 'e2e/fixtures/core');
const started = /** @type {import('node:child_process').ChildProcess[]} */ ([]);
const up = url => fetch(url).then(r => r.status < 500, () => false);

// the emulators, from a temp folder (firebase writes its debug logs to the folder it runs in)
if (!(await up(`http://${AUTH}`)) || !(await up(`http://${FS}`))) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-emu-'));
  // (a config with these ports and the app's rules file)
  fs.writeFileSync(path.join(cwd, 'firebase.json'), JSON.stringify({ firestore: { rules: path.join(ROOT, 'app/firestore.rules') },
    emulators: { firestore: { port: port(FS) }, auth: { port: port(AUTH) }, ui: { enabled: false } } }));
  started.push(spawn('npx', ['-y', 'firebase-tools@15.33.0', 'emulators:start', '--only', 'firestore,auth', '--project', 'demo-notes'], { cwd, stdio: 'ignore', detached: true, env: { ...process.env, METADATA_SERVER_DETECTION: 'none' } }));
  await waitForEmulators(['firestore', 'auth'], { timeout: 180_000 });
}
// the e2e server (the real Worker in Node)
if (!(await up(`http://localhost:${PORT}/app/`))) {
  started.push(spawn('node', ['e2e/serve.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore', detached: true }));
  await waitFor(() => up(`http://localhost:${PORT}/app/`), { timeout: 30_000, message: 'e2e server' });
}
// (a process group: npx's child, firebase's and the emulators' Java all go with it)
const stop = () => { for (const p of started) { try { process.kill(-(/** @type {number} */ (p.pid)), 'SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop);

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const serve = (root, rel) => {
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return { status: 404, body: `not in ${root}: ${rel}` };
  return { status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) };
};

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: Number(opts.width || 390), height: Number(opts.height || 844) }, deviceScaleFactor: Number(opts.dpr || 3),
    isMobile: true, hasTouch: true, colorScheme: opts.dark ? 'dark' : 'light', locale: 'en-US',
  });
  await context.addInitScript(() => {
    const { get, set } = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    Object.defineProperty(HTMLScriptElement.prototype, 'src', { configurable: true, get, set(url) {
      if (/^https:\/\/apis\.google\.com\//.test(url)) return void setTimeout(() => this.dispatchEvent(new Event('error')));
      set.call(this, url);
    } });
    try { localStorage.setItem('core-glass-guard', JSON.stringify({ solid: false, why: '' })); } catch { /* opaque origin */ }
  });
  // device options (--opt key=json): written where @core/settings keeps them (localStorage 'notes:settings:settings/device'), before the app starts
  if (opts.opt.length) {
    const values = Object.fromEntries(opts.opt.map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), JSON.parse(kv.slice(i + 1))]; }));
    await context.addInitScript(v => { try { if (!localStorage.getItem('notes:settings:settings/device')) localStorage.setItem('notes:settings:settings/device', JSON.stringify({ v: 1, values: v })); } catch { /* opaque origin */ } }, values);
  }
  // the kit from node_modules/app-ui (same version as the import map), sync/update from e2e/fixtures/core, nothing else online
  await context.route(/^https:\/\/core\.anawj\.com\/(.*)$/, route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname);
    return route.fulfill(rel.startsWith('/ui/') ? serve(UI_DIR, rel.split('/').slice(3).join('/')) : serve(CORE, rel));
  });
  await context.route('https://design.flamingbeing.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route(/^https:\/\/(apis|www)\.google\.com\//, route => route.abort('blockedbyclient'));
  const page = await context.newPage();
  page.on('pageerror', e => console.error('page error:', e.message, process.env.SHOT_STACK ? e.stack : ''));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });

  // sign in as a made-up member
  const db = fsAdmin('demo-notes');
  await page.goto(`http://localhost:${PORT}/app/?emulator=${port(FS)}:${port(AUTH)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signed-out', { state: 'visible' });
  await page.evaluate(e => window.starter.signInAs(e), `shot-${Date.now().toString(36)}@example.com`);
  await page.waitForSelector('#no-access', { state: 'visible' });
  const uid = (await page.locator('#uid').textContent()) || '';
  await db.put(`members/${uid}`, { role: opts.role || 'member', v: 1 });
  await page.waitForSelector('#list-view', { state: 'visible' });

  // sample data (the seed's paths name spaces/_/...: they go to this person's own vault, spaces/<uid>/...)
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fill = v => typeof v === 'string'
    ? (/^\{\{now(?:-(\d+))?\}\}$/.test(v) ? Date.now() - 60_000 * Number(/^\{\{now(?:-(\d+))?\}\}$/.exec(v)?.[1] || 0)
      : v.replace(/\{\{today(?:([+-]\d+))?\}\}/g, (_, n) => day(Number(n || 0))))
    : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  const seed = JSON.parse(fs.readFileSync(path.resolve(opts.seed || path.join(ROOT, 'tools/shot-seed.json')), 'utf8'));
  for (const [p, doc] of Object.entries(seed)) {
    const f = fill(doc);
    const to = p.replace(/^spaces\/_\//, `spaces/${uid}/`);
    await db.put(to, { updatedAt: Date.now(), ...f });
  }
  await page.waitForFunction(() => window.starter.ready === true);
  await page.waitForTimeout(800);

  // the screen
  if (opts.tab && opts.tab !== 'home') {
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.ui-tabbar')?.classList.remove('is-minimised'); });
    await page.locator(`.ui-tab[data-tab-page="#${opts.tab}"]:visible, .ui-side-link[data-tab-page="#${opts.tab}"]:visible`).first().click();
    await page.waitForTimeout(500);
  }
  if (opts.settings) {
    await page.locator('#open-settings:visible, #open-settings-w:visible').first().click();
    await page.waitForTimeout(500);
    const back = page.locator('.ui-settings-back:visible');
    if (await back.count()) await back.first().click();
    await page.locator('.ui-settings-menu-groups .ui-settings-go').filter({ hasText: new RegExp(`^${opts.settings}`) }).first().click();
    await page.waitForTimeout(500);
  }
  if (opts.note) {
    await page.locator('#items .ui-row').filter({ hasText: opts.note }).first().click();
    await page.waitForSelector('#edit[open]');
    await page.waitForTimeout(900);
  }
  for (const c of opts.click) { await page.locator(c).first().click(); await page.waitForTimeout(400); }
  for (const e of opts.eval) { await page.evaluate(e); await page.waitForTimeout(300); }
  await page.waitForTimeout(Number(opts.wait || 300));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: !!opts.full });
  console.log(`shot: ${out}`);
  if (opts.keep) { console.log('--keep: emulators and server left running'); started.length = 0; }
} finally {
  await browser?.close();
  stop();
}
