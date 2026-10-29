// The note record and the rules the notes collection's saves follow. Pure, no DOM (tested in
// app/test/notes.unit.test.mjs).
//
// A note: { id, path, title, body, links[], tags[], aliases[], daily?, updatedAt } in spaces/<space>/notes/<id>.
// links and tags are worked out from the body on every save (parse.js), never typed; aliases are the note's old titles
// (a rename keeps them so links written elsewhere, offline, still find it). The body isn't indexed by Firestore.
import { merge3 } from './merge3.js';
import { linkKeys, tagsIn } from './parse.js';

/** @typedef {{ id: string, path?: string, title: string, body: string, links?: string[], tags?: string[], aliases?: string[], daily?: string, updatedAt?: unknown, _deleted?: boolean } & Record<string, unknown>} Note */

// A Firestore document holds at most 1 MiB; the body is most of it. Warn early, refuse before the server would.
export const WARN_BYTES = 800 * 1024;
export const MAX_BYTES = 1024 * 1024 - 16 * 1024;   // room for the other fields

/** @param {string} body @returns {'ok' | 'warn' | 'too-big'} */
export function sizeOf(body) {
  const n = new TextEncoder().encode(body).length;
  return n > MAX_BYTES ? 'too-big' : n > WARN_BYTES ? 'warn' : 'ok';
}

// the record to save: links and tags from the body; a path's folder only (no leading or trailing /)
/** @param {Note} note @returns {Note} */
export function withDerived(note) {
  const body = String(note.body ?? '');
  const path = String(note.path ?? '').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return { ...note, title: String(note.title ?? '').trim(), path, body, links: linkKeys(body), tags: tagsIn(body), aliases: note.aliases || [] };
}

// Daily notes: one per date, the id made from it, so two devices making "today" make the same note (as the logbook's
// dayNoteId). The date is this device's calendar date.
/** @param {Date} [d] -> 'YYYY-MM-DD' */
export function isoDay(d = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// the next working day after d: Monday to Friday (public holidays not skipped)
/** @param {Date} [d] -> 'YYYY-MM-DD' */
export function nextWorkday(d = new Date()) {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  while (n.getDay() === 0 || n.getDay() === 6) n.setDate(n.getDate() + 1);
  return isoDay(n);
}
/** @param {string} iso */
export const dailyId = iso => 'day-' + iso;
// a title no other note in the folder has: "Plan" -> "Plan 2" if "Plan" is taken (case ignored); selfId is the note
// being titled, which doesn't count against itself
/** @param {Note[]} notes @param {string} title @param {string} [path] @param {string} [selfId] */
export const uniqueTitle = (notes, title, path = '', selfId = '') => {
  const taken = new Set(notes.filter(n => !n._deleted && n.id !== selfId && (n.path || '') === path).map(n => n.title.toLowerCase()));
  let t = title, i = 1;
  while (taken.has(t.toLowerCase())) t = `${title} ${++i}`;
  return t;
};
// the note already there for a date: by its id, else any note marked for that date or titled with it (made by hand or
// on another device), so Today opens it rather than make a second
/** @param {Note[]} notes @param {string} iso @returns {Note | undefined} */
export const findDaily = (notes, iso) => {
  const live = notes.filter(n => !n._deleted);
  return live.find(n => n.id === dailyId(iso)) || live.find(n => n.daily === iso) || live.find(n => n.title === iso);
};
/** @param {string} iso @param {string} [folder] @returns {Note} */
export const dailyNote = (iso, folder = '') => withDerived({ id: dailyId(iso), title: iso, path: folder, body: '', daily: iso });

const DERIVED = new Set(['id', 'body', 'links', 'tags', 'updatedAt', 'serverAt', '_edits']);
const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The notes collection's merge (app-sync backend.merge.notes): this device's save (record, made from base) applied to
 * the server's copy now (current). Pure: the engine runs it again when the transaction retries.
 * - body: line-level 3-way merge (merge3); a clash throws { code: 'write-conflict' } and the save is kept as a
 *   conflict (cloud.js then saves this device's text as a conflict copy and sets the save aside);
 * - other fields: this device's value where it changed since base, else the server's (aliases: both sides' kept);
 * - a delete wins; an edit of a note deleted elsewhere brings it back (no text is lost).
 * @param {Note | null} current @param {Note} record @param {Note | null} base @returns {Note}
 */
export function mergeNote(current, record, base) {
  if (record._deleted || !current || current._deleted) return record._deleted ? record : withDerived(record);
  const b = base || /** @type {Note} */ ({ id: record.id, title: '', body: '' });
  const { text, conflicts } = merge3(String(b.body ?? ''), String(record.body ?? ''), String(current.body ?? ''));
  if (conflicts) throw Object.assign(new Error('The note changed on another device'), { code: 'write-conflict', remote: current });
  /** @type {Note} */
  const out = { ...current, body: text };
  for (const k of Object.keys(record)) if (!DERIVED.has(k) && !same(record[k], b[k])) out[k] = record[k];
  out.aliases = [...new Set([...(current.aliases || []), ...(record.aliases || [])])];
  return withDerived(out);
}

/**
 * This device's text kept as its own note when it clashed with another device's (never lost). Its id comes from the
 * save's key, so saving it again after a crash makes no second copy.
 * @param {Note} mine  the save that clashed @param {{ key: string, device: string, at: string }} o  at: SGT time
 * @returns {Note}
 */
export function conflictCopy(mine, { key, device, at }) {
  const id = 'conflict-' + String(key).replace(/[^A-Za-z0-9_-]/g, '').slice(-60);
  const title = `${mine.title || 'Untitled'} (conflict, ${device || 'this device'}, ${at})`;
  return withDerived({ id, title, path: mine.path || '', body: String(mine.body ?? ''), aliases: [] });
}
