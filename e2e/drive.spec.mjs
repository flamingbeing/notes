// @core/drive on the Drive sheet, against a fake Drive (app/test/fake-drive.mjs answers googleapis.com): off until
// allowed; one tap writes a Markdown file per note; the next tap sends only what changed; the person's edits in Drive
// are kept and merged; the open sheet passes axe. The real Drive is checked by hand after a change (STATUS.md).
import { test, expect, signIn, add, openNote, fillBody, reveal } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';
import { fakeDrive, parseMultipart } from '../app/test/fake-drive.mjs';

// the page's calls to googleapis.com answered by the fake
async function withDrive(page) {
  const drive = fakeDrive();
  await page.route(/^https:\/\/www\.googleapis\.com\//, async route => {
    const req = route.request();
    const { meta, text } = parseMultipart(req.headers()['content-type'], req.postData() || '');
    const r = drive.handle({ method: req.method(), url: req.url(), token: (req.headers().authorization || '').replace('Bearer ', ''), meta: meta || req.postData() || '', text });
    await route.fulfill({ status: r.status, contentType: r.body === undefined ? 'text/markdown' : 'application/json', headers: { 'access-control-allow-origin': '*' }, body: r.body === undefined ? r.text : JSON.stringify(r.body) });
  });
  return drive;
}
const openDrive = async page => { await page.click('#open-settings'); await reveal(page, '#open-drive'); await page.click('#open-drive'); await expect(page.locator('#drive')).toBeVisible(); };

test('off until allowed; Sync now writes a file per note, then only what changed', async ({ phone }) => {
  const a = await phone();
  const drive = await withDrive(a);
  await signIn(a, 'member');
  const title = `Drive ${Date.now().toString(36)}`;
  await add(a, title);
  await expect.poll(() => a.evaluate(t => window.starter.add(t, 'second note body'), `${title} two`)).toBe('');

  await openDrive(a);
  await expect(a.locator('#drive-sync')).toBeHidden();
  expect(drive.calls).toEqual([]);                         // nothing is sent before the person allows it
  await a.click('#drive-on');
  await expect(a.locator('#drive-sync')).toBeVisible();
  expect(drive.calls).toEqual([]);                         // allowing is not syncing
  await a.click('#drive-sync');
  await expect(a.locator('#drive-msg')).toHaveText(/2 written/);
  expect(drive.textOf(`${title}.md`)).toContain('<!-- notes:start');
  expect(drive.textOf(`${title} two.md`)).toContain('second note body');

  drive.calls.length = 0;
  await a.click('#drive-sync');
  await expect(a.locator('#drive-msg')).toHaveText(/0 written/);
  expect(drive.calls).toEqual([]);                         // unchanged notes are not touched
  await expect(a.locator('#drive-last')).toContainText('Last synced');

  // a note edited here and the same file edited in Drive: both kept
  await a.click('#drive-close');
  await openNote(a, `${title} two`);
  await fillBody(a, 'second note body\nadded here');
  await a.locator('#edit button[value=close]').click();
  drive.edit(`${title} two.md`, drive.textOf(`${title} two.md`).replace('second note body', 'second note body (Drive edit)') + '\nmy own words below\n');
  await openDrive(a);
  await a.click('#drive-sync');
  await expect(a.locator('#drive-msg')).toHaveText(/1 written; 1 merged/);
  const file = drive.textOf(`${title} two.md`);
  expect(file).toContain('added here');
  expect(file).toContain('(Drive edit)');
  expect(file).toContain('my own words below');
});

test('turning it off stops the Sync button; the sheet passes axe', async ({ phone }) => {
  const a = await phone();
  await withDrive(a);
  await signIn(a, 'member');
  await openDrive(a);
  expect(await AxeBuilder(a)).toEqual([]);
  await a.click('#drive-on');
  await expect(a.locator('#drive-off')).toBeVisible();
  expect(await AxeBuilder(a)).toEqual([]);
  await a.click('#drive-off');
  await expect(a.locator('#drive-sync')).toBeHidden();
  await expect(a.locator('#drive-on')).toBeVisible();
});
