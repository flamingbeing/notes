// The notes list (#list-view): every note in the person's vault, a search box (@core/search over title, body and tags,
// with tag: and path: operators), a filter by tag or folder, a new note by title, and today's daily note. A note opens
// in the note sheet (note-sheet.js); the quick switcher and command palette (picker.js) reach notes and actions from
// the keyboard. A save the server refused waits in the kit's refused list.
import { refusedList, toaster, emptyState } from '@core/ui';
import { createSearch } from '@core/search';
import { COLL } from '../cloud.js';
import { isoDay } from '../notes/model.js';
import { $, input, sectionScreen } from '../dom.js';
import { noteSheet } from './note-sheet.js';
import { picker } from './picker.js';
import { transferSheet } from '../transfer-sheet.js';

/** @typedef {import('../cloud.js').Note} Note */

/** @param {unknown} record  a note, or a refused save's record -> its title */
export const titleOf = record => String(/** @type {{ title?: unknown } | null} */ (record)?.title ?? '') || 'Untitled';
const low = (/** @type {unknown} */ s) => String(s ?? '').toLowerCase();
const bare = (/** @type {string} */ s) => low(s).replace(/^[#/]+|\/+$/g, '');
// a note has a tag when it has it or one under it (#a matches #a/b); it is in a folder when its path is that folder or
// one inside it
/** @param {Note} n @param {string} t */
export const hasTag = (n, t) => (n.tags || []).some(x => low(x) === bare(t) || low(x).startsWith(bare(t) + '/'));
/** @param {Note} n @param {string} f */
export const inFolder = (n, f) => low(n.path) === bare(f) || low(n.path).startsWith(bare(f) + '/');

/** @param {import('../cloud.js').Started} app */
export function listScreen(app) {
  let canWrite = false;
  // search over the notes: kept current from each draw (only notes whose text changed are fed)
  const search = createSearch({
    fields: ['title', 'body', 'tags'],
    operators: { tag: (rec, v) => hasTag(/** @type {Note} */ (rec), v), path: (rec, v) => inFolder(/** @type {Note} */ (rec), v) },
  });
  /** @type {Note[]} */
  let all = [];
  /** @type {Map<string, string>} id -> the text as indexed (a new subscription starts with no "changed" ids, so compare) */
  const known = new Map();
  const textOf = (/** @type {Note} */ n) => JSON.stringify([n.title, n.body, n.tags, n.path]);
  /** @param {Note[]} notes */
  const feed = notes => {
    const now = new Set(notes.map(i => i.id));
    for (const id of known.keys()) if (!now.has(id)) { search.remove(id); known.delete(id); }
    const stale = notes.filter(i => known.get(i.id) !== textOf(i));
    search.feed(stale);
    for (const i of stale) known.set(i.id, textOf(i));
  };
  const filter = () => /** @type {HTMLSelectElement} */ ($('filter'));
  // the filter's choices: every tag (#tag) and folder (path/) in the vault
  const fillFilter = () => {
    const sel = filter(), was = sel.value;
    const tags = [...new Set(all.flatMap(n => n.tags || []))].sort();
    const folders = [...new Set(all.flatMap(n => (n.path || '').split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))).filter(Boolean))].sort();
    const opt = (/** @type {string} */ value, /** @type {string} */ label) => Object.assign(document.createElement('option'), { value, textContent: label });
    sel.replaceChildren(opt('', 'All notes'), ...tags.map(t => opt('tag:' + t, '#' + t)), ...folders.map(f => opt('path:' + f, f + '/')));
    sel.value = [...sel.options].some(o => o.value === was) ? was : '';
    sel.hidden = sel.options.length < 2;
  };
  /** the notes the box and the filter leave in, in the order to show them */
  const visible = () => {
    const f = filter().value, q = input('q').value.trim();
    const kept = !f ? all : all.filter(n => f.startsWith('tag:') ? hasTag(n, f.slice(4)) : inFolder(n, f.slice(5)));
    if (!q) { $('search-msg').textContent = ''; return [...kept].sort((a, b) => titleOf(a).localeCompare(titleOf(b))); }
    const { hits, unknown } = search.search(q, { limit: 1000 });
    $('search-msg').textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
    const byId = new Map(kept.map(i => [i.id, i]));
    return hits.map(h => byId.get(h.id)).filter(/** @returns {i is Note} */ i => !!i);
  };
  const toast = toaster($('toasts')).show;
  const sheet = noteSheet(app, toast, () => canWrite);
  const empty = emptyState($('empty'), { title: 'No notes yet', hint: 'Notes you write show up here.', action: { label: 'Write the first note', onClick: () => input('new-text').focus() } });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: titleOf });
  $('add').addEventListener('submit', async e => {
    e.preventDefault();
    const title = input('new-text').value.trim();
    if (!title) return;
    input('new-text').value = '';
    await openTitle(title);   // a title is one note: open it rather than make a second
  });
  const daily = async () => {
    const { note, refused } = await app.daily(isoDay(), String(app.settings.get('dailyFolder') || ''));
    if (refused) toast(refused); else void sheet.open(note);
  };
  $('daily').addEventListener('click', () => void daily());
  /** a note by its title: the one there is, or a new one @param {string} title */
  const openTitle = async title => {
    const have = app.find(title);
    if (have) { void sheet.open(have); return; }
    const { note, refused } = await app.create({ title });
    toast(refused || 'Added');
    if (!refused) void sheet.open(note);
  };
  /** @param {string} key */
  const flip = key => () => app.settings.set(key, !app.settings.get(key));
  const inNote = () => !!sheet.current();
  const transfer = transferSheet(app, msg => toast(msg), () => canWrite);
  $('open-transfer').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings')).close(); transfer.open(); });
  const pick = picker({
    notes: app.notes, recent: sheet.recent, canWrite: () => canWrite,
    open: note => sheet.open(note), create: openTitle,
    commands: [
      { id: 'go', label: 'Go to note', run: () => pick.switcher() },
      { id: 'new', label: 'New note', when: () => canWrite, run: () => { for (const d of document.querySelectorAll('dialog[open]')) /** @type {HTMLDialogElement} */ (d).close(); input('new-text').focus(); } },
      { id: 'today', label: 'Open today’s note', when: () => canWrite, run: daily },
      { id: 'search', label: 'Search notes', run: () => { for (const d of document.querySelectorAll('dialog[open]')) /** @type {HTMLDialogElement} */ (d).close(); input('q').focus(); } },
      { id: 'read', label: 'Toggle read view', when: inNote, run: sheet.toggleRead },
      { id: 'tidy', label: 'Tidy this note’s Markdown', when: () => inNote() && canWrite, run: sheet.tidy },
      { id: 'delete', label: 'Delete this note', when: () => inNote() && canWrite, run: sheet.remove },
      { id: 'source', label: 'Toggle source mode (Markdown as written)', run: flip('sourceMode') },
      { id: 'numbers', label: 'Toggle line numbers', run: flip('lineNumbers') },
      { id: 'width', label: 'Toggle readable line width', run: flip('readableWidth') },
      { id: 'transfer', label: 'Import or export notes', run: transfer.open },
      { id: 'settings', label: 'Open settings', run: () => $('open-settings').click() },
    ],
  });
  $('go-to').addEventListener('click', () => pick.switcher());

  input('q').addEventListener('input', () => draw(all, new Set()));
  filter().addEventListener('change', () => draw(all, new Set()));
  // "/" jumps to the box on a computer
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
    e.preventDefault(); input('q').focus();
  });

  const screen = sectionScreen('list-view', s => {
    const could = canWrite;
    // writing needs an app role that writes and, in a shared space, owner or edit there
    canWrite = (s.role === 'admin' || s.role === 'member') && (s.space?.role === 'owner' || s.space?.role === 'edit');
    $('add').hidden = !canWrite;
    $('daily').hidden = !canWrite;
    // (a screen change is a view transition, so the list can be drawn before the role arrives)
    if (canWrite !== could) draw(all, new Set());
  });
  /** @param {Note[]} notes @param {Set<string>} changed */
  const draw = (notes, changed) => {
    all = notes; feed(notes); fillFilter();
    const list = visible();
    $('items').replaceChildren(...list.map(note => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = titleOf(note);
      if (note.path) {
        const p = document.createElement('span');
        p.className = 'path'; p.textContent = ` ${note.path}/`;
        b.append(p);
      }
      b.addEventListener('click', () => void sheet.open(note));
      li.classList.toggle('changed', changed.has(note.id));
      li.append(b);
      return li;
    }));
    $('count').textContent = list.length === notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : `${list.length} of ${notes.length} notes`;
    empty.show(notes.length === 0 && canWrite);
    sheet.redraw();
  };
  return {
    ...screen,
    /** @param {Note[]} notes @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw,
    toast,
    /** the open space's attachments changed */
    files: () => sheet.redrawFiles(),
  };
}
