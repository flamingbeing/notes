// The quick switcher (Ctrl/Cmd+O, or "Go to note" on a phone) and the command palette (Ctrl/Cmd+P): one sheet
// (#picker), a box and a list to pick from, both searched with @core/search. The switcher finds notes by title, alias
// and folder (the notes opened lately first while the box is empty) and offers to make a note of what was typed; the
// palette finds commands by name. Arrow keys move, Enter picks, Escape closes.
import { createSearch } from '@core/search';
import { $, input, dialog } from '../dom.js';

/** @typedef {import('../cloud.js').Note} Note */
/** @typedef {{ id: string, label: string, hint?: string, run: () => unknown }} Item */
/** @typedef {{ id: string, label: string, when?: () => boolean, run: () => unknown }} Command */

/**
 * @param {{
 *   notes: () => Note[], recent: () => string[], canWrite: () => boolean,
 *   open: (note: Note) => unknown, create: (title: string) => unknown, commands: Command[],
 * }} o
 */
export function picker(o) {
  const sheet = dialog('picker'), box = input('picker-q'), list = $('picker-list');
  /** @type {Item[]} */
  let items = [];
  let at = 0;
  /** @type {(q: string) => Item[]} */
  let source = () => [];

  const noteSearch = createSearch({ fields: ['title', 'aliases', 'path'], boost: { title: 3, aliases: 2 } });
  const commandSearch = createSearch({ fields: ['label'] });
  commandSearch.feed(o.commands.map(c => ({ id: c.id, label: c.label })));

  const select = (/** @type {number} */ i) => {
    at = Math.max(0, Math.min(items.length - 1, i));
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === at)));
    const li = list.children[at];
    if (li) { box.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else box.removeAttribute('aria-activedescendant');
  };
  const draw = () => {
    items = source(box.value.trim());
    list.replaceChildren(...items.map((item, n) => {
      const li = document.createElement('li');
      li.id = `picker-${n}`; li.setAttribute('role', 'option'); li.textContent = item.label;
      if (item.hint) li.append(Object.assign(document.createElement('span'), { className: 'path', textContent: ` ${item.hint}` }));
      li.addEventListener('mousedown', e => e.preventDefault());
      li.addEventListener('click', () => pick(n));
      return li;
    }));
    $('picker-empty').hidden = items.length > 0;
    select(0);
  };
  const pick = (/** @type {number} */ n) => {
    const item = items[n];
    if (!item) return;
    sheet.close();
    void item.run();
  };
  box.addEventListener('input', draw);
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(at - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
  });
  /** @param {string} title @param {string} placeholder @param {(q: string) => Item[]} from */
  const show = (title, placeholder, from) => {
    $('picker-title').textContent = title;
    box.placeholder = placeholder;
    box.value = '';
    source = from;
    draw();
    if (!sheet.open) sheet.showModal();
    box.focus();
  };

  /** @param {Note} n @returns {Item} */
  const noteItem = n => ({ id: n.id, label: n.title, hint: n.path ? `${n.path}/` : '', run: () => o.open(n) });
  const switcher = () => {
    const notes = o.notes();
    noteSearch.clear();
    noteSearch.feed(notes);
    const byId = new Map(notes.map(n => [n.id, n]));
    show('Go to note', 'Note title', q => {
      if (!q) {
        const recent = o.recent().map(id => byId.get(id)).filter(/** @returns {n is Note} */ n => !!n);
        const rest = notes.filter(n => !recent.includes(n)).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
        return [...recent, ...rest].slice(0, 30).map(noteItem);
      }
      const hits = noteSearch.search(q, { limit: 30 }).hits.map(h => byId.get(h.id)).filter(/** @returns {n is Note} */ n => !!n);
      const exact = notes.some(n => n.title.toLowerCase() === q.toLowerCase());
      const make = !exact && o.canWrite() ? [{ id: 'create', label: `Make a note: “${q}”`, run: () => o.create(q) }] : [];
      return [...hits.map(noteItem), ...make];
    });
  };
  const palette = () => {
    const now = o.commands.filter(c => !c.when || c.when());
    const byId = new Map(now.map(c => [c.id, c]));
    show('Commands', 'Command', q => {
      const found = q ? commandSearch.search(q, { limit: 30 }).hits.map(h => byId.get(h.id)) : now;
      return found.filter(/** @returns {c is Command} */ c => !!c).map(c => ({ id: c.id, label: c.label, run: c.run }));
    });
  };

  // Ctrl/Cmd+O and Ctrl/Cmd+P anywhere on the page (not the browser's open and print)
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'o' && k !== 'p') return;
    if (!o.notes || $('list-view').hidden) return;
    e.preventDefault();
    if (k === 'o') switcher(); else palette();
  });
  return { switcher, palette };
}
