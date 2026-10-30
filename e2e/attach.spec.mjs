// Attachments and vaults: add a picture to a note (button, paste, drop), see it in the read view, move a note with its
// files, import a made-up Obsidian vault (folder and zip; dry run first, never over what is there) and export a zip.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { test, expect, signIn, add, openNote, synced, uniq, drawer, details, toNotes, reveal } from './fixtures.mjs';

const VAULT = path.resolve('e2e/fixtures/vault');
const PNG = path.join(VAULT, 'Ideas/img/sprout.png');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'notes-e2e-'));

test('a picture added to a note shows in the read view; paste and drop add files too', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const t = uniq('pics');
  await add(a, t);
  await openNote(a, t);
  await a.setInputFiles('#edit-attach-input', PNG);
  await expect(a.locator('#edit-files li')).toHaveCount(1, { timeout: 15_000 });
  await expect(a.locator('#edit-files')).toContainText('sprout.png');
  await expect(a.locator('#edit-body')).toHaveValue(/!\[\[sprout\.png\]\]/);
  // read view: the picture itself
  await expect(a.locator('html')).toHaveAttribute('data-editor', 'ready');
  await a.click('#edit-mode');
  await expect(a.locator('#edit-read img').first()).toBeVisible({ timeout: 15_000 });
  expect(await a.locator('#edit-read img').first().evaluate(i => i.naturalWidth)).toBeGreaterThan(0);

  // a dropped file
  const dropped = await a.evaluate(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'notes.pdf', { type: 'application/pdf' }));
    document.querySelector('#edit').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return true;
  });
  expect(dropped).toBe(true);
  await expect(a.locator('#edit-files li')).toHaveCount(2, { timeout: 15_000 });
  await expect(a.locator('#edit-files')).toContainText('notes.pdf');
});

test('a note moves with its attachments', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const name = uniq('Space'), t = uniq('carry');
  await drawer(a, '#space-new');
  await a.fill('#space-new-name', name);
  await a.click('#space-new-make');
  await expect(a.locator('#space option', { hasText: name })).toHaveCount(1, { timeout: 15_000 });
  await add(a, t);
  await openNote(a, t);
  await a.setInputFiles('#edit-attach-input', PNG);
  await expect(a.locator('#edit-files li')).toHaveCount(1, { timeout: 15_000 });
  await expect(a.locator('#edit-files')).not.toContainText('(uploading)', { timeout: 30_000 });   // a move waits for stored files
  await a.locator('#edit button[value=close]').click();
  await synced(a);
  await expect.poll(() => a.evaluate(() => window.starter.status)).toBe('synced');
  await openNote(a, t);
  await details(a);
  await a.selectOption('#edit-move', { label: name });
  await a.click('#edit-move-go');
  await a.getByRole('button', { name: 'Move', exact: true }).last().click();
  await expect(a.locator('#edit')).toBeHidden({ timeout: 15_000 });
  await toNotes(a);
  await a.selectOption('#space', { label: name });
  await openNote(a, t);
  await expect(a.locator('#edit-files li')).toHaveCount(1, { timeout: 15_000 });
  await expect(a.locator('#edit-files')).toContainText('sprout.png');
});

test('import a vault from a folder: a dry run first; a second run adds nothing; export gives a zip', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await a.click('#open-settings');
  await reveal(a, '#open-transfer');
  await a.click('#open-transfer');
  await expect(a.locator('#transfer')).toBeVisible();
  await a.setInputFiles('#transfer-folder', VAULT);
  await expect(a.locator('#transfer-plan')).toHaveText('3 notes, 1 file; 1 skipped (1 app folder)');
  await expect(a.locator('#transfer-skipped')).toContainText('.obsidian/app.json');
  await a.click('#transfer-go');
  await expect(a.locator('#transfer-msg')).toContainText('Imported 3 notes and 1 files', { timeout: 30_000 });
  await a.click('#transfer-close');
  await expect(a.locator('#items')).toContainText('Garden plan');
  await expect(a.locator('#items')).toContainText('Welcome');
  await synced(a);

  // again: everything is there, so nothing would be added
  await a.click('#open-settings');
  await reveal(a, '#open-transfer');
  await a.click('#open-transfer');
  await a.setInputFiles('#transfer-folder', VAULT);
  await expect(a.locator('#transfer-plan')).toHaveText(/^0 notes, 0 files; 5 skipped \(4 already there, 1 app folder\)$/);
  await expect(a.locator('#transfer-go')).toBeHidden();

  // export
  const [download] = await Promise.all([a.waitForEvent('download'), a.click('#transfer-export')]);
  const zip = unzipSync(new Uint8Array(fs.readFileSync(await download.path())));
  expect(Object.keys(zip).sort()).toEqual(['Daily/2026-01-02.md', 'Ideas/Garden plan.md', 'Ideas/img/sprout.png', 'Welcome.md']);
  expect(new TextDecoder().decode(zip['Welcome.md'])).toContain('[[Ideas/Garden plan]]');
  expect(zip['Ideas/img/sprout.png'].length).toBeGreaterThan(0);
});

test('import a vault from a zip (one top folder, a path that tries to leave it is skipped)', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const files = {
    'My vault/Zipped one.md': new TextEncoder().encode('# one\n'),
    'My vault/sub/Zipped two.md': new TextEncoder().encode('two [[Zipped one]]\n'),
    'My vault/.obsidian/x.json': new TextEncoder().encode('{}'),
    '../evil.md': new TextEncoder().encode('no'),
  };
  const zipPath = path.join(tmp(), 'vault.zip');
  fs.writeFileSync(zipPath, zipSync(files));
  await a.click('#open-settings');
  await reveal(a, '#open-transfer');
  await a.click('#open-transfer');
  await a.setInputFiles('#transfer-zip', zipPath);
  await expect(a.locator('#transfer-plan')).toHaveText('2 notes, 0 files; 2 skipped (1 unsafe path, 1 app folder)');
  await a.click('#transfer-go');
  await expect(a.locator('#transfer-msg')).toContainText('Imported 2 notes', { timeout: 30_000 });
  await a.click('#transfer-close');
  await expect(a.locator('#items')).toContainText('Zipped two');
});
