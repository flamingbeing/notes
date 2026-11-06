// The left sidebar's Bookmarks view: the notes bookmarked on this device (kept per space, vault-ui/state.js; in the
// reference app they sync with the vault, which here would need a rules change: later), in the order they were added.
// A tap opens one, a long-press is its menu. Its tools: bookmark the note open, fold every group (groups come later),
// and a filter box.
import { glyph } from './icons.js';

/** @typedef {import('./left.js').Ctx} Ctx */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

/** @param {Ctx} ctx */
export function bookmarksView(ctx) {
  const box = el('div', { id: 'vl-bookmarks' });
  const filter = /** @type {HTMLInputElement} */ (el('input', { id: 'vl-bm-q', type: 'search', placeholder: 'Filter...', autocomplete: 'off' }));
  filter.setAttribute('aria-label', 'Filter bookmarks');
  const filterRow = el('div', { className: 'vl-filter', hidden: true }, glyph('search'), filter);
  const list = el('div', { className: 'vl-bm-list' });
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Bookmarks');
  box.append(filterRow, list);

  const add = ctx.tool('vl-bm-add', 'Bookmark the open note', 'bookmarkPlus', () => {
    const n = ctx.current();
    if (!n) { ctx.toast('Open a note to bookmark it.'); return; }
    ctx.bookmark(n.id, true);
  });
  const fold = ctx.tool('vl-bm-fold', 'Collapse all', 'chevronsDownUp', () => {});
  // (no groups yet: nothing to fold)
  fold.disabled = true;
  const find = ctx.tool('vl-bm-filter', 'Filter bookmarks', 'search', () => {
    filterRow.hidden = !filterRow.hidden;
    find.setAttribute('aria-pressed', String(!filterRow.hidden));
    if (filterRow.hidden) { filter.value = ''; redraw(); } else filter.focus();
  });
  find.setAttribute('aria-pressed', 'false');
  filter.addEventListener('input', () => redraw());

  const redraw = () => {
    const byId = new Map(ctx.notes().map(n => [n.id, n]));
    const q = filter.value.trim().toLowerCase();
    const open = ctx.current()?.id || '';
    add.disabled = !open || ctx.bookmarked(open);
    const rows = ctx.state().get().bookmarks.map(id => byId.get(id)).filter(n => !!n && (!q || (n.title || '').toLowerCase().includes(q))).map(n => {
      const b = el('button', { type: 'button', className: 'vl-tree-row vl-bm-row' }, el('span', { className: 'vl-tree-name', textContent: n?.title || 'Untitled' }));
      b.dataset.row = '';
      b.dataset.id = String(n?.id);
      b.style.setProperty('--d', '0');
      if (n?.id === open) { b.classList.add('vl-on'); b.setAttribute('aria-current', 'page'); }
      return b;
    });
    if (!rows.length) {
      const none = el('p', { className: 'vl-none', textContent: q ? 'No bookmarks match.' : 'No bookmarks found' });
      none.dataset.faint = '';
      list.replaceChildren(none);
    } else list.replaceChildren(...rows);
  };
  /** @param {HTMLElement | null} row */
  const noteOf = row => (row?.dataset.id ? ctx.notes().find(n => n.id === row.dataset.id) : undefined);
  list.addEventListener('click', e => {
    const n = noteOf(/** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-row]')));
    if (n) void ctx.open(n);
  });
  ctx.hold(list, async row => { const n = noteOf(row); if (n) (await ctx.menu()).noteMenu(ctx, n); });
  return { el: box, tools: [add, fold, find], redraw };
}
