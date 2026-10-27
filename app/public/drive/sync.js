// One tap of "Sync now": every changed note of the open space is written to its Markdown file in Drive, four at a
// time. Only notes whose text (or place) changed since this device's last sync are touched; the person's own text
// around the app's block is kept, and edits inside it are merged (block.js). Nothing is deleted in Drive.
import { fingerprint, planFile } from './block.js';
import { notePaths } from './paths.js';

const TRIES = 3, SIDE_BY_SIDE = 4;

/**
 * @typedef {ReturnType<typeof import('./remote.js').driveRemote>} Remote
 * @typedef {{ id: string, title: string, body: string, path?: string }} Note
 * @typedef {{ written: number, same: number, merged: number, conflicts: number, failed: { title: string, error: string }[], stopped: string }} Result
 *   stopped: why the run ended early (sign-in expired, Drive asked to slow down), '' when it went through
 */

/**
 * @param {{ notes: Note[], space: string, scope: string, remote: Remote,
 *   store: import('./store.js').Store, merge: import('./block.js').Merge3, onProgress?: (done: number, of: number) => void }} o
 *   scope: what keys this device's memory (account and space)
 * @returns {Promise<Result>}
 */
export async function runSync({ notes, space, scope, remote, store, merge, onProgress = () => {} }) {
  /** @type {Result} */ const out = { written: 0, same: 0, merged: 0, conflicts: 0, failed: [], stopped: '' };
  const ledgerKey = `ledger:${scope}`;
  /** @type {Record<string, { fp: string, rev: string, path: string }>} */
  const ledger = /** @type {any} */ (await store.get(ledgerKey)) || {};
  const paths = notePaths(notes, space, ledger);
  const todo = notes.filter(n => {
    const was = ledger[n.id];
    return !was || was.fp !== fingerprint(n.body.replace(/\n+$/, '')) || was.path !== paths.get(n.id);
  });
  let done = 0, halted = false;
  onProgress(0, todo.length);
  if (!todo.length) return out;
  // one list of the app's files in Drive instead of a search per note; if it fails the notes are searched one by one
  try { await remote.prime?.(); } catch (e) {
    const err = /** @type {Error & { auth?: boolean, limited?: boolean }} */ (e);
    if (err.auth || err.limited) return stop(out, err);
  }

  // ledger saves one after another: each writes the whole ledger as it is then
  let saving = Promise.resolve();
  const save = () => (saving = saving.catch(() => {}).then(() => store.set(ledgerKey, ledger)));
  const queue = [...todo];
  const worker = async () => {
    for (let note; !halted && (note = queue.shift());) {
      const path = /** @type {string} */ (paths.get(note.id));
      try {
        const r = await syncOne({ note, path, remote, store, merge, last: ledger[note.id], scope });
        ledger[note.id] = { fp: fingerprint(note.body.replace(/\n+$/, '')), rev: r.rev, path };
        await save();
        if (r.wrote) out.written++; else out.same++;
        if (r.merged) out.merged++;
        out.conflicts += r.conflicts;
      } catch (e) {
        const err = /** @type {Error & { auth?: boolean, limited?: boolean }} */ (e);
        if (err.auth || err.limited) { halted = true; stop(out, err); break; }
        out.failed.push({ title: note.title, error: err.message });
      }
      onProgress(++done, todo.length);
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(SIDE_BY_SIDE, todo.length) }, worker)); }
  finally { remote.release?.(); }
  await saving.catch(() => {});
  return out;
}

/** @param {Result} out @param {Error & { limited?: boolean }} err */
function stop(out, err) {
  out.stopped = err.limited ? 'Google Drive asked to slow down. Tap Sync again in a few minutes.' : err.message;
  return out;
}

/**
 * read, plan and write one note's file; if the file changed meanwhile, read and plan again
 * @param {{ note: Note, path: string, remote: Remote, store: import('./store.js').Store, merge: import('./block.js').Merge3,
 *   last: { fp: string, rev?: string } | undefined, scope: string }} o
 */
async function syncOne({ note, path, remote, store, merge, last, scope }) {
  const baseKey = `base:${scope}:${note.id}`, fileKey = `file:${scope}:${note.id}`;
  const inner = note.body;
  const base = /** @type {string | undefined} */ (await store.get(baseKey));
  // Nobody touched the file since this device wrote it (same version in Drive's list, and the text this device wrote is
  // kept): plan from that text and skip the download. A write checks the version first, and if it moved, reads again (a note that needs no write is left as it is).
  const seen = /** @type {string | undefined} */ (last?.rev ? await store.get(fileKey) : undefined);
  const hit = seen !== undefined && last?.rev ? await remote.stat?.(path) : undefined;
  let was = hit && hit.rev === last?.rev ? { text: /** @type {string} */ (seen), rev: hit.rev, id: hit.id } : undefined;
  for (let i = 0; i < TRIES; i++) {
    if (!was) was = (await remote.read(path)) || undefined;
    const plan = planFile({ remoteText: was ? was.text : null, inner, last: last ? { fp: last.fp, base } : null, merge });
    let rev = was ? was.rev : '', text = plan.write ? plan.text : was?.text;
    if (plan.write) {
      try { rev = (await remote.write(path, plan.text, was || null)).rev; }
      catch (e) { if (/** @type {{ conflict?: boolean }} */ (e).conflict) { was = undefined; continue; } throw e; }
    }
    await store.set(baseKey, inner.replace(/\n+$/, ''));
    if (text != null) await store.set(fileKey, text);
    return { wrote: plan.write, merged: plan.merged, conflicts: plan.conflicts, rev };
  }
  throw new Error('Changed in Drive again and again. Tap Sync to try again.');
}
