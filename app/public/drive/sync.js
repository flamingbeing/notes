// One tap of "Sync now": every changed note of the open space is written to its Markdown file in Drive, one after
// another. Only notes whose text (or place) changed since this device's last sync are touched; the person's own text
// around the app's block is kept, and edits inside it are merged (block.js). Nothing is deleted in Drive.
import { fingerprint, planFile } from './block.js';
import { notePaths } from './paths.js';

const TRIES = 3;

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
  let done = 0;
  onProgress(0, todo.length);
  for (const note of todo) {
    const path = /** @type {string} */ (paths.get(note.id));
    try {
      const r = await syncOne({ note, path, remote, store, merge, last: ledger[note.id], scope });
      ledger[note.id] = { fp: fingerprint(note.body.replace(/\n+$/, '')), rev: r.rev, path };
      await store.set(ledgerKey, ledger);
      if (r.wrote) out.written++; else out.same++;
      if (r.merged) out.merged++;
      out.conflicts += r.conflicts;
    } catch (e) {
      const err = /** @type {Error & { auth?: boolean, limited?: boolean }} */ (e);
      if (err.auth || err.limited) { out.stopped = err.limited ? 'Google Drive asked to slow down. Tap Sync again in a few minutes.' : err.message; break; }
      out.failed.push({ title: note.title, error: err.message });
    }
    onProgress(++done, todo.length);
  }
  return out;
}

/**
 * read, plan and write one note's file; if the file changed meanwhile, read and plan again
 * @param {{ note: Note, path: string, remote: Remote, store: import('./store.js').Store, merge: import('./block.js').Merge3,
 *   last: { fp: string } | undefined, scope: string }} o
 */
async function syncOne({ note, path, remote, store, merge, last, scope }) {
  const baseKey = `base:${scope}:${note.id}`;
  const inner = note.body;
  const base = /** @type {string | undefined} */ (await store.get(baseKey));
  for (let i = 0; i < TRIES; i++) {
    const was = await remote.read(path);
    const plan = planFile({ remoteText: was ? was.text : null, inner, last: last ? { fp: last.fp, base } : null, merge });
    let rev = was ? was.rev : '';
    if (plan.write) {
      try { rev = (await remote.write(path, plan.text, was)).rev; }
      catch (e) { if (/** @type {{ conflict?: boolean }} */ (e).conflict) continue; throw e; }
    }
    await store.set(baseKey, inner.replace(/\n+$/, ''));
    return { wrote: plan.write, merged: plan.merged, conflicts: plan.conflicts, rev };
  }
  throw new Error('Changed in Drive again and again. Tap Sync to try again.');
}
