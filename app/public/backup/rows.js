// The backup as rows of text, the shape CSV and xlsx share: readable columns, and a Data column holding each record in
// full as JSON, which a restore reads (so a round trip loses nothing). Pure (tested in app/test/backup.unit.test.mjs).
import { FORMAT, checkBackup } from './backup.js';

export const COLUMNS = ['Kind', 'ID', 'Folder', 'Title', 'Text', 'Tags', 'Updated', 'Data'];
export const DATA = COLUMNS.indexOf('Data');
const stamp = (/** @type {unknown} */ ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') : '');

/** @param {import('./types').Backup} data @returns {string[][]} the header, a row for the backup itself, then a row per note and file */
export function backupToRows(data) {
  const { notes, files, ...meta } = data;
  const rows = [COLUMNS, ['backup', '', '', meta.space?.name || '', '', '', meta.exportedAt, JSON.stringify(meta)]];
  for (const n of /** @type {Record<string, any>[]} */ (notes)) {
    rows.push(['note', n.id, n.path || '', n.title || '', n.body || '', (n.tags || []).join('; '), stamp(n.updatedAt), JSON.stringify(n)]);
  }
  for (const f of files) rows.push(['file', f.id, f.path || '', f.name, '', '', '', JSON.stringify(f)]);
  return rows;
}

/** Back to the backup object. Rows whose Data can't be read are counted, not guessed at; null when the headings aren't ours.
 * @param {unknown[][]} rows @returns {(import('./types').Backup & { skipped: number }) | null} */
export function rowsToBackup(rows) {
  const head = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  const kindAt = head.indexOf('kind'), dataAt = head.indexOf('data');
  if (kindAt < 0 || dataAt < 0) return null;
  const out = { format: FORMAT, version: 1, exportedAt: '', space: null, settings: null, notes: /** @type {any[]} */ ([]), files: /** @type {any[]} */ ([]), skipped: 0 };
  for (const r of rows.slice(1)) {
    const kind = String(r[kindAt] ?? '').trim().toLowerCase();
    if (!kind) continue;
    let d;
    try { d = JSON.parse(String(r[dataAt])); } catch { d = null; }
    if (!d || typeof d !== 'object') out.skipped++;
    else if (kind === 'backup') Object.assign(out, d, { notes: out.notes, files: out.files });
    else if (kind === 'note') out.notes.push(d);
    else if (kind === 'file') out.files.push(d);
    else out.skipped++;
  }
  return /** @type {any} */ ({ ...checkBackup(out), skipped: out.skipped });
}
