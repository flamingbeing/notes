// The notes list (#list-view, the kit's adaptive shell): every note in the person's vault in the list pane, with a search
// box (@core/search over title, body and tags, with tag: and path: operators). Folders and tags are the side bar's
// (tablet and laptop) and, on a phone, the Folders tab's page (#folders): one folder or tag at a time. A note opens on its
// own page (note-page.js): full screen on a phone, beside the list from 600 px. Hold or right-click a row for its menu;
// Select (when bulk edit is on) is the kit's select mode. The quick switcher and command palette (picker.js) reach
// notes and actions from the keyboard. A save the server refused waits in the kit's refused list.
import { refusedList, toaster, emptyState, adaptiveShell, confirmModal } from '@core/ui';
import { createSearch } from '@core/search';
import { COLL } from '../cloud.js';
import { isoDay } from '../notes/model.js';
import { $, input, dialog, sectionScreen } from '../shell/dom.js';
import { notePage } from './note-page.js';
import { picker } from './picker.js';
import { transferSheet } from '../transfer/transfer-sheet.js';
import { backupSheet } from '../transfer/backup-sheet.js';
import { driveSheet } from '../drive/drive-sheet.js';
import { mcpSheet } from '../mcp/mcp-sheet.js';
import { binSheet } from '../bin/bin-sheet.js';
import { bulkSheet } from '../bulk/bulk-sheet.js';
import { shareSheet } from '../share/share-sheet.js';
import { feedbackSheet } from '../feedback/feedback-sheet.js';

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

/** @param {import('../cloud.js').Started} app @param {ReturnType<typeof import('@core/ui').startGestures>} kit  the started gesture parts (select mode) */
export function listScreen(app, kit) {
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
  const foldersPage = $('folders');
  const side = /** @type {HTMLElement} */ ($('list-view').querySelector('.ui-sidebar'));
  const items = $('items');
  const select = () => kit.selects.get('items');
  /** @param {string} value @param {string} label @param {number} count @param {number} [depth] @param {boolean} [inSide]  the side bar's button, not the sheet's list item */
  const choice = (value, label, count, depth = 0, inSide = false) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.dataset.filter = value;
    if (inSide) b.className = 'ui-side-link';
    b.textContent = label;
    const n = document.createElement('span');
    n.className = 'n'; n.textContent = String(count);
    b.append(n);
    if (depth) b.style.setProperty('--depth', String(depth));
    li.append(b);
    return inSide ? b : li;
  };
  // the drawer's folders (a tree, each with how many notes are in it or under it) and tags; a choice gone from the
  // space (its last note moved or deleted, another space opened) goes back to all notes
  const fillDrawer = () => {
    const tags = [...new Set(all.flatMap(n => n.tags || []))].sort();
    const folders = [...new Set(all.flatMap(n => (n.path || '').split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))).filter(Boolean))].sort();
    const folderChoices = (/** @type {boolean} */ inSide) => folders.map(f => choice('path:' + f, f.split('/').pop() + '/', all.filter(n => inFolder(n, f)).length, f.split('/').length - 1, inSide));
    const tagChoices = (/** @type {boolean} */ inSide) => tags.map(t => choice('tag:' + t, '#' + t, all.filter(n => hasTag(n, t)).length, 0, inSide));
    // both places list the same choices: the Folders tab (phone) and the side bar (tablet and laptop)
    $('drawer-folders').replaceChildren(...folderChoices(false));
    $('drawer-tags').replaceChildren(...tagChoices(false));
    $('side-folders').replaceChildren(...folderChoices(true));
    $('side-tags').replaceChildren(...tagChoices(true));
    $('drawer-folders-box').hidden = $('side-folders-box').hidden = !folders.length;
    $('drawer-tags-box').hidden = $('side-tags-box').hidden = !tags.length;
    if (shown && !(shown.startsWith('tag:') ? tags.includes(shown.slice(4)) : folders.includes(shown.slice(5)))) shown = '';
    for (const b of foldersPage.querySelectorAll('button[data-filter]')) b.setAttribute('aria-current', String(/** @type {HTMLElement} */ (b).dataset.filter === shown));
    for (const b of side.querySelectorAll('button[data-filter]')) {
      if (/** @type {HTMLElement} */ (b).dataset.filter === shown) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    $('count-side').textContent = String(all.length);
    $('filter-chip').hidden = !shown;
    $('filter-name').textContent = !shown ? '' : shown.startsWith('tag:') ? '#' + shown.slice(4) : shown.slice(5) + '/';
  };
  /** @param {string} value */
  const showOnly = value => { shown = value; draw(all, new Set()); };
  foldersPage.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    // a folder or tag leads back to the list; the other buttons open their own sheets
    if (b.dataset.filter !== undefined) { showOnly(b.dataset.filter); kit.tabs?.go('#home'); }
  });
  side.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (b?.dataset.filter !== undefined) showOnly(b.dataset.filter);
  });
  // tapping Notes again (not coming back from another tab) shows every note
  $('tab-notes').addEventListener('click', () => { if (kit.tabs && kit.tabs.current() !== $('home')) return; input('q').value = input('q-w').value = ''; showOnly(''); });
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
  const page = notePage(app, toast, () => canWrite, note => markOpen(note.id));
  // a new note: its page opens empty, in the folder for new notes; the first title or text typed makes it
  const newNote = () => {
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'edit') /** @type {HTMLDialogElement} */ (d).close();
    void page.draft(String(app.settings.get('newFolder') || ''));
  };
  const empty = emptyState($('empty'), { title: 'No notes yet', hint: 'Notes you write show up here.', action: { label: 'Write the first note', onClick: newNote } });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: titleOf });
  // (the phone's bar and the wide layouts' list header each have the buttons)
  const twice = (/** @type {string} */ id) => [$(id), $(id + '-w')];
  for (const b of twice('new')) b.addEventListener('click', newNote);
  const daily = async () => {
    const { note, refused } = await app.daily(isoDay(), String(app.settings.get('dailyFolder') || ''));
    if (refused) toast(refused); else void page.open(note);
  };
  for (const b of twice('daily')) b.addEventListener('click', () => void daily());
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
  const backup = backupSheet(app, msg => toast(msg), () => canWrite);
  $('open-transfer').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings-panel')).close(); backup.reset(); transfer.open(); });
  /** @type {import('../cloud.js').OpenSpace | undefined} */ let openSpace;
  const drive = driveSheet(app, msg => toast(msg), () => openSpace);
  $('open-drive').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings-panel')).close(); drive.open(); });
  const mcp = mcpSheet(app, msg => toast(msg));
  $('open-mcp').addEventListener('click', () => { /** @type {HTMLDialogElement} */ ($('settings-panel')).close(); mcp.open(); });
  // the modules that are off until a device turns them on (settings: binScreen, bulkEdit, shareIn, feedbackOn, mcpOn)
  const on = (/** @type {string} */ key) => !!app.settings.get(key);
  /** @type {string | undefined} */ let role;
  const bin = binSheet(app, msg => toast(msg), () => canWrite);
  const bulk = bulkSheet(app, msg => toast(msg));
  const share = shareSheet(app, msg => toast(msg), note => void page.open(note));
  const feedback = feedbackSheet(app, msg => toast(msg), () => role === 'admin');
  const closeSettings = () => /** @type {HTMLDialogElement} */ ($('settings-panel')).close();
  $('open-bin').addEventListener('click', () => { closeSettings(); bin.open(); });
  $('open-feedback').addEventListener('click', () => { closeSettings(); feedback.open(); });
  const modules = () => {
    $('open-bin').hidden = !on('binScreen');
    $('open-mcp').hidden = !on('mcpOn');
    $('open-feedback').hidden = !on('feedbackOn') || !(role === 'admin' || role === 'member');
    const noSelect = !on('bulkEdit') || !canWrite;
    for (const b of twice('select')) b.hidden = noSelect;
    if (noSelect) select()?.setEditing(false);
    menu();
  };
  // the hold menu (right-click on a computer): what a row can do now
  const menu = () => {
    const item = (/** @type {string} */ action, /** @type {string} */ label, cls = '') => `<button class="ui-menu-item ${cls}" data-action="${action}">${label}</button>`;
    /** @type {HTMLTemplateElement} */ ($('row-menu')).innerHTML = item('open', 'Open')
      + (on('bulkEdit') && canWrite ? item('select', 'Select') : '')
      + (canWrite ? '<hr>' + item('delete', 'Delete', 'danger') : '');
  };
  /** the notes ticked in select mode */
  const ticked = () => (select()?.selected() || []).map(r => all.find(n => n.id === r.dataset.id)).filter(/** @returns {n is Note} */ n => !!n);
  $('bulk-edit').addEventListener('click', () => bulk.open(ticked(), () => select()?.setEditing(false)));
  items.addEventListener('ui-menu', async e => {
    const row = /** @type {HTMLElement} */ (e.target), { action } = /** @type {CustomEvent} */ (e).detail;
    const note = all.find(n => n.id === row.dataset.id);
    if (!note) return;
    if (action === 'open') void page.open(note);
    else if (action === 'select') items.dispatchEvent(new CustomEvent('ui-edit', { detail: { row } }));
    else if (action === 'delete' && canWrite && await confirmModal('Delete this note? It goes to the bin.', { title: 'Delete note', danger: true, yes: 'Delete' })) {
      await app.remove(note);
      toast('Deleted');
    }
  });
  app.settings.watch(null, modules);
  let swept = false;
  const pick = picker({
    notes: app.notes, recent: page.recent, canWrite: () => canWrite,
    open: note => page.open(note), create: openTitle,
    commands: [
      { id: 'go', label: 'Go to note', run: () => pick.switcher() },
      { id: 'new', label: 'New note', when: () => canWrite, run: newNote },
      { id: 'today', label: 'Open today’s note', when: () => canWrite, run: daily },
      { id: 'search', label: 'Search notes', run: () => { for (const d of document.querySelectorAll('dialog:modal')) /** @type {HTMLDialogElement} */ (d).close(); focusSearch(); } },
      { id: 'read', label: 'Toggle read view', when: inNote, run: page.toggleRead },
      { id: 'tidy', label: 'Tidy this note’s Markdown', when: () => inNote() && canWrite, run: page.tidy },
      { id: 'delete', label: 'Delete this note', when: () => inNote() && canWrite, run: page.remove },
      { id: 'source', label: 'Toggle source mode (Markdown as written)', run: flip('sourceMode') },
      { id: 'numbers', label: 'Toggle line numbers', run: flip('lineNumbers') },
      { id: 'width', label: 'Toggle readable line width', run: flip('readableWidth') },
      { id: 'transfer', label: 'Import or export notes', run: transfer.open },
      { id: 'drive', label: 'Google Drive', run: drive.open },
      { id: 'settings', label: 'Open settings', run: () => ($('open-settings-w').getClientRects().length ? $('open-settings-w') : $('open-settings')).click() },
    ],
  });
  $('go-to').addEventListener('click', () => pick.switcher());

  // the search box is in two places (under the phone's title, at the top of the side bar); they show the same words
  const boxes = [input('q'), input('q-w')];
  for (const box of boxes) box.addEventListener('input', () => { for (const o of boxes) if (o !== box) o.value = box.value; draw(all, new Set()); });
  const focusSearch = () => { const box = boxes.find(b => b.getClientRects().length > 0) || boxes[0]; box.focus(); box.select(); };
  // "/" and Ctrl/Cmd+K jump to the box on a computer (the note beside the list is not a dialog to wait behind)
  document.addEventListener('keydown', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const k = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
    if (!k && (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('dialog:modal')) return;
    e.preventDefault(); focusSearch();
  });

  const section = sectionScreen('list-view', s => {
    $('drawer-open').hidden = false;
    const could = canWrite;
    openSpace = s.space;
    // writing needs an app role that writes and, in a shared space, owner or edit there
    canWrite = (s.role === 'admin' || s.role === 'member') && (s.space?.role === 'owner' || s.space?.role === 'edit');
    role = s.role;
    modules();
    for (const b of [...twice('new'), ...twice('daily')]) b.hidden = !canWrite;
    // (a screen change is a view transition, so the list can be drawn before the role arrives)
    if (canWrite !== could) draw(all, new Set());
  });
  const screen = { ...section, hide() { $('drawer-open').hidden = true; section.hide(); } };

  /** @type {Map<string, HTMLElement>} id -> its row: a row is kept (with its tick, focus and place) while its note is in the list */
  const rows = new Map();
  /** @param {Note} note @param {boolean} changed */
  const rowOf = (note, changed) => {
    let li = rows.get(note.id);
    if (!li) {
      li = document.createElement('li');
      li.className = 'ui-row'; li.tabIndex = 0;
      li.dataset.holdMenu = '#row-menu'; li.dataset.id = note.id;
      rows.set(note.id, li);
    }
    const name = titleOf(note), path = note.path || '';
    if (li.dataset.name !== name || (li.dataset.path ?? '') !== path) {
      li.dataset.name = name; li.dataset.path = path;
      const main = document.createElement('span');
      main.className = 'ui-row-main'; main.append(name);
      if (path) {
        const sub = document.createElement('span');
        sub.className = 'ui-row-sub'; sub.textContent = ` ${path}/`;
        main.append(sub);
      }
      li.replaceChildren(main);
    }
    li.classList.toggle('changed', changed);
    return li;
  };
  /** the row of the note open beside the list is the current one @param {string} id */
  const markOpen = id => { for (const [k, li] of rows) { if (k === id) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); } };
  // the kit's shell: a row opens its note in the note page (full screen on a phone, beside the list from 600 px)
  adaptiveShell($('list-view'), { screens: null, render: row => { const n = all.find(x => x.id === row.dataset.id); if (n) void page.open(n); } });
  $('edit').addEventListener('close', () => markOpen(''));
  /** @param {Note[]} notes @param {Set<string>} changed */
  const draw = (notes, changed) => {
    all = notes; feed(notes); fillDrawer();
    const list = visible();
    const want = new Set(list.map(n => n.id));
    for (const [id, li] of rows) if (!want.has(id)) { li.remove(); rows.delete(id); }
    // in order, moving only the rows that are out of place
    let at = items.firstElementChild;
    for (const note of list) {
      const li = rowOf(note, changed.has(note.id));
      if (li === at) at = at.nextElementSibling; else items.insertBefore(li, at);
    }
    $('count').textContent = list.length === notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : `${list.length} of ${notes.length} notes`;
    empty.show(notes.length === 0 && canWrite);
    if (!swept && canWrite) {   // once per page: a share that opened it (an empty space too), and the bin's 30-day purge
      swept = true;
      void share.check();
      void bin.sweep();
    }
    page.redraw();
    page.drawn();
    const open = page.current();
    if (open) markOpen(open.id);
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
