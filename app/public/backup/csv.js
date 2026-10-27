// The backup as one CSV spreadsheet (Excel opens it) and back. Pure (tested in app/test/backup.unit.test.mjs).
import { backupToRows, rowsToBackup } from './rows.js';

// a readable cell that starts like a formula gets a leading ' so Excel shows it as text (the Data column starts with {)
const cell = (/** @type {unknown} */ v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** @param {import('./types').Backup} data @returns {string} */
export function backupToCsv(data) {
  return '﻿' + backupToRows(data).map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Rows of cells; the separator is the one used most in the first lines (Excel in some countries saves with ;).
 * @param {string} text @returns {string[][]} */
function parseCsv(text) {
  const s = text.replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 10).join('\n');
  const count = (/** @type {string} */ ch) => first.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((x, y) => count(y) - count(x))[0];
  /** @type {string[][]} */ const rows = [];
  let row = [], at = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch !== '"') at += ch;
      else if (s[i + 1] === '"') { at += '"'; i++; } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(at); at = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(at); rows.push(row); row = []; at = '';
    } else at += ch;
  }
  if (at || row.length) { row.push(at); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/** @param {string} text */
export const looksLikeCsv = text => /^﻿?"?Kind"?[,;\t]/.test(text);

/** @param {string} text @returns {ReturnType<typeof rowsToBackup>} */
export const csvToBackup = text => rowsToBackup(parseCsv(text));
