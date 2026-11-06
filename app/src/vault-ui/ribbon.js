// The Vault layout's ribbon menu (the pill's last button): a sheet of cards, as the reference app's mobile ribbon. The
// first card holds the Core plugins' actions (the quick switcher, today's daily note, the command palette, a new note,
// a random note, Search, Bookmarks), the second the Notes extras that are on (the note list, Haiku for admins, the
// bin, Select many), the last Settings. A plugin or extra that is off takes its row away. Each row runs one of the
// shell's actions (commands.js's), so a save still goes the app's way.
import { bottomSheet } from './sheet.js';

/** @typedef {import('./commands.js').CmdCtx} CmdCtx */
/** @typedef {import('./sheet.js').Row} Row */

/**
 * the ribbon's cards for now (pure but for the context; the e2e reads the ids)
 * @param {CmdCtx} c @returns {import('./sheet.js').Card[]}
 */
export function ribbonCards(c) {
  const { act } = c;
  const write = c.canWrite();
  /** @type {(Row | false)[]} */
  const core = [
    c.on('pSwitcher') && { id: 'vl-rib-switcher', icon: 'search', label: 'Open quick switcher', run: () => act.switcher() },
    c.on('pDaily') && write && { id: 'vl-rib-daily', icon: 'calendar', label: 'Open today’s daily note', run: () => act.daily(0) },
    c.on('pPalette') && { id: 'vl-rib-palette', icon: 'terminal', label: 'Open command palette', run: () => act.palette() },
    write && { id: 'vl-rib-new', icon: 'squarePen', label: 'Create new note', run: () => act.create() },
    c.on('pRandom') && { id: 'vl-rib-random', icon: 'dices', label: 'Open random note', run: () => act.random() },
    c.on('pSearch') && { id: 'vl-rib-search', icon: 'textSearch', label: 'Search', run: () => act.leftView('search') },
    c.on('pBookmarks') && { id: 'vl-rib-bookmarks', icon: 'bookmark', label: 'Bookmarks', run: () => act.leftView('bookmarks') },
  ];
  /** @type {(Row | false)[]} */
  const extras = [
    c.on('xNoteList') && { id: 'vl-rib-list', icon: 'list', label: 'Note list', run: () => act.page('notes') },
    c.on('xHaiku') && c.admin() && { id: 'vl-rib-haiku', icon: 'feather', label: 'Haiku', run: () => act.page('haiku') },
    c.binOn() && { id: 'vl-rib-bin', icon: 'trash2', label: 'Bin', run: () => act.bin() },
    c.on('xSelect') && write && { id: 'vl-rib-select', icon: 'listChecks', label: 'Select many', run: () => act.select() },
  ];
  const rows = (/** @type {(Row | false)[]} */ l) => l.filter(/** @returns {r is Row} */ r => !!r);
  return [
    { rows: rows(core) },
    { title: 'Notes extras', rows: rows(extras) },
    { rows: [{ id: 'vl-rib-settings', icon: 'settings', label: 'Settings', run: () => act.settings() }] },
  ];
}

/** the ribbon menu's sheet @param {() => CmdCtx} ctx */
export function ribbonMenu(ctx) {
  return bottomSheet({ id: 'vl-ribbon-sheet', label: 'Menu', cards: () => ribbonCards(ctx()) });
}
