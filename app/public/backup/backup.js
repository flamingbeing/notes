// The backup object and its restore. Pure but for the injected `io`; no DOM (tested in app/test/backup.unit.test.mjs).
// A restore only adds: a record whose id is here is kept as it is, nothing is deleted, and the server's copy is waited
// for first (a new phone shows an empty list until it arrives, and everything would count as missing).

export const FORMAT = 'notes-backup';
const VERSION = 1;
const NOTE_FIELDS = ['id', 'path', 'title', 'body', 'aliases', 'daily'];
const FILE_FIELDS = ['id', 'name', 'path', 'size', 'type'];
export const STILL_LOADING = 'Your notes are still loading (no signal?). Try again in a moment.';

/** @param {Record<string, any>} from @param {string[]} fields @returns {any} */
const pick = (from, fields) => Object.fromEntries(fields.filter(k => from[k] !== undefined).map(k => [k, from[k]]));
/** the fields a note is rebuilt from: links and tags are worked out again on save, `updatedAt` only when it is a time
 * @param {Record<string, any>} n @returns {any} */
const cleanNote = n => ({ ...pick(n, NOTE_FIELDS), ...(Number.isFinite(n.updatedAt) ? { updatedAt: n.updatedAt } : {}) });

/** @param {{ notes: import('./types').Item[], files?: import('./types').FileRef[], settings?: unknown, space?: { id: string, name: string } | null, now?: Date }} from
 * @returns {import('./types').Backup} */
export function buildBackup({ notes, files = [], settings = null, space = null, now = new Date() }) {
  return {
    format: FORMAT, version: VERSION, exportedAt: now.toISOString(), space, settings,
    notes: notes.map(cleanNote), files: files.map(f => pick(f, FILE_FIELDS)),
  };
}

/** The object a file held, or an error in plain words. @param {any} data @returns {import('./types').Backup} */
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT) throw new Error('That isn’t a backup from this app.');
  if (data.version > VERSION) throw new Error('That backup is from a newer version of the app. Update first.');
  return { settings: null, space: null, files: [], ...data, notes: Array.isArray(data.notes) ? data.notes : [], skipped: data.skipped || 0 };
}

/** What a restore would add, now. @param {import('./types').Backup & { skipped?: number }} data
 * @param {import('./types').Have} have @returns {import('./types').RestorePlan} */
export function planRestore(data, have) {
  const here = new Set(have.noteIds), files = new Set(have.fileIds), seen = new Set();
  const usable = data.notes.filter(n => n && typeof n.id === 'string' && n.id && !seen.has(n.id) && seen.add(n.id));
  const add = usable.filter(n => !here.has(n.id));
  return {
    add, present: usable.length - add.length, filesMissing: (data.files || []).filter(f => !files.has(f.id)).length,
    settings: data.settings != null && (have.settingsWouldChange ? have.settingsWouldChange(data.settings) : true), skipped: (data.skipped || 0) + (data.notes.length - usable.length),
  };
}

/** The dry-run line. @param {import('./types').RestorePlan} p */
export function describePlan(p) {
  const n = (/** @type {number} */ c, /** @type {string} */ w) => `${c} ${w}${c === 1 ? '' : 's'}`;
  const parts = [p.add.length ? `Adds ${n(p.add.length, 'note')}` : 'Nothing to add', p.present ? `${p.present} already here, kept as they are` : ''];
  if (p.filesMissing) parts.push(`${n(p.filesMissing, 'file')} listed but not in a backup (files are not restored)`);
  if (p.settings) parts.push('settings you haven’t changed are restored');
  if (p.skipped) parts.push(`${p.skipped} could not be read`);
  return parts.filter(Boolean).join('; ') + '.';
}

/** Waits for the server's copy, plans again from what is here then, and adds what is missing.
 * @param {import('./types').Backup & { skipped?: number }} data @param {import('./types').RestoreIo} io
 * @returns {Promise<{ added: number, refused: number, plan: import('./types').RestorePlan }>} */
export async function restore(data, io) {
  if (!(await io.ready())) throw new Error(STILL_LOADING);
  const plan = planRestore(data, io.have());
  const refused = plan.add.length ? await io.saveNotes(plan.add) : 0;
  if (plan.settings && io.applySettings) await io.applySettings(data.settings);
  return { added: plan.add.length - refused, refused, plan };
}
