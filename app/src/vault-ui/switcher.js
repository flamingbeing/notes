// The Vault layout's quick switcher (the pill's search button, "Go to file", Ctrl+O): the find-as-you-type sheet over
// the notes' titles. Nothing typed: the notes opened lately (this device's, newest first), then the rest by when they
// changed. Enter opens the one selected; with nothing found, or with Shift, it makes a note of that name (through the
// app's create, so the write queue) in the folder for new notes. Loaded on first use.
import { pickSheet } from './pick-sheet.js';
import { rank } from './fuzzy.js';

/** @typedef {import('../notes/model.js').Note} Note */

/**
 * @param {{ notes: () => Note[], recent: () => string[], open: (note: Note) => unknown, create: (title: string) => unknown,
 *   canWrite: () => boolean }} o
 */
export function quickSwitcher(o) {
  const live = () => o.notes().filter(n => !n._deleted);
  /** nothing typed: the recent ones, then by last change @param {Note[]} all */
  const recentFirst = all => {
    const byId = new Map(all.map(n => [n.id, n]));
    const first = o.recent().map(id => byId.get(id)).filter(/** @returns {n is Note} */ n => !!n);
    const seen = new Set(first);
    const rest = all.filter(n => !seen.has(n)).sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    return [...first, ...rest];
  };
  const sheet = pickSheet({
    id: 'vl-switcher', label: 'Quick switcher', placeholder: 'Find or create a note...', empty: 'No notes found.',
    createLabel: 'Create a note with this name',
    list: q => {
      const all = live();
      if (!q.trim()) return recentFirst(all).map(n => ({ key: n.id, text: n.title || 'Untitled', ranges: [] }));
      return rank(q, recentFirst(all), n => n.title || 'Untitled').map(r => ({ key: r.item.id, text: r.item.title || 'Untitled', ranges: r.ranges }));
    },
    choose: id => { const n = live().find(x => x.id === id); if (n) return o.open(n); },
    create: q => (o.canWrite() ? o.create(q) : undefined),
  });
  return { open: () => sheet.open(), close: () => sheet.close(), isOpen: sheet.isOpen };
}
