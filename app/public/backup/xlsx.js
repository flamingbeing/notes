// The backup as an Excel file and back, with SheetJS (vendored, loaded by `import('xlsx')` only when this is called).
// A cell holds at most 32767 characters, so a long Data cell continues in "Data 2", "Data 3"… and the readable Text
// column is cut; the Data columns are what a restore reads.
import { backupToRows, rowsToBackup, DATA } from './rows.js';

const CELL = 30000;
const TEXT = 4;

/** @param {string[][]} rows @returns {string[][]} */
function fit(rows) {
  const parts = rows.map(r => r[DATA].match(new RegExp(`[^]{1,${CELL}}`, 'g')) || ['']);
  const width = Math.max(...parts.map(p => p.length));
  return rows.map((r, i) => {
    const head = r.slice(0, DATA).map((c, k) => (k === TEXT && c.length > CELL ? c.slice(0, CELL) + '…' : c));
    const extra = Array.from({ length: width - 1 }, (_, k) => parts[i][k + 1] ?? (i ? '' : `Data ${k + 2}`));
    return [...head, parts[i][0], ...extra];
  });
}

/** @param {unknown[][]} rows @returns {string[][]} Data and its continuation columns joined into one */
function join(rows) {
  const head = (rows[0] || []).map(h => String(h).trim());
  const from = head.indexOf('Data');
  if (from < 0) return /** @type {string[][]} */ (rows.map(r => r.map(String)));
  let to = from + 1;
  while (/^Data \d+$/.test(head[to] || '')) to++;
  return rows.map((r, i) => [...r.slice(0, from).map(String), i ? r.slice(from, to).map(c => String(c ?? '')).join('') : 'Data', ...r.slice(to).map(String)]);
}

/** @param {import('./types').Backup} data @returns {Promise<Uint8Array>} */
export async function backupToXlsx(data) {
  const X = await import('xlsx');
  const book = X.utils.book_new();
  X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(fit(backupToRows(data))), 'Notes');
  return new Uint8Array(X.write(book, { bookType: 'xlsx', type: 'array', compression: true }));
}

/** @param {Uint8Array} bytes @returns {Promise<ReturnType<typeof rowsToBackup>>} */
export async function xlsxToBackup(bytes) {
  const X = await import('xlsx');
  let book;
  try { book = X.read(bytes, { type: 'array' }); } catch { throw new Error('That file can’t be opened (not an Excel file).'); }
  const sheet = book.Sheets[book.SheetNames[0]];
  return rowsToBackup(join(X.utils.sheet_to_json(sheet, { header: 1, defval: '' })));
}
