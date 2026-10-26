// The note sheet (#edit): a note's title, folder and text (a plain textarea; the editor is S2's), the notes it links to
// (a missing one is made on a click) and the notes linking to it (backlinks). It follows its note on the server: a change
// made elsewhere shows under the text, and a delete made elsewhere closes the sheet and says so, unless the person has
// typed a change: then the sheet stays open, says so, and Save adds their text back as a new note. A new title renames
// the note and rewrites [[links]] to it in the vault. (A note not on the server yet is only "gone" once it was seen there.)
// A [[Space/Note]] link to a note in another space the person is in opens that space, then the note; "Move" sends the
// note to another space they can write (or their own notes).
import { confirmModal } from '@core/ui';
import { TOO_BIG } from '../cloud.js';
import { linksIn } from '../notes/parse.js';
import { sizeOf } from '../notes/model.js';
import { $, input, dialog } from '../dom.js';

/** @typedef {import('../cloud.js').Note} Note */

const area = () => /** @type {HTMLTextAreaElement} */ ($('edit-body'));

/**
 * @param {import('../cloud.js').Started} app
 * @param {(message: string) => unknown} toast  a short note (the kit's toaster)
 * @param {() => boolean} canWrite  false: the sheet only shows the note (a viewer)
 * @returns {{ open: (note: Note) => void, redraw: () => void }} open the sheet on a note; redraw its links and backlinks
 */
export function noteSheet(app, toast, canWrite) {
  const sheet = dialog('edit');
  /** @type {Note | null} the note as it was opened (the base of its save) */
  let editing = null;
  let editingGone = false;   // the note was deleted elsewhere while the person had typed a change
  /** @type {(() => void) | null} */
  let stopLive = null;

  const typed = () => !!editing && (input('edit-text').value.trim() !== editing.title || area().value !== (editing.body || '') || input('edit-path').value.trim() !== (editing.path || ''));
  // the person's edits saved: a new title renames (and relinks); a note deleted elsewhere comes back as a new note
  const commit = async () => {
    const note = editing;
    if (!note || !typed() || !canWrite()) return '';
    const title = input('edit-text').value.trim() || note.title, body = area().value, path = input('edit-path').value.trim();
    const why = editingGone ? (await app.create({ title, body, path })).refused
      : title !== note.title ? await app.rename(note, title, { body, path })
        : await app.edit(note, { body, path });
    toast(why || 'Saved');
    return why;
  };
  const button = (/** @type {string} */ label, /** @type {() => void} */ onClick, cls = '') => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    li.append(b);
    return li;
  };
  // go to another note from this one: this one's edits are saved first; a link to no note makes it
  const go = async (/** @type {string} */ target) => {
    if (await commit()) return;   // refused: stay on this note with the text as typed
    const have = app.find(target);
    if (have) { show(have); return; }
    const far = app.findElsewhere(target);
    if (far) {
      const why = await app.switchTo(far.space);
      if (why) toast(why); else show(far.note);
      return;
    }
    if (!canWrite()) { toast('There is no such note yet.'); return; }
    const { note, refused } = await app.create({ title: target });
    if (refused) { toast(refused); return; }
    show(note);
  };
  const redraw = () => {
    if (!editing) return;
    const targets = [...new Map(linksIn(area().value).filter(l => l.target).map(l => [l.target.toLowerCase(), l.target])).values()];
    $('edit-links').replaceChildren(...targets.map(t => {
      const to = app.find(t), far = to ? null : app.findElsewhere(t);   // (a note in another space: its link as written)
      return button(to ? to.title : far ? t : `${t} (new)`, () => void go(t), to || far ? '' : 'missing');
    }));
    $('edit-links-box').hidden = targets.length === 0;
    const back = app.backlinks(editing.id);
    $('edit-backlinks').replaceChildren(...back.map(n => button(n.title, () => void go(n.title))));
    $('edit-backlinks-box').hidden = back.length === 0;
    const size = sizeOf(area().value);
    $('edit-size').textContent = size === 'too-big' ? TOO_BIG : size === 'warn' ? 'This note is getting big (over 800 KB).' : '';
  };
  area().addEventListener('input', () => redraw());

  // a note too big to save keeps the sheet open, so the text isn't lost with it
  $('edit-form').addEventListener('submit', e => {
    if (/** @type {SubmitEvent} */ (e).submitter?.id === 'edit-save' && sizeOf(area().value) === 'too-big') { e.preventDefault(); toast(TOO_BIG); }
  });
  sheet.addEventListener('close', async () => {
    stopLive?.(); stopLive = null;
    if (sheet.returnValue === 'save') await commit();
    editing = null;
  });
  $('edit-delete').addEventListener('click', async () => {
    if (!await confirmModal('Delete this note? It goes to the bin.', { title: 'Delete note', danger: true, yes: 'Delete' })) return;
    const note = editing; editing = null;
    sheet.close('delete');
    if (note && !editingGone) { await app.remove(note); toast('Deleted'); }
  });

  // where the note can move: the person's own notes and each space they can write, but not the one it is in
  const moveSel = () => /** @type {HTMLSelectElement} */ ($('edit-move'));
  const fillMove = () => {
    const here = app.space(), me = app.vault();
    const opt = (/** @type {string} */ value, /** @type {string} */ label) => Object.assign(document.createElement('option'), { value, textContent: label });
    const to = [...(here.id !== me && me ? [opt(me, 'My notes')] : []), ...app.spaces().filter(x => x.id !== here.id && x.role !== 'view').map(x => opt(x.id, x.name))];
    moveSel().replaceChildren(opt('', 'Move to…'), ...to);
    $('edit-move-box').hidden = !canWrite() || to.length === 0;
  };
  $('edit-move-go').addEventListener('click', async () => {
    const note = editing, to = moveSel().value;
    if (!note || !to || editingGone) return;
    const name = moveSel().selectedOptions[0]?.textContent || '';
    const back = app.backlinks(note.id).length;
    const warn = back ? ` ${back === 1 ? 'One note here links' : `${back} notes here link`} to it; those links won’t find it there.` : '';
    if (!await confirmModal(`Move “${note.title}” to ${name}?${warn}`, { title: 'Move note', yes: 'Move' })) return;
    if (await commit()) return;
    const why = await app.move(note, to);
    if (why) { toast(why); return; }
    editing = null;
    sheet.close('moved');
    toast(`Moved to ${name}`);
  });

  /** @param {Note} note */
  const show = note => {
    editing = note;
    input('edit-text').value = note.title;
    input('edit-path').value = note.path || '';
    area().value = note.body || '';
    const rw = canWrite();
    for (const id of ['edit-text', 'edit-path', 'edit-body']) input(id).readOnly = !rw;
    $('edit-save').hidden = !rw; $('edit-delete').hidden = !rw;
    fillMove();
    $('edit-live').textContent = ''; $('edit-msg').textContent = '';
    let seen = false;
    editingGone = false;
    stopLive?.();
    stopLive = app.watchNote(note.id, doc => {
      if (editing?.id !== note.id) return;
      if (doc) {
        seen = true;
        $('edit-live').textContent = doc.body !== note.body || doc.title !== note.title ? 'Changed on another device; Save merges your edits into it.' : '';
      } else if (seen && typed()) {
        editingGone = true;
        $('edit-live').textContent = 'This note was deleted on another device. Save adds your text back as a new note.';
      } else if (seen) {
        editing = null;
        sheet.close('gone');
        $('edit-msg').textContent = `“${note.title}” was deleted on another device.`;
      }
    });
    redraw();
    if (!sheet.open) sheet.showModal();
  };
  return { open: show, redraw };
}
