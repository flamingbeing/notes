// Backup: a space's notes as one file (.json.gz, CSV, Excel) and a restore into another account that only adds; a second
// restore adds nothing (the dry run says so), and the spreadsheets read back as the same backup.
import fs from 'node:fs';
import { test, expect, signIn, add, synced, uniq, serverHas, reveal } from './fixtures.mjs';

const OPEN = async page => { await page.click('#open-settings'); await reveal(page, '#open-transfer'); await page.click('#open-transfer'); await expect(page.locator('#transfer')).toBeVisible(); };

async function saveAs(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return { name: download.suggestedFilename(), path: await download.path() };
}

test('back up to .json.gz, CSV and Excel; restore into another account only adds, and says so the second time', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  const t1 = uniq('bk-one'), t2 = uniq('bk-two');
  await add(a, t1);
  await add(a, t2);
  await synced(a);
  await OPEN(a);
  const gz = await saveAs(a, '#backup-save');
  expect(gz.name).toMatch(/^notes-backup-\d{4}-\d\d-\d\d\.json\.gz$/);
  const csv = await saveAs(a, '#backup-csv');
  const xlsx = await saveAs(a, '#backup-xlsx');
  expect([csv.name, xlsx.name].map(n => n.split('.').pop())).toEqual(['csv', 'xlsx']);
  expect(fs.readFileSync(csv.path, 'utf8')).toContain(t1);

  const b = await phone();
  await signIn(b, 'member');
  await synced(b);
  await OPEN(b);
  await b.setInputFiles('#backup-file', gz.path);
  await expect(b.locator('#backup-plan')).toContainText('Adds 2 notes');
  await b.click('#backup-go');
  await expect(b.locator('#backup-msg')).toContainText('Restored 2 notes', { timeout: 30_000 });
  await b.click('#transfer-close');
  await expect(b.locator('#items')).toContainText(t1);
  await expect(b.locator('#items')).toContainText(t2);
  await serverHas(t2);

  // the spreadsheets hold the same notes: nothing is added a second time
  await OPEN(b);
  for (const file of [gz, csv, xlsx]) {
    await b.setInputFiles('#backup-file', file.path);
    await expect(b.locator('#backup-plan')).toContainText('Nothing to add; 2 already here, kept as they are', { timeout: 15_000 });
    await expect(b.locator('#backup-go')).toBeHidden();
  }
});

test('a file that is not a backup says so and changes nothing', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await OPEN(a);
  await a.setInputFiles('#backup-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(a.locator('#backup-msg')).toContainText('isn’t a backup from this app');
  await expect(a.locator('#backup-go')).toBeHidden();
});
