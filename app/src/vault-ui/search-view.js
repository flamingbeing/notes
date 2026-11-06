// The left sidebar's Search view: a search box (Match case, clear, and the options: Collapse results, Show more context),
// what it matches, how many notes, the sort; then the notes whose title matches, and each note with the lines that
// match (vault-ui/search.js finds them; the app's own search, with tag:, path:, "phrases", -leave-outs and OR, picks
// the notes). With nothing typed, the recent searches. A tap on a result opens the note (the drawer shuts).
import { glyph } from './icons.js';
import { SEARCH_SORTS, SORT_LABELS, addRecent, searchResults } from './search.js';

/** @typedef {import('./left.js').Ctx} Ctx */
/** @typedef {import('./search.js').Part} Part */

const PAGE = 60;   // notes drawn at a time (more on "Show more")

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
/** @param {Part[]} parts */
const marks = parts => parts.map(p => (p.mark ? el('mark', { textContent: p.text }) : document.createTextNode(p.text)));
const faint = (/** @type {HTMLElement} */ e) => { e.dataset.faint = ''; return e; };

/** @param {Ctx} ctx */
export function searchView(ctx) {
  const st = () => ctx.state();
  const box = el('div', { id: 'vl-search-view' });
  const input = /** @type {HTMLInputElement} */ (el('input', { id: 'vl-search-input', type: 'search', placeholder: 'Search...', autocomplete: 'off', spellcheck: false, enterKeyHint: 'search' }));
  input.setAttribute('aria-label', 'Search');
  const kase = el('button', { type: 'button', id: 'vl-search-case', className: 'vl-search-case', textContent: 'Aa' });
  kase.setAttribute('aria-label', 'Match case');
  const clear = el('button', { type: 'button', id: 'vl-search-clear', className: 'vl-search-clear', hidden: true }, glyph('circleX', 'vl-filled'));
  clear.setAttribute('aria-label', 'Clear search');
  const field = el('div', { className: 'vl-search-field' }, glyph('search', 'vl-search-glyph'), input, kase, clear);
  const optsBtn = el('button', { type: 'button', id: 'vl-search-opts', className: 'vl-tool' }, glyph('slidersHorizontal'));
  optsBtn.setAttribute('aria-label', 'Search options');
  optsBtn.setAttribute('aria-expanded', 'false');
  /** @param {string} id @param {string} label @param {'searchCollapse' | 'searchContext'} key */
  const toggle = (id, label, key) => {
    const b = el('button', { type: 'button', id, className: 'vl-switch-row' }, el('span', { textContent: label }), el('span', { className: 'vl-switch' }));
    b.setAttribute('role', 'switch');
    b.addEventListener('click', () => { st().set({ [key]: !st().get()[key] }); if (key === 'searchCollapse') folded.clear(); redraw(); });
    return b;
  };
  const optCollapse = toggle('vl-search-collapse', 'Collapse results', 'searchCollapse');
  const optContext = toggle('vl-search-context', 'Show more context', 'searchContext');
  const opts = el('div', { id: 'vl-search-options', className: 'vl-search-options', hidden: true }, optCollapse, optContext);
  const matchLine = el('p', { className: 'vl-search-matches' });
  const count = el('span', { id: 'vl-search-count', className: 'vl-search-count' });
  const sort = /** @type {HTMLSelectElement} */ (el('select', { id: 'vl-search-sort', className: 'vl-search-sort' },
    ...SEARCH_SORTS.map(k => el('option', { value: k, textContent: SORT_LABELS[k] }))));
  sort.setAttribute('aria-label', 'Sort results');
  const sortWrap = el('span', { className: 'vl-select' }, sort, glyph('chevronsUpDown', 'vl-select-chev'));
  const head = el('div', { className: 'vl-search-head' }, count, sortWrap);
  const results = el('div', { id: 'vl-search-results', className: 'vl-search-results' });
  box.append(el('div', { className: 'vl-search-top' }, field, optsBtn), opts, matchLine, head, results);

  /** notes whose lines are folded away (a group's chevron; all of them start so with Collapse results) */
  const folded = new Set();
  let shown = PAGE;
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => { shown = PAGE; folded.clear(); redraw(); }, 120); clear.hidden = !input.value; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); remember(); input.blur(); } });
  input.addEventListener('change', remember);
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; redraw(); input.focus(); });
  kase.addEventListener('click', () => { st().set({ matchCase: !st().get().matchCase }); redraw(); });
  sort.addEventListener('change', () => { st().set({ searchSort: sort.value }); redraw(); });
  optsBtn.addEventListener('click', () => { opts.hidden = !opts.hidden; optsBtn.setAttribute('aria-expanded', String(!opts.hidden)); });
  function remember() {
    const q = input.value.trim();
    if (q) st().set({ searchRecent: addRecent(st().get().searchRecent, q) });
  }
  /** @param {string} q */
  const run = q => { input.value = q; clear.hidden = !q; shown = PAGE; folded.clear(); remember(); redraw(); };

  /** @param {string} id */
  const openId = id => {
    const n = ctx.notes().find(x => x.id === id);
    if (!n) return;
    remember();
    void ctx.open(n);
  };
  const redraw = () => {
    const s = st().get();
    kase.setAttribute('aria-pressed', String(s.matchCase));
    optCollapse.setAttribute('aria-checked', String(s.searchCollapse));
    optContext.setAttribute('aria-checked', String(s.searchContext));
    sort.value = s.searchSort;
    const q = input.value.trim();
    head.hidden = !q;
    matchLine.hidden = !q;
    if (!q) { drawRecent(s.searchRecent); return; }
    matchLine.textContent = `Matches text: “${q}”`;
    const hits = ctx.list.search(q, { limit: 5000 }).hits;
    const r = searchResults({ notes: ctx.notes(), hits, q, matchCase: s.matchCase, sort: s.searchSort, context: s.searchContext });
    count.textContent = `${r.total.toLocaleString()} ${r.total === 1 ? 'result' : 'results'}`;
    if (!r.total) { results.replaceChildren(faint(el('p', { className: 'vl-none', textContent: 'No matches found.' }))); return; }
    /** @type {Node[]} */
    const out = [];
    if (r.titles.length) {
      const sec = el('section', { className: 'vl-title-matches' });
      sec.append(el('h3', { className: 'vl-search-sec', textContent: `Title matches (${r.titles.length.toLocaleString()})` }));
      for (const t of r.titles.slice(0, shown)) {
        const b = el('button', { type: 'button', className: 'vl-title-row' }, ...marks(t.parts));
        b.dataset.id = t.id;
        sec.append(b);
      }
      out.push(sec);
    }
    for (const g of r.groups.slice(0, shown)) {
      if (s.searchCollapse && !folded.has(`!${g.id}`)) folded.add(g.id);
      const shut = folded.has(g.id);
      const chev = el('button', { type: 'button', className: 'vl-group-chev' }, glyph('chevronDown'));
      chev.setAttribute('aria-label', shut ? `Show the lines of ${g.title}` : `Hide the lines of ${g.title}`);
      chev.setAttribute('aria-expanded', String(!shut));
      chev.dataset.fold = g.id;
      const name = el('button', { type: 'button', className: 'vl-group-title', textContent: g.title });
      name.dataset.id = g.id;
      const n = faint(el('span', { className: 'vl-group-count', textContent: g.count ? String(g.count) : '' }));
      const group = el('section', { className: `vl-group${shut ? ' vl-shut' : ''}` }, el('div', { className: 'vl-group-head' }, chev, name, n));
      if (!shut) {
        for (const parts of g.snippets) {
          const c = el('button', { type: 'button', className: 'vl-snippet' }, ...marks(parts));
          c.dataset.id = g.id;
          group.append(c);
        }
      }
      out.push(group);
    }
    if (r.groups.length > shown || r.titles.length > shown) {
      const more = el('button', { type: 'button', className: 'vl-more-results', textContent: 'Show more results' });
      more.addEventListener('click', () => { shown += PAGE; redraw(); });
      out.push(more);
    }
    results.replaceChildren(...out);
  };
  /** @param {string[]} recent */
  const drawRecent = recent => {
    if (!recent.length) { results.replaceChildren(); return; }
    const sec = el('section', { className: 'vl-recent' }, el('h3', { className: 'vl-search-sec', textContent: 'Recent searches' }));
    for (const q of recent) {
      const b = el('button', { type: 'button', className: 'vl-recent-row' }, glyph('search'), el('span', { textContent: q }));
      b.dataset.q = q;
      sec.append(b);
    }
    results.replaceChildren(sec);
  };
  results.addEventListener('click', e => {
    const t = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('button'));
    if (!t) return;
    if (t.dataset.fold) {
      const id = t.dataset.fold;
      if (folded.has(id)) { folded.delete(id); folded.add(`!${id}`); } else { folded.add(id); folded.delete(`!${id}`); }
      redraw();
    } else if (t.dataset.q) run(t.dataset.q);
    else if (t.dataset.id) openId(t.dataset.id);
  });
  return {
    el: box, tools: [], redraw, run,
    shown: () => { if (!input.value && matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true }); },
  };
}
