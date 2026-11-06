// A row's menu in the left sidebar (a long-press or right-click), as a bottom sheet. A note: open it in a new tab,
// rename it (its links follow), move it to another folder, bookmark it, copy its path, delete it (asked first; to
// the bin, with Undo). A folder: a new note in it, rename it (each note in it saved once, through the write queue), delete it (only
// when empty: a folder is its notes' paths, so one with notes can't go without them). Someone who can only view the
// space gets open and copy. The note open on the page changes through the page (its boxes), so its edits stay one save.
import { copyText } from '@core/ui';
import { uniqueTitle } from '../notes/model.js';
import { transients } from '../shell/transients.js';
import { bottomSheet } from './sheet.js';
import { buildTree, cleanPath, movedPath } from './tree.js';

/** @typedef {import('./left.js').Ctx} Ctx */
/** @typedef {import('../notes/model.js').Note} Note */
/** @typedef {import('./sheet.js').Card} Card */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
const lastPart = (/** @type {string} */ p) => p.slice(p.lastIndexOf('/') + 1);
const parentOf = (/** @type {string} */ p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
/** @param {Note} n @param {string} path  in the folder or one under it */
const inside = (n, path) => { const p = cleanPath(n.path); return p === path || p.startsWith(path + '/'); };

// ---- one sheet for every row's menu, filled as it opens
let cards = /** @type {Card[]} */ ([]);
let title = '';
/** @type {ReturnType<typeof bottomSheet> | null} */
let sheet = null;
/** @param {string} label @param {Card[]} c */
const showMenu = (label, c) => {
  title = label;
  cards = c;
  sheet ||= bottomSheet({ id: 'vl-file-menu', label: () => title, cards: () => cards });
  sheet.open();
};

// ---- a line of text asked for (a name): a small dialog near the top, over everything
/** @type {{ d: HTMLDialogElement, h: HTMLElement, input: HTMLInputElement, label: HTMLElement, msg: HTMLElement } | null} */
let prompt = null;
/**
 * @param {{ title: string, label: string, value?: string, check?: (v: string) => string }} o  check: '' or why not
 * @returns {Promise<string | null>}  what was typed (null: cancelled)
 */
export function askText({ title: heading, label, value = '', check = () => '' }) {
  if (!prompt) {
    const d = /** @type {HTMLDialogElement} */ (el('dialog', { id: 'vl-prompt', className: 'vl-prompt' }));
    const h = el('h2', { id: 'vl-prompt-title', className: 'vl-prompt-title' });
    const input = /** @type {HTMLInputElement} */ (el('input', { id: 'vl-prompt-input', type: 'text', autocomplete: 'off', spellcheck: false }));
    const lab = el('label', { htmlFor: 'vl-prompt-input', className: 'vl-prompt-label' });
    const msg = el('p', { id: 'vl-prompt-msg', className: 'vl-prompt-msg' });
    msg.setAttribute('role', 'alert');
    const cancel = el('button', { type: 'button', id: 'vl-prompt-cancel', className: 'vl-prompt-btn', textContent: 'Cancel' });
    const ok = el('button', { type: 'submit', id: 'vl-prompt-ok', className: 'vl-prompt-btn vl-prompt-ok', textContent: 'Save' });
    const form = el('form', { method: 'dialog' }, h, lab, input, msg, el('div', { className: 'vl-prompt-row' }, cancel, ok));
    d.append(form);
    d.setAttribute('aria-labelledby', 'vl-prompt-title');
    document.body.append(d);
    cancel.addEventListener('click', () => d.close(''));
    prompt = { d, h, input, label: lab, msg };
  }
  const p = prompt;
  p.h.textContent = heading;
  p.label.textContent = label;
  p.input.value = value;
  p.msg.textContent = '';
  return new Promise(resolve => {
    const step = transients().open(() => { if (p.d.open) p.d.close(''); });
    /** @param {SubmitEvent} e */
    const submit = e => {
      const v = p.input.value.trim();
      const why = v ? check(v) : '';
      if (why) { e.preventDefault(); p.msg.textContent = why; return; }
      p.d.returnValue = 'ok';
    };
    const form = /** @type {HTMLFormElement} */ (p.d.querySelector('form'));
    form.addEventListener('submit', submit);
    p.d.addEventListener('close', () => {
      form.removeEventListener('submit', submit);
      if (step.active) void step.close();
      const v = p.input.value.trim();
      resolve(p.d.returnValue === 'ok' && v ? v : null);
    }, { once: true });
    p.d.returnValue = '';
    p.d.showModal();
    p.input.focus();
    p.input.select();
  });
}

// ---- a yes or no asked (Delete file?): the same small dialog, its words and a red button
/** @type {{ d: HTMLDialogElement, h: HTMLElement, text: HTMLElement, ok: HTMLButtonElement } | null} */
let asker = null;
/**
 * @param {{ title: string, text: string, ok: string }} o  ok: the red button's word
 * @returns {Promise<boolean>}  true: the red button (false: Cancel, Esc, Back)
 */
export function askYes({ title: heading, text, ok: yes }) {
  if (!asker) {
    const d = /** @type {HTMLDialogElement} */ (el('dialog', { id: 'vl-confirm', className: 'vl-prompt' }));
    const h = el('h2', { id: 'vl-confirm-title', className: 'vl-prompt-title' });
    const words = el('p', { id: 'vl-confirm-text', className: 'vl-prompt-text' });
    const cancel = el('button', { type: 'button', id: 'vl-confirm-cancel', className: 'vl-prompt-btn', textContent: 'Cancel' });
    const ok = /** @type {HTMLButtonElement} */ (el('button', { type: 'submit', id: 'vl-confirm-ok', className: 'vl-prompt-btn vl-prompt-danger' }));
    d.append(el('form', { method: 'dialog' }, h, words, el('div', { className: 'vl-prompt-row' }, cancel, ok)));
    d.setAttribute('aria-labelledby', 'vl-confirm-title');
    d.setAttribute('aria-describedby', 'vl-confirm-text');
    document.body.append(d);
    cancel.addEventListener('click', () => d.close(''));
    ok.addEventListener('click', () => { d.returnValue = 'ok'; });
    asker = { d, h, text: words, ok };
  }
  const a = asker;
  a.h.textContent = heading;
  a.text.textContent = text;
  a.ok.textContent = yes;
  return new Promise(resolve => {
    const step = transients().open(() => { if (a.d.open) a.d.close(''); });
    a.d.addEventListener('close', () => {
      if (step.active) void step.close();
      resolve(a.d.returnValue === 'ok');
    }, { once: true });
    a.d.returnValue = '';
    a.d.showModal();
    // (Cancel first: a stray Enter keeps the note)
    /** @type {HTMLElement} */ (a.d.querySelector('#vl-confirm-cancel')).focus();
  });
}

// ---- the folders, to move a note into
let moveCards = /** @type {Card[]} */ ([]);
/** @type {ReturnType<typeof bottomSheet> | null} */
let moveSheet = null;
/** @param {Ctx} ctx @param {string} from  the folder it is in @returns {Promise<string | null>} */
export function pickFolder(ctx, from) {
  return new Promise(resolve => {
    let done = false;
    const finish = (/** @type {string | null} */ v) => { if (!done) { done = true; resolve(v); } };
    const { paths } = buildTree(ctx.notes(), ctx.extraFolders());
    let asking = false;
    moveCards = [{ title: 'Move to', rows: ['', ...paths].map(p => ({
      icon: p ? 'folder' : 'folderOpen', label: p || 'Top level', ticked: p === from ? true : undefined, disabled: p === from,
      run: () => finish(p),
    })) }, { rows: [{ id: 'vl-move-new', icon: 'folderPlus', label: 'New folder…', run: async () => {
      // (a folder named here: the note goes into it, which makes it)
      asking = true;
      const v = await askText({ title: 'New folder', label: 'Folder name', check: t => (cleanPath(t) ? '' : 'Give the folder a name.') });
      finish(v ? cleanPath(v) : null);
    } }] }];
    moveSheet ||= bottomSheet({ id: 'vl-move-sheet', label: 'Move file to', cards: () => moveCards });
    moveSheet.open();
    const d = moveSheet.el;
    // (shut without a choice: nothing; a row's choice comes just after the sheet goes)
    d.addEventListener('close', () => setTimeout(() => { if (!asking) finish(null); }, 50), { once: true });
  });
}

// ---- the actions
/** @param {Ctx} ctx @param {string} id */
const fresh = (ctx, id) => ctx.notes().find(n => n.id === id);
/** the box on the note page (the note open there): typed in, as the person would @param {string} id @param {string} v */
const typeInto = (id, v) => {
  const box = /** @type {HTMLInputElement} */ (document.getElementById(id));
  box.value = v;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
};
/** @param {Ctx} ctx @param {Note} note @param {string} path */
const moveNote = async (ctx, note, path) => {
  if (ctx.current()?.id === note.id) { typeInto('edit-path', path); return ''; }
  return ctx.app.edit(note, { path });
};

/** @param {Ctx} ctx @param {Note} note */
export async function rename(ctx, note) {
  const path = cleanPath(note.path);
  const v = await askText({ title: 'Rename file', label: 'File name', value: note.title, check: t => {
    if (t.toLowerCase() === note.title.toLowerCase() && t === note.title) return '';
    return uniqueTitle(ctx.notes(), t, path, note.id) === t ? '' : 'A file with that name is already in this folder.';
  } });
  if (!v || v === note.title) return;
  const n = fresh(ctx, note.id) || note;
  if (ctx.current()?.id === n.id) { typeInto('edit-text', v); ctx.redraw(); return; }
  const why = await ctx.app.rename(n, v);
  ctx.toast(why || `Renamed to “${v}”`);
  ctx.redraw();
}

/** @param {Ctx} ctx @param {Note} note */
export async function move(ctx, note) {
  const from = cleanPath(note.path);
  const to = await pickFolder(ctx, from);
  if (to === null || to === from) return;
  const n = fresh(ctx, note.id) || note;
  const why = await moveNote(ctx, n, to);
  ctx.toast(why || `Moved to ${to || 'the top level'}`);
  ctx.redraw();
}

/** @param {Ctx} ctx @param {Note} note */
export async function remove(ctx, note) {
  if (!await askYes({ title: 'Delete file', text: `Delete “${note.title || 'Untitled'}”? It goes to the bin, where you can restore it.`, ok: 'Delete' })) return;
  await ctx.leave(note.id);
  const n = fresh(ctx, note.id) || note;
  await ctx.app.remove(n);
  ctx.bookmark(n.id, false);
  ctx.redraw();
  ctx.toast(`Deleted “${n.title || 'Untitled'}”`, { action: { label: 'Undo', run: () => void undo(ctx, n) } });
}
/** the bin's entry for it (written as the delete is stored: tried a few times), restored @param {Ctx} ctx @param {Note} n */
async function undo(ctx, n) {
  for (let i = 0; i < 6; i++) {
    try {
      // (an entry's id is '<kind>:<note id>'; its data is the note)
      const entry = (await ctx.app.bin.list()).find(e => e.data?.id === n.id);
      if (entry) { const why = await ctx.app.bin.restore(entry); ctx.toast(why || 'Restored'); return; }
    } catch { /* offline: the bin can't be read yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  ctx.toast('Not in the bin yet: restore it from the Bin in a moment.');
}

/** @param {Ctx} ctx @param {string} path */
async function renameFolder(ctx, path) {
  const up = parentOf(path);
  const { paths } = buildTree(ctx.notes(), ctx.extraFolders());
  const v = await askText({ title: 'Rename folder', label: 'Folder name', value: lastPart(path), check: t => {
    if (t.includes('/')) return 'A folder name can’t have a “/”.';
    const to = cleanPath(`${up}/${t}`);
    return to !== path && paths.includes(to) ? 'A folder with that name is already here.' : '';
  } });
  const to = v ? cleanPath(`${up}/${v}`) : '';
  if (!to || to === path) return;
  const s = ctx.state().get();
  ctx.state().set({
    folders: s.folders.map(f => movedPath(f, path, to)),
    opened: s.opened.map(f => movedPath(f, path, to)),
  });
  // (each note in it saved once, its new path; the one open goes through the page)
  let failed = 0;
  for (const n of ctx.notes().filter(x => inside(x, path))) {
    const why = await moveNote(ctx, n, movedPath(n.path || '', path, to));
    if (why) failed++;
  }
  ctx.toast(failed ? `${failed} ${failed === 1 ? 'note' : 'notes'} could not be moved.` : `Renamed to “${lastPart(to)}”`);
  ctx.redraw();
}

/** @param {Ctx} ctx @param {Note} note */
export function noteMenu(ctx, note) {
  const write = ctx.canWrite();
  const marked = ctx.bookmarked(note.id);
  const path = cleanPath(note.path);
  showMenu(note.title || 'Untitled', [
    { rows: [{ id: 'vl-fm-tab', icon: 'filePlus', label: 'Open in new tab', run: () => void ctx.openInNewTab(note) }] },
    { rows: write ? [
      { id: 'vl-fm-rename', icon: 'pencil', label: 'Rename…', run: () => void rename(ctx, note) },
      { id: 'vl-fm-move', icon: 'folderInput', label: 'Move file to…', run: () => void move(ctx, note) },
      ...(ctx.on('pBookmarks') ? [{ id: 'vl-fm-mark', icon: marked ? 'bookmarkMinus' : 'bookmarkPlus', label: marked ? 'Remove bookmark' : 'Bookmark', run: () => ctx.bookmark(note.id, !marked) }] : []),
    ] : [] },
    { rows: [{ id: 'vl-fm-copy', icon: 'copy', label: 'Copy path', run: () => void copyText(`${path ? `${path}/` : ''}${note.title || 'Untitled'}.md`, { toasts: { show: m => ctx.toast(m) } }) }] },
    { rows: write ? [{ id: 'vl-fm-delete', icon: 'trash2', label: 'Delete', danger: true, run: () => void remove(ctx, note) }] : [] },
  ]);
}

/** @param {Ctx} ctx @param {string} path */
export function folderMenu(ctx, path) {
  const write = ctx.canWrite();
  const full = ctx.notes().some(n => inside(n, path));
  showMenu(lastPart(path), [
    { rows: write ? [{ id: 'vl-fm-new', icon: 'squarePen', label: 'New note here', run: () => void ctx.create(path) }] : [] },
    { rows: write ? [{ id: 'vl-fm-rename', icon: 'pencil', label: 'Rename folder…', run: () => void renameFolder(ctx, path) }] : [] },
    { rows: [{ id: 'vl-fm-copy', icon: 'copy', label: 'Copy path', run: () => void copyText(path, { toasts: { show: m => ctx.toast(m) } }) }] },
    { rows: write ? [{
      id: 'vl-fm-delete', icon: 'trash2', label: 'Delete folder', danger: true, disabled: full, hint: full ? 'Move its notes first' : undefined,
      run: () => {
        const s = ctx.state().get();
        ctx.state().set({ folders: s.folders.filter(f => f !== path && !f.startsWith(path + '/')), opened: s.opened.filter(f => f !== path && !f.startsWith(path + '/')) });
        ctx.redraw();
        ctx.toast(`Deleted “${lastPart(path)}”`);
      },
    }] : [] },
  ]);
}
