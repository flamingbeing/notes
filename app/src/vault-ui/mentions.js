// The Vault layout's "Backlinks in document": under the note, after a rule, "Linked mentions" and how many, with its
// tools (fold the snippets, more context, the sort, a filter), then one group per note linking here: its title (a tap
// opens it, a step in the history) and how many times, over a card per line holding a link, the link marked (a tap
// opens the note at that line). Last, "Unlinked mentions", folded: the notes naming this one without a link, worked
// out only when it is opened. Its choices are kept on this device (vault-ui/state.js). Drawn by note-ui.js.
import { glyph } from './icons.js';
import { bottomSheet } from './sheet.js';
import { linkedMentions, unlinkedMentions, filterGroups } from './mentions-data.js';

/** @typedef {import('../notes/model.js').Note} Note */
/** @typedef {import('./mentions-data.js').Group} Group */
/** @typedef {import('./mentions-data.js').Snippet} Snippet */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
/** @param {HTMLElement} e */
const faint = e => { e.dataset.faint = ''; return e; };

const SORTS = [
  ['name-asc', 'File name (A to Z)'], ['name-desc', 'File name (Z to A)'],
  ['mtime-desc', 'Modified time (new to old)'], ['mtime-asc', 'Modified time (old to new)'],
];

/**
 * @param {{
 *   host: HTMLElement, notes: () => Note[], current: () => Note | null,
 *   state: () => ReturnType<typeof import('./state.js').vaultState>,
 *   open: (note: Note, line?: number) => unknown, enabled: () => boolean, prefix?: string, id?: string,
 * }} o  host: where the block goes (after the note's text); open: a note opened (at a line); enabled: shown for the
 *   note open (the Backlinks plugin on, and the note's "Backlinks in document")
 */
export function mentionsBlock(o) {
  const p = o.prefix || 'vl-mn';
  const box = el('section', { id: o.id || 'vl-mentions', className: 'vl-mn', hidden: true });
  box.setAttribute('aria-labelledby', `${p}-title`);
  const count = faint(el('span', { id: `${p}-count`, className: 'vl-mn-count' }));
  const heading = el('h2', { id: `${p}-title`, className: 'vl-mn-title' }, 'Linked mentions');
  /** @param {string} id @param {string} icon @param {string} label @param {() => void} run */
  const tool = (id, icon, label, run) => {
    const b = el('button', { type: 'button', id, className: 'vl-mn-tool' }, glyph(icon));
    b.setAttribute('aria-label', label);
    b.addEventListener('click', run);
    return b;
  };
  const st = () => o.state().get();
  const fold = tool(`${p}-fold`, 'list', 'Collapse results', () => { o.state().set({ mentionFold: !st().mentionFold }); draw(); });
  const context = tool(`${p}-context`, 'arrowUpDown', 'Show more context', () => { o.state().set({ mentionContext: !st().mentionContext }); draw(); });
  const sort = tool(`${p}-sort`, 'arrowUpNarrowWide', 'Change sort order', () => sortSheet().open());
  const find = tool(`${p}-find`, 'search', 'Show search filter', () => {
    filterRow.hidden = !filterRow.hidden;
    find.setAttribute('aria-pressed', String(!filterRow.hidden));
    if (filterRow.hidden) { filter.value = ''; draw(); } else filter.focus();
  });
  find.setAttribute('aria-pressed', 'false');
  const filter = /** @type {HTMLInputElement} */ (el('input', { id: `${p}-q`, type: 'search', placeholder: 'Search…', autocomplete: 'off', spellcheck: false }));
  filter.setAttribute('aria-label', 'Filter mentions');
  filter.addEventListener('input', () => draw());
  const filterRow = el('div', { className: 'vl-mn-filter', hidden: true }, glyph('search'), filter);
  const head = el('div', { className: 'vl-mn-head' }, el('div', { className: 'vl-mn-name' }, heading, count), el('div', { className: 'vl-mn-tools' }, fold, context, sort, find));
  const groups = el('div', { id: `${p}-groups`, className: 'vl-mn-groups' });
  const empty = faint(el('p', { className: 'vl-mn-empty', hidden: true }, 'No backlinks found.'));
  // the unlinked mentions: folded; worked out when opened
  let unlinkedOpen = false;
  const unChev = glyph('chevronRight', 'vl-mn-chev');
  const unCount = faint(el('span', { className: 'vl-mn-count' }));
  const unHead = faint(el('button', { type: 'button', id: `${p}-unlinked`, className: 'vl-mn-unhead' }, unChev, el('span', { className: 'vl-mn-unlabel' }, 'Unlinked mentions'), unCount));
  unHead.setAttribute('aria-expanded', 'false');
  const unGroups = el('div', { id: `${p}-ungroups`, className: 'vl-mn-groups', hidden: true });
  unHead.addEventListener('click', () => {
    unlinkedOpen = !unlinkedOpen;
    unHead.setAttribute('aria-expanded', String(unlinkedOpen));
    unChev.replaceWith(glyph(unlinkedOpen ? 'chevronDown' : 'chevronRight', 'vl-mn-chev'));
    draw();
  });
  box.append(head, filterRow, groups, empty, unHead, unGroups);
  o.host.append(box);

  /** @type {ReturnType<typeof bottomSheet> | null} */
  let sorts = null;
  const sortSheet = () => (sorts ||= bottomSheet({ id: `${p}-sort-sheet`, label: 'Sort order', cards: () => [{ title: 'Sort order', rows: SORTS.map(([k, label]) => ({
    id: `${p}-sort-${k}`, label, radio: st().mentionSort === k, run: () => { o.state().set({ mentionSort: k }); draw(); },
  })) }] }));

  /** a line of a note, its mentions marked @param {string} text @param {[number, number][]} ranges */
  const marked = (text, ranges) => {
    const out = /** @type {(Node | string)[]} */ ([]);
    let at = 0;
    for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
      if (a < at) continue;
      out.push(text.slice(at, a), el('mark', {}, text.slice(a, b)));
      at = b;
    }
    out.push(text.slice(at));
    return out;
  };
  /** @param {Group} g @param {boolean} more  with context lines @param {boolean} folded  snippets hidden */
  const groupEl = (g, more, folded) => {
    const shut = folded;
    const chev = faint(el('button', { type: 'button', className: 'vl-mn-gchev' }, glyph(shut ? 'chevronRight' : 'chevronDown')));
    chev.setAttribute('aria-label', shut ? `Show the mentions in ${g.note.title}` : `Hide the mentions in ${g.note.title}`);
    chev.setAttribute('aria-expanded', String(!shut));
    const title = el('button', { type: 'button', className: 'vl-mn-gtitle' }, g.note.title || 'Untitled');
    title.addEventListener('click', () => void o.open(g.note));
    const n = faint(el('span', { className: 'vl-mn-gcount' }, String(g.count)));
    n.setAttribute('aria-label', `${g.count} ${g.count === 1 ? 'mention' : 'mentions'}`);
    const cards = el('div', { className: 'vl-mn-snips', hidden: shut });
    cards.append(...g.snippets.map(s => {
      const lines = /** @type {(Node | string)[]} */ ([]);
      if (more) for (const t of s.before) lines.push(el('span', { className: 'vl-mn-ctx' }, t || ' '));
      lines.push(el('span', { className: 'vl-mn-line' }, ...marked(s.text, s.ranges)));
      if (more) for (const t of s.after) lines.push(el('span', { className: 'vl-mn-ctx' }, t || ' '));
      const card = el('button', { type: 'button', className: 'vl-mn-snip' }, ...lines);
      card.setAttribute('aria-label', `${g.note.title}, line ${s.line + 1}: ${s.text}`);
      card.addEventListener('click', () => void o.open(g.note, s.line));
      return card;
    }));
    chev.addEventListener('click', () => {
      const open = cards.hidden;
      cards.hidden = !open;
      chev.replaceChildren(glyph(open ? 'chevronDown' : 'chevronRight'));
      chev.setAttribute('aria-expanded', String(open));
    });
    const top = el('div', { className: 'vl-mn-ghead' }, chev, title, n);
    const g2 = el('div', { className: 'vl-mn-group' }, top, cards);
    g2.dataset.note = g.note.id;
    return g2;
  };

  /** @type {string} what the block shows now (drawn again only when it changes) */
  let shown = '';
  const draw = () => {
    const note = o.current();
    if (!note || !o.enabled()) { box.hidden = true; shown = ''; return; }
    box.hidden = false;
    const s = st();
    const all = o.notes();
    const linked = linkedMentions(all, note, { sort: s.mentionSort });
    const q = filterRow.hidden ? '' : filter.value;
    const list = filterGroups(linked.groups, q);
    const total = q ? list.reduce((c, g) => c + g.count, 0) : linked.count;
    count.textContent = String(total);
    count.setAttribute('aria-label', `${total} ${total === 1 ? 'mention' : 'mentions'}`);
    fold.setAttribute('aria-pressed', String(s.mentionFold));
    context.setAttribute('aria-pressed', String(s.mentionContext));
    groups.replaceChildren(...list.map(g => groupEl(g, s.mentionContext, s.mentionFold)));
    empty.hidden = list.length > 0;
    unGroups.hidden = !unlinkedOpen;
    if (unlinkedOpen) {
      const un = unlinkedMentions(all, note, { sort: s.mentionSort });
      const ul = filterGroups(un.groups, q);
      unCount.textContent = String(q ? ul.reduce((c, g) => c + g.count, 0) : un.count);
      unGroups.replaceChildren(...(ul.length ? ul.map(g => groupEl(g, s.mentionContext, s.mentionFold)) : [faint(el('p', { className: 'vl-mn-empty' }, 'No unlinked mentions found.'))]));
    } else unCount.textContent = '';
    shown = note.id;
  };
  return {
    el: box,
    /** drawn again (a note shown, the notes changed, turned on or off) */
    draw,
    /** the note it shows ('' : hidden) */
    shown: () => shown,
  };
}
