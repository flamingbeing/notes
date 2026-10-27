// @core/backup (incubating here; it moves into app-sync once a second kind of app uses it): a person's data as a file
// they keep, and a restore that only adds what is missing. Named exports only and nothing runs on import, so a build
// keeps only what a page uses.
//   buildBackup, planRestore, restore   the backup object, the dry-run line and the add-only restore (backup.js)
//   packBackup, unpackBackup            the object as a .json.gz file and back (gzip.js)
//   backupToCsv, csvToBackup            one spreadsheet, readable columns plus a Data column (csv.js)
//   backupToXlsx, xlsxToBackup          the same as an Excel file; SheetJS loads only on the call (xlsx.js)
export { FORMAT, buildBackup, checkBackup, planRestore, describePlan, restore } from './backup.js';
export { packBackup, unpackBackup, backupName } from './gzip.js';
export { backupToCsv, csvToBackup, looksLikeCsv } from './csv.js';
export { backupToXlsx, xlsxToBackup } from './xlsx.js';

/** @typedef {import('./types').Item} Item */
/** @typedef {import('./types').Backup} Backup */
/** @typedef {import('./types').RestorePlan} RestorePlan */
/** @typedef {import('./types').RestoreIo} RestoreIo */
