// The left sidebar's Files view: the notes as a tree of folders (vault-ui/tree.js), folders first, in the order this
// device chose; the bookmarks on top; a tap opens a note (the drawer shuts) or folds a folder; a long-press or
// right-click is the row's menu (file-menu.js). Its tools: a new note in the folder last used here, a new folder (kept
// on this device until a note is in it), the sort, fold or unfold every folder, and show the note open.
import { glyph } from './icons.js';
import { bottomSheet } from './sheet.js';
import { buildTree, cleanPath, foldersAbove, visibleRows } from './tree.js';

/** @typedef {import('./left.js').Ctx} Ctx */

const SORT_ROWS = /** @type {const} */ ([
  ['name-asc', 'File name (A to Z)'], ['name-desc', 'File name (Z to A)'],
  ['mtime-desc', 'Modified time (new to old)'], ['mtime-asc', 'Modified time (old to new)'],
]);

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

/** @param {Ctx} ctx */
export function filesView(ctx) {
  const box = el('div', { id: 'vl-files' });
  const marks = el('div', { className: 'vl-marks', hidden: true });
  marks.setAttribute('role', 'group');
  marks.setAttribute('aria-label', 'Bookmarks');
  const tree = el('div', { className: 'vl-tree' });
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', 'Files');
  box.append(marks, tree);
  const st = () => ctx.state();
  /** the folder new notes and folders go in: the one last tapped or made here (else the setting's) */
  let here = /** @type {string | null} */ (null);
  const folderNow = () => here ?? cleanPath(ctx.app.settings.get('newFolder'));

  const newNote = ctx.tool('vl-files-new', 'New note', 'squarePen', () => ctx.create(folderNow()));
  const newFolder = ctx.tool('vl-files-folder', 'New folder', 'folderPlus', async () => {
    const m = await ctx.menu();
    const name = await m.askText({ title: 'New folder', label: 'Folder name', value: '' });
    const clean = cleanPath(name);
    if (!clean) return;
    const path = cleanPath(`${folderNow()}/${clean}`);
    st().set({ folders: [...st().get().folders.filter(f => f !== path), path], shut: st().get().shut.filter(s => !foldersAbove(path).includes(s)) });
    here = path;
    redraw();
    ctx.redraw();
    reveal(`f:${path}`);
  });
  const sortSheet = bottomSheet({ id: 'vl-files-sort-sheet', label: 'Sort files', cards: () => [
    { rows: SORT_ROWS.map(([key, label]) => ({ id: `vl-sort-${key}`, label, ticked: st().get().fileSort === key, run: () => { st().set({ fileSort: key }); redraw(); } })) },
  ] });
  const sort = ctx.tool('vl-files-sort', 'Change sort order', 'arrowUpNarrowWide', () => sortSheet.open());
  const fold = ctx.tool('vl-files-fold', 'Collapse all', 'chevronsDownUp', () => {
    const { paths } = buildTree(ctx.notes(), ctx.extraFolders());
    st().set({ shut: anyOpen ? paths : [] });
    redraw();
  });
  const show = ctx.tool('vl-files-reveal', 'Show the open note', 'galleryVerticalEnd', () => {
    const n = ctx.current();
    if (!n) return;
    const above = foldersAbove(n.path || '');
    st().set({ shut: st().get().shut.filter(s => !above.includes(s)) });
    redraw();
    reveal(`n:${n.id}`);
  });
  if (!ctx.canWrite()) { newNote.hidden = true; newFolder.hidden = true; }

  /** @param {string} key */
  const reveal = key => requestAnimationFrame(() => {
    const row = /** @type {HTMLElement | null} */ (tree.querySelector(`[data-key="${CSS.escape(key)}"]`));
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  });

  let anyOpen = true;
  const redraw = () => {
    const write = ctx.canWrite();
    newNote.hidden = !write;
    newFolder.hidden = !write;
    const s = st().get();
    const { root, paths } = buildTree(ctx.notes(), ctx.extraFolders(), s.fileSort);
    const shut = new Set(s.shut);
    anyOpen = paths.some(p => !shut.has(p));
    fold.replaceChildren(glyph(anyOpen ? 'chevronsDownUp' : 'chevronsUpDown'));
    fold.setAttribute('aria-label', anyOpen ? 'Collapse all' : 'Expand all');
    fold.hidden = !paths.length;
    const open = ctx.current()?.id || '';
    tree.replaceChildren(...visibleRows(root, p => shut.has(p)).map(r => {
      const b = el('button', { type: 'button', className: 'vl-tree-row' });
      b.dataset.row = '';
      b.setAttribute('role', 'treeitem');
      b.setAttribute('aria-level', String(r.depth + 1));
      b.style.setProperty('--d', String(r.depth));
      if (r.kind === 'folder') {
        b.classList.add('vl-folder');
        b.dataset.path = r.path;
        b.dataset.key = `f:${r.path}`;
        b.setAttribute('aria-expanded', String(!shut.has(r.path)));
        b.append(glyph('chevronRight', 'vl-chev'));
      } else {
        b.dataset.id = r.id;
        b.dataset.key = `n:${r.id}`;
        if (r.id === open) { b.classList.add('vl-on'); b.setAttribute('aria-current', 'page'); }
      }
      b.append(el('span', { className: 'vl-tree-name', textContent: r.name }));
      return b;
    }));
    if (!tree.children.length) {
      const none = el('p', { className: 'vl-none', textContent: 'No files yet' });
      none.dataset.faint = '';
      tree.append(none);
    }
    tree.setAttribute('role', tree.querySelector('[data-row]') ? 'tree' : 'group');
    drawMarks();
  };

  // the bookmarks card: the notes bookmarked on this device (with Bookmarks on)
  const drawMarks = () => {
    const byId = new Map(ctx.notes().map(n => [n.id, n]));
    const list = ctx.on('pBookmarks') ? ctx.state().get().bookmarks.map(id => byId.get(id)).filter(n => !!n) : [];
    marks.hidden = !list.length;
    marks.replaceChildren(...list.map(n => {
      const b = el('button', { type: 'button', className: 'vl-mark-row' }, glyph('bookmark'), el('span', { textContent: n?.title || 'Untitled' }));
      b.dataset.row = '';
      b.dataset.id = String(n?.id);
      return b;
    }));
  };

  /** @param {HTMLElement | null} row */
  const noteOf = row => (row?.dataset.id ? ctx.notes().find(n => n.id === row.dataset.id) : undefined);
  box.addEventListener('click', e => {
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-row]'));
    if (!row) return;
    if (row.dataset.path !== undefined) {
      const p = row.dataset.path;
      here = p;
      const s = st().get().shut;
      st().set({ shut: s.includes(p) ? s.filter(x => x !== p) : [...s, p] });
      redraw();
      reveal(`f:${p}`);
      return;
    }
    const n = noteOf(row);
    if (n) { here = cleanPath(n.path); void ctx.open(n); }
  });
  ctx.hold(box, async row => {
    const m = await ctx.menu();
    if (row.dataset.path !== undefined) m.folderMenu(ctx, row.dataset.path);
    else { const n = noteOf(row); if (n) m.noteMenu(ctx, n); }
  });
  // arrow keys move along the rows; right and left unfold and fold
  tree.addEventListener('keydown', e => {
    const rows = /** @type {HTMLElement[]} */ ([...tree.querySelectorAll('[data-row]')]);
    const i = rows.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0) return;
    const row = rows[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && row.dataset.path !== undefined) {
      const isOpen = row.getAttribute('aria-expanded') === 'true';
      if ((e.key === 'ArrowRight') !== isOpen) { e.preventDefault(); row.click(); }
    }
  });
  return { el: box, tools: [newNote, newFolder, sort, fold, show], redraw };
}
