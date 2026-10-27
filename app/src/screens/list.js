// The notes list (#list-view): every note in the person's vault under a slim bar (the space, Today, + for a new note)
// and a search box (@core/search over title, body and tags, with tag: and path: operators). The drawer (#drawer, the
// bar's ☰) shows one folder or tag, and holds Go to note and the space's Members and New space. A note opens on its
// own page (note-page.js); the quick switcher and command palette (picker.js) reach notes and actions from the
// keyboard. A save the server refused waits in the kit's refused list.
import { refusedList, toaster, emptyState } from '@core/ui';
import { createSearch } from '@core/search';
import { COLL } from '../cloud.js';
import { isoDay } from '../notes/model.js';
import { $, input, dialog, sectionScreen } from '../shell/dom.js';
import { notePage } from './note-page.js';
import { picker } from './picker.js';
import { transferSheet } from '../transfer/transfer-sheet.js';
import { driveSheet } from '../drive/drive-sheet.js';

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
  // the drawer's choice: '' (all notes), 'tag:<tag>' or 'path:<folder>'
  let shown = '';
  const drawer = dialog('drawer');
  /** @param {string} value @param {string} label @param {number} count @param {number} [depth] */
  const choice = (value, label, count, depth = 0) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.dataset.filter = value;
    b.textContent = label;
    const n = document.createElement('span');
    n.className = 'n'; n.textContent = String(count);
    b.append(n);
    if (depth) b.style.setProperty('--depth', String(depth));
    li.append(b);
    return li;
  };
  // the drawer's folders (a tree, each with how many notes are in it or under it) and tags; a choice gone from the
  // space (its last note moved or deleted, another space opened) goes back to all notes
  const fillDrawer = () => {
    const tags = [...new Set(all.flatMap(n => n.tags || []))].sort();
    const folders = [...new Set(all.flatMap(n => (n.path || '').split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))).filter(Boolean))].sort();
    $('drawer-folders').replaceChildren(...folders.map(f => choice('path:' + f, f.split('/').pop() + '/', all.filter(n => inFolder(n, f)).length, f.split('/').length - 1)));
    $('drawer-tags').replaceChildren(...tags.map(t => choice('tag:' + t, '#' + t, all.filter(n => hasTag(n, t)).length)));
    $('drawer-folders-box').hidden = !folders.length;
    $('drawer-tags-box').hidden = !tags.length;
    if (shown && !(shown.startsWith('tag:') ? tags.includes(shown.slice(4)) : folders.includes(shown.slice(5)))) shown = '';
    for (const b of drawer.querySelectorAll('button[data-filter]')) b.setAttribute('aria-current', String(/** @type {HTMLElement} */ (b).dataset.filter === shown));
    $('filter-chip').hidden = !shown;
    $('filter-name').textContent = !shown ? '' : shown.startsWith('tag:') ? '#' + shown.slice(4) : shown.slice(5) + '/';
  };
  /** @param {string} value */
  const showOnly = value => { shown = value; draw(all, new Set()); };
  drawer.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    // every button here leads somewhere else: the drawer closes first (another sheet may open)
    drawer.close();
    if (b.dataset.filter !== undefined) showOnly(b.dataset.filter);
  }, true);
  $('drawer-open').addEventListener('click', () => drawer.showModal());
  $('filter-clear').addEventListener('click', () => showOnly(''));
  /** the notes the box and the filter leave in, in the order to show them */
  const visible = () => {
    const f = shown, q = input('q').value.trim();
    const kept = !f ? all : all.filter(n => f.startsWith('tag:') ? hasTag(n, f.slice(4)) : inFolder(n, f.slice(5)));
    if (!q) { $('search-msg').textContent = ''; return [...kept].sort((a, b) => titleOf(a).localeCompare(titleOf(b))); }
    const { hits, unknown } = search.search(q, { limit: 1000 });
    $('search-msg').textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
    const byId = new Map(kept.map(i => [i.id, i]));
    return hits.map(h => byId.get(h.id)).filter(/** @returns {i is Note} */ i => !!i);
  };
  const toast = toaster($('toasts')).show;
  const page = notePage(app, toast, () => canWrite);
  // a new note: its page opens empty, in the folder for new notes; the first title or text typed makes it
  const newNote = () => {
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'edit') /** @type {HTMLDialogElement} */ (d).close();
    void page.draft(String(app.settings.get('newFolder') || ''));
  };
  const empty = emptyState($('empty'), { title: 'No notes yet', hint: 'Notes you write show up here.', action: { label: 'Write the first note', onClick: newNote } });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: titleOf });
  $('new').addEventListener('click', newNote);
  const daily = async () => {
    const { note, refused } = await app.daily(isoDay(), String(app.settings.get('dailyFolder') || ''));
    if (refused) toast(refused); else void page.open(note);
  };
  $('daily').addEventListener('click', () => void daily());
  /** a note by its title: the one there is, or a new one @param {string} title */
  const openTitle = async title => {
    const have = app.find(title);
    if (have) { void page.open(have); return; }
    const { note, refused } = await app.create({ title });
    toast(refused || 'Added');
    if (!refused) void page.open(note);
  };
  /** @param {string} key */
  const flip = key => () => app.settings.set(key, !app.settings.get(key));
  const inNote = () => !!page.current();
  const transfer = transferSheet(app, msg => toast(msg), () => canWrite);
  $('open-transfer').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings')).close(); transfer.open(); });
  /** @type {import('../cloud.js').OpenSpace | undefined} */ let openSpace;
  const drive = driveSheet(app, msg => toast(msg), () => openSpace);
  $('open-drive').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings')).close(); drive.open(); });
  const pick = picker({
    notes: app.notes, recent: page.recent, canWrite: () => canWrite,
    open: note => page.open(note), create: openTitle,
    commands: [
      { id: 'go', label: 'Go to note', run: () => pick.switcher() },
      { id: 'new', label: 'New note', when: () => canWrite, run: newNote },
      { id: 'today', label: 'Open today’s note', when: () => canWrite, run: daily },
      { id: 'search', label: 'Search notes', run: () => { for (const d of document.querySelectorAll('dialog[open]')) /** @type {HTMLDialogElement} */ (d).close(); input('q').focus(); } },
      { id: 'read', label: 'Toggle read view', when: inNote, run: page.toggleRead },
      { id: 'tidy', label: 'Tidy this note’s Markdown', when: () => inNote() && canWrite, run: page.tidy },
      { id: 'delete', label: 'Delete this note', when: () => inNote() && canWrite, run: page.remove },
      { id: 'source', label: 'Toggle source mode (Markdown as written)', run: flip('sourceMode') },
      { id: 'numbers', label: 'Toggle line numbers', run: flip('lineNumbers') },
      { id: 'width', label: 'Toggle readable line width', run: flip('readableWidth') },
      { id: 'transfer', label: 'Import or export notes', run: transfer.open },
      { id: 'drive', label: 'Google Drive', run: drive.open },
      { id: 'settings', label: 'Open settings', run: () => $('open-settings').click() },
    ],
  });
  $('go-to').addEventListener('click', () => pick.switcher());

  input('q').addEventListener('input', () => draw(all, new Set()));
  // "/" jumps to the box on a computer
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
    e.preventDefault(); input('q').focus();
  });

  const section = sectionScreen('list-view', s => {
    $('drawer-open').hidden = false;
    const could = canWrite;
    openSpace = s.space;
    // writing needs an app role that writes and, in a shared space, owner or edit there
    canWrite = (s.role === 'admin' || s.role === 'member') && (s.space?.role === 'owner' || s.space?.role === 'edit');
    $('new').hidden = !canWrite;
    $('daily').hidden = !canWrite;
    // (a screen change is a view transition, so the list can be drawn before the role arrives)
    if (canWrite !== could) draw(all, new Set());
  });
  const screen = { ...section, hide() { $('drawer-open').hidden = true; drawer.close(); section.hide(); } };
  /** @param {Note[]} notes @param {Set<string>} changed */
  const draw = (notes, changed) => {
    all = notes; feed(notes); fillDrawer();
    const list = visible();
    $('items').replaceChildren(...list.map(note => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = titleOf(note);
      if (note.path) {
        const p = document.createElement('span');
        p.className = 'path'; p.textContent = ` ${note.path}/`;
        b.append(p);
      }
      b.addEventListener('click', () => void page.open(note));
      li.classList.toggle('changed', changed.has(note.id));
      li.append(b);
      return li;
    }));
    $('count').textContent = list.length === notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : `${list.length} of ${notes.length} notes`;
    empty.show(notes.length === 0 && canWrite);
    page.redraw();
    page.drawn();
  };
  return {
    ...screen,
    /** @param {Note[]} notes @param {Set<string>} changed  ids changed (here or elsewhere) since the last draw */
    draw,
    toast,
    /** the open space's attachments changed */
    files: () => page.redrawFiles(),
  };
}
