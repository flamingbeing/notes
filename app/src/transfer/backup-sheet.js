// Backup (#transfer): the open space's notes and settings as one file (.json.gz, or a spreadsheet: CSV, Excel) and a
// restore that only adds what is missing, with a dry-run line first. The file work is @core/backup (pure; SheetJS loads
// only when an Excel file is made or read); this wires it to the sheet.
import { buildBackup, packBackup, unpackBackup, backupName, backupToCsv, csvToBackup, backupToXlsx, xlsxToBackup, planRestore, describePlan, restore } from '@core/backup';
import { $, input } from '../shell/dom.js';
import { download } from '../shell/download.js';
import { OPTIONS } from '../settings/options.js';
import { settingsToAdd } from './backup-settings.js';

const WAIT_MS = 30_000;

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast @param {() => boolean} canWrite */
export function backupSheet(app, toast, canWrite) {
  const msg = $('backup-msg'), plan = $('backup-plan'), go = $('backup-go');
  /** @type {Awaited<ReturnType<typeof unpackBackup>> & { skipped?: number } | null} */ let data = null;
  let busy = false;

  /** @param {unknown} file */
  const addable = file => settingsToAdd(file, k => app.settings.get(k), OPTIONS);
  const have = () => ({ noteIds: app.notes().map(n => n.id), fileIds: app.attachments().map(a => a.id), settingsWouldChange: (/** @type {unknown} */ f) => !!addable(f) });
  const ready = async () => {
    for (const t0 = Date.now(); !app.serverCopyIn(); await new Promise(r => setTimeout(r, 250))) if (Date.now() - t0 > WAIT_MS) return false;
    return true;
  };
  const reset = () => { data = null; plan.textContent = ''; go.hidden = true; msg.textContent = ''; input('backup-file').value = ''; };
  const snapshot = () => {
    const space = app.space();
    return buildBackup({
      notes: app.notes(), files: app.attachments(), settings: JSON.parse(app.settings.exportFile()),
      space: { id: space.id, name: space.name },
    });
  };

  /** @param {string} label @param {() => Promise<void>} job */
  const run = async (label, job) => {
    if (busy) return;
    busy = true; msg.textContent = label;
    try { await job(); } catch (e) { msg.textContent = /** @type {Error} */ (e).message; } finally { busy = false; }
  };
  /** @param {Uint8Array} bytes @param {string} type @param {string} name */
  const save = (bytes, type, name) => { download(new Blob([bytes.slice().buffer], { type }), name); msg.textContent = `Saved ${name} (${app.notes().length} notes).`; };
  const day = () => backupName().replace('.json.gz', '');

  $('backup-save').addEventListener('click', () => void run('Making the backup…', async () => save(await packBackup(snapshot()), 'application/gzip', backupName())));
  $('backup-csv').addEventListener('click', () => void run('Making the spreadsheet…', async () =>
    save(new TextEncoder().encode(backupToCsv(snapshot())), 'text/csv', `${day()}.csv`)));
  $('backup-xlsx').addEventListener('click', () => void run('Making the spreadsheet…', async () =>
    save(await backupToXlsx(snapshot()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${day()}.xlsx`)));

  input('backup-file').addEventListener('change', () => {
    const file = input('backup-file').files?.[0];
    if (!file) return;
    void run('Reading…', async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = /\.xlsx$/i.test(file.name) ? await xlsxToBackup(bytes) : /\.csv$/i.test(file.name) ? csvToBackup(new TextDecoder().decode(bytes)) : await unpackBackup(bytes);
      if (!read) throw new Error('That spreadsheet isn’t a backup from this app (no Kind and Data columns).');
      data = read;
      const p = planRestore(read, have());
      plan.textContent = describePlan(p);
      msg.textContent = canWrite() ? '' : 'You can’t add to this space.';
      go.hidden = !canWrite() || !(p.add.length || p.settings);
    });
  });

  go.addEventListener('click', () => {
    const d = data;
    if (!d || !canWrite()) return;
    go.hidden = true;
    void run('Restoring…', async () => {
      const { added, refused } = await restore(d, {
        ready, have, saveNotes: app.addNotes,
        applySettings: async file => { const add = addable(file); if (add) await app.settings.importFile(JSON.stringify(add)); },
      });
      const text = `Restored ${added} notes` + (refused ? `; ${refused} could not be saved` : '');
      toast(text); reset(); msg.textContent = text;
    }).finally(() => { go.hidden = !data; });
  });

  return { reset };
}
