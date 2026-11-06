// The Vault layout's open tabs (the pill's counter): a sheet titled "N tabs", one card of the tabs (each note's name,
// its folder under it, a tick on the one showing and a cross that closes it, the sheet staying open), then New tab and
// Close all. A tap on a tab shows it.
import { bottomSheet } from './sheet.js';
import { cleanPath } from './tree.js';

/** @typedef {import('../notes/model.js').Note} Note */

/**
 * @param {{ tabs: () => string[], active: () => number, noteOf: (id: string) => Note | undefined,
 *   show: (i: number) => unknown, close: (i: number) => unknown, newTab: () => unknown, closeAll: () => unknown }} o
 *   show: tab i shown; close: tab i closed (the page follows when it was the one showing)
 */
export function tabsSheet(o) {
  const named = () => { const n = o.tabs().length; return `${n} ${n === 1 ? 'tab' : 'tabs'}`; };
  return bottomSheet({
    id: 'vl-tabs-sheet', label: named, heading: named,
    cards: () => [
      { title: 'Open tabs', rows: o.tabs().map((id, i) => {
        const note = id ? o.noteOf(id) : undefined;
        const name = note ? note.title || 'Untitled' : 'New tab';
        return {
          id: `vl-tab-${i}`, icon: 'file', label: name, sub: note ? cleanPath(note.path) || '/' : '',
          ticked: i === o.active(), run: () => o.show(i),
          aside: { id: `vl-tab-close-${i}`, icon: 'x', label: `Close ${name}`, run: () => o.close(i) },
        };
      }) },
      { rows: [
        { id: 'vl-tabs-new', icon: 'circlePlus', label: 'New tab', run: () => o.newTab() },
        { id: 'vl-tabs-close-all', icon: 'x', label: 'Close all', run: () => o.closeAll() },
      ] },
    ],
  });
}
