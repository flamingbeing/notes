// The left sidebar's Notes view (with the Note list extra on): the Classic list's rows, newest first: the title, the
// folder, and three lines of the note. A tap opens it, a long-press is its menu.
import { previewOf, titleOf } from '../screens/list.js';

/** @typedef {import('./left.js').Ctx} Ctx */

const PAGE = 200;
/** @param {unknown} v */
const time = v => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

/** @param {Ctx} ctx */
export function notesView(ctx) {
  const box = el('div', { id: 'vl-notes-view' });
  const list = el('div', { className: 'vl-note-list' });
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Notes');
  box.append(list);
  let shown = PAGE;
  const add = ctx.tool('vl-notes-new', 'New note', 'squarePen', () => ctx.create(String(ctx.app.settings.get('newFolder') || '')));
  const redraw = () => {
    add.hidden = !ctx.canWrite();
    const open = ctx.current()?.id || '';
    const all = [...ctx.notes()].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    const rows = all.slice(0, shown).map(n => {
      const title = titleOf(n);
      const b = el('button', { type: 'button', className: 'vl-note-row' }, el('span', { className: 'vl-note-title', textContent: title }));
      if (n.path) { const f = el('span', { className: 'vl-note-folder', textContent: n.path }); f.dataset.muted = ''; b.append(f); }
      const p = previewOf(n, title);
      if (p) b.append(el('span', { className: 'vl-note-preview', textContent: p }));
      b.dataset.row = '';
      b.dataset.id = n.id;
      if (n.id === open) { b.classList.add('vl-on'); b.setAttribute('aria-current', 'page'); }
      return b;
    });
    if (all.length > shown) {
      const more = el('button', { type: 'button', className: 'vl-more-results', textContent: 'Show more' });
      more.addEventListener('click', () => { shown += PAGE; redraw(); });
      rows.push(more);
    }
    if (!rows.length) { const none = el('p', { className: 'vl-none', textContent: 'No notes yet' }); none.dataset.faint = ''; list.replaceChildren(none); return; }
    list.replaceChildren(...rows);
  };
  /** @param {HTMLElement | null} row */
  const noteOf = row => (row?.dataset.id ? ctx.notes().find(n => n.id === row.dataset.id) : undefined);
  list.addEventListener('click', e => {
    const n = noteOf(/** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-row]')));
    if (n) void ctx.open(n);
  });
  ctx.hold(list, async row => { const n = noteOf(row); if (n) (await ctx.menu()).noteMenu(ctx, n); });
  return { el: box, tools: [add], redraw };
}
