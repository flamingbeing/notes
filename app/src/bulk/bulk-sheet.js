// Bulk edit's one popup (#bulk): what to do to the notes picked in the list: add a tag, move to a folder, merge into one
// note, or delete (to the bin; the select bar's bin button too). The work on the notes is bulk.js; this runs it
// through the app's saves.
import { confirmModal, plural } from '@core/ui';
import { $, input, dialog } from '../shell/dom.js';
import { addTag, moveTo, mergeNotes } from './bulk.js';

/** @typedef {import('../cloud.js').Note} Note */

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast */
export function bulkSheet(app, toast) {
  const sheet = dialog('bulk');
  /** @type {Note[]} */ let notes = [];
  /** @type {() => void} */ let done = () => {};

  /** @param {() => Promise<string>} job -> '' or why not */
  const run = async job => {
    sheet.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { const why = await job(); toast(why || 'Done'); if (!why) { sheet.close(); done(); } }
    catch (e) { toast(/** @type {Error} */ (e).message); }
    finally { sheet.querySelectorAll('button').forEach(b => { b.disabled = false; }); fill(); }
  };
  /** @param {{ note: Note, patch: Partial<Note> }[]} edits */
  const saveEdits = async edits => {
    let refused = 0;
    for (const { note, patch } of edits) if (await app.edit(note, patch)) refused++;
    return refused ? `${refused} could not be saved` : '';
  };
  /** @param {Note[]} list -> '' or how many could not be deleted */
  const removeAll = async list => {
    let refused = 0;
    for (const n of list) { try { await app.remove(n); } catch { refused++; } }
    return refused ? `${refused} could not be deleted` : '';
  };
  const fill = () => {
    $('bulk-title').textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} picked`;
    /** @type {HTMLButtonElement} */ ($('bulk-merge')).disabled = notes.length < 2;
  };

  $('bulk-tag-go').addEventListener('click', () => void run(() => saveEdits(addTag(notes, input('bulk-tag').value))));
  $('bulk-move-go').addEventListener('click', () => void run(() => saveEdits(moveTo(notes, input('bulk-folder').value))));
  $('bulk-merge').addEventListener('click', () => void run(async () => {
    const m = mergeNotes(notes, input('bulk-merge-title').value);
    if (!m) return 'Pick two or more notes to merge.';
    const { refused } = await app.create(m.create);
    if (refused) return refused;
    return removeAll(m.remove);
  }));
  /** @param {Note[]} list -> '' or why not (asked first: they go to the bin) */
  const trash = async list => {
    if (!await confirmModal(`Delete ${plural(list.length, 'note')}? They go to the bin.`, { title: 'Delete notes', danger: true, yes: 'Delete' })) return 'Not deleted';
    return removeAll(list);
  };
  $('bulk-delete').addEventListener('click', () => void run(() => trash(notes)));
  $('bulk-close').addEventListener('click', () => sheet.close());
  return {
    /** @param {Note[]} picked @param {() => void} finished  called once an action has gone through */
    open(picked, finished) { notes = picked; done = finished; fill(); sheet.showModal(); },
    /** the select bar's bin button: the picked notes to the bin, straight from the list @param {Note[]} picked @param {() => void} finished */
    async trash(picked, finished) {
      if (!picked.length) return;
      const why = await trash(picked);
      toast(why || 'Moved to the bin');
      if (!why) finished();
    },
  };
}
