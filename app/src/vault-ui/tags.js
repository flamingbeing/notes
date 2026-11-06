// The left sidebar's Tags view: every tag and how many notes have it (vault-ui/tree.js tagTree), nested by "/" or
// flat, by name or by how many; a tap searches for it (the Search view, tag:#name). Its tools: the sort, nested or
// flat, fold or unfold every tag with tags under it, and a filter box over the list.
import { glyph } from './icons.js';
import { bottomSheet } from './sheet.js';
import { tagTree } from './tree.js';

/** @typedef {import('./left.js').Ctx} Ctx */
/** @typedef {import('./tree.js').TagNode} TagNode */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

/** @param {Ctx} ctx */
export function tagsView(ctx) {
  const st = () => ctx.state();
  const box = el('div', { id: 'vl-tags' });
  const filter = /** @type {HTMLInputElement} */ (el('input', { id: 'vl-tags-q', type: 'search', placeholder: 'Filter...', autocomplete: 'off' }));
  filter.setAttribute('aria-label', 'Filter tags');
  const filterRow = el('div', { className: 'vl-filter', hidden: true }, glyph('search'), filter);
  const list = el('div', { className: 'vl-tag-list' });
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', 'Tags');
  box.append(filterRow, list);

  const sortSheet = bottomSheet({ id: 'vl-tags-sort-sheet', label: 'Sort tags', cards: () => [
    { rows: /** @type {const} */ ([['name', 'Tag name (A to Z)'], ['count', 'Frequency']]).map(([k, label]) => ({
      id: `vl-tagsort-${k}`, label, ticked: st().get().tagSort === k, run: () => { st().set({ tagSort: k }); redraw(); },
    })) },
  ] });
  const sort = ctx.tool('vl-tags-sort', 'Change sort order', 'arrowUpNarrowWide', () => sortSheet.open());
  const nested = ctx.tool('vl-tags-nested', 'Show nested tags', 'listTree', () => { st().set({ tagNested: !st().get().tagNested }); redraw(); });
  const fold = ctx.tool('vl-tags-fold', 'Collapse all', 'chevronsDownUp', () => {
    st().set({ tagShut: anyOpen ? parents.map(p => p.toLowerCase()) : [] });
    redraw();
  });
  const find = ctx.tool('vl-tags-filter', 'Filter tags', 'search', () => {
    filterRow.hidden = !filterRow.hidden;
    find.setAttribute('aria-pressed', String(!filterRow.hidden));
    if (filterRow.hidden) { filter.value = ''; redraw(); } else filter.focus();
  });
  find.setAttribute('aria-pressed', 'false');
  filter.addEventListener('input', () => redraw());

  let anyOpen = true;
  /** @type {string[]} the tags with tags under them */
  let parents = [];
  const redraw = () => {
    const s = st().get();
    nested.setAttribute('aria-pressed', String(s.tagNested));
    const all = tagTree(ctx.notes(), { sort: s.tagSort === 'count' ? 'count' : 'name', nested: s.tagNested });
    const q = filter.value.trim().replace(/^#/, '').toLowerCase();
    const shut = new Set(s.tagShut);
    parents = [];
    /** @param {TagNode[]} nodes */
    const walkParents = nodes => { for (const n of nodes) if (n.kids.length) { parents.push(n.full); walkParents(n.kids); } };
    walkParents(all);
    anyOpen = parents.some(p => !shut.has(p.toLowerCase()));
    fold.hidden = !s.tagNested || !parents.length;
    fold.replaceChildren(glyph(anyOpen ? 'chevronsDownUp' : 'chevronsUpDown'));
    fold.setAttribute('aria-label', anyOpen ? 'Collapse all' : 'Expand all');
    /** @type {HTMLElement[]} */
    const rows = [];
    /** @param {TagNode} n @returns {boolean} */
    const hit = n => !q || n.full.toLowerCase().includes(q) || n.kids.some(hit);
    /** @param {TagNode[]} nodes */
    const walk = nodes => {
      for (const n of nodes) {
        if (!hit(n)) continue;
        const key = n.full.toLowerCase();
        const isShut = !q && shut.has(key);
        const b = el('button', { type: 'button', className: 'vl-tag-row' });
        b.dataset.tag = n.full;
        b.setAttribute('role', 'treeitem');
        b.setAttribute('aria-level', String(n.depth + 1));
        b.style.setProperty('--d', String(n.depth));
        if (n.kids.length) {
          b.setAttribute('aria-expanded', String(!isShut));
          const chev = el('span', { className: 'vl-chev-btn' }, glyph('chevronDown', 'vl-chev'));
          chev.dataset.fold = key;
          b.append(chev);
        }
        const c = el('span', { className: 'vl-tag-count', textContent: String(n.count) });
        c.dataset.faint = '';
        b.append(el('span', { className: 'vl-tag-name', textContent: n.name }), c);
        rows.push(b);
        if (n.kids.length && !isShut) walk(n.kids);
      }
    };
    walk(all);
    if (!rows.length) {
      const none = el('p', { className: 'vl-none', textContent: q ? 'No tags match.' : 'No tags found' });
      none.dataset.faint = '';
      rows.push(none);
    }
    list.replaceChildren(...rows);
    list.setAttribute('role', rows[0]?.matches('button') ? 'tree' : 'group');
  };
  list.addEventListener('click', e => {
    const t = /** @type {Element} */ (e.target);
    const chev = /** @type {HTMLElement | null} */ (t.closest('[data-fold]'));
    if (chev) {
      const key = String(chev.dataset.fold);
      const s = st().get().tagShut;
      st().set({ tagShut: s.includes(key) ? s.filter(x => x !== key) : [...s, key] });
      redraw();
      return;
    }
    const row = /** @type {HTMLElement | null} */ (t.closest('[data-tag]'));
    if (row) ctx.searchFor(`tag:#${row.dataset.tag}`);
  });
  return { el: box, tools: [sort, nested, fold, find], redraw };
}
