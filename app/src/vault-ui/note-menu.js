// The note's menu (the header's vertical dots), as the reference app's bottom sheet of cards: Close (this tab); the
// views (Backlinks in document, Reading view, Source mode or Live Preview, each ticked when on); Rename…, Move file
// to…, Bookmark… (ticked when bookmarked), Find…, Copy path; Share; Details… (with that Notes extra on); Delete file
// (asked first; to the bin, with Undo). Someone who can only view the space gets Close, the views, Copy path and Share. Each row
// does what the app already does elsewhere (the file menu's rename, move and delete, the page's read view and
// Details), so every save still goes through the write queue. Loaded on the first tap of the dots.
import { copyText, shareText } from '@core/ui';
import { bottomSheet } from './sheet.js';
import { rename, move, remove } from './file-menu.js';
import { cleanPath } from './tree.js';

/** @typedef {import('../notes/model.js').Note} Note */
/** @typedef {import('./sheet.js').Card} Card */
/**
 * @typedef {{
 *   note: () => Note | null, ctx: () => Promise<import('./left.js').Ctx>, on: (key: string) => boolean, canWrite: () => boolean,
 *   reading: () => boolean, setReading: (on: boolean) => void, editMode: () => string, setEditMode: (m: string) => void,
 *   mentionsOn: () => boolean, setMentions: (on: boolean) => void, closeTab: () => unknown, find: () => unknown,
 *   details: () => void, body: () => string, toast: (msg: string) => unknown, bookmarked: (id: string) => boolean,
 * }} MenuCtx
 */

let cards = /** @type {Card[]} */ ([]);
/** @type {ReturnType<typeof bottomSheet> | null} */
let sheet = null;

/** the cards for the note open, as this person may use them @param {MenuCtx} m @param {Note} note */
export function menuCards(m, note) {
  const write = m.canWrite();
  const reading = m.reading();
  const live = m.editMode() === 'live';
  const toasts = { show: (/** @type {string} */ t) => m.toast(t) };
  const path = cleanPath(note.path);
  const withCtx = (/** @type {(c: import('./left.js').Ctx) => unknown} */ f) => () => void m.ctx().then(f);
  return /** @type {Card[]} */ ([
    { rows: [{ id: 'vl-menu-close', icon: 'x', label: 'Close', run: () => void m.closeTab() }] },
    { rows: [
      ...(m.on('pBacklinks') ? [{ id: 'vl-menu-backlinks', icon: 'link', label: 'Backlinks in document', ticked: m.mentionsOn(), run: () => m.setMentions(!m.mentionsOn()) }] : []),
      { id: 'vl-menu-read', icon: 'bookOpen', label: 'Reading view', ticked: reading, run: () => m.setReading(!reading) },
      { id: 'vl-menu-source', icon: 'codeXml', label: live ? 'Live Preview' : 'Source mode', ticked: !reading,
        // (from the read view: back to editing; while editing: the other editing mode)
        run: () => { if (reading) m.setReading(false); else m.setEditMode(live ? 'source' : 'live'); } },
    ] },
    { rows: write ? [
      { id: 'vl-menu-rename', icon: 'pencilLine', label: 'Rename…', run: withCtx(c => rename(c, note)) },
      { id: 'vl-menu-move', icon: 'folderInput', label: 'Move file to…', run: withCtx(c => move(c, note)) },
      ...(m.on('pBookmarks') ? [{ id: 'vl-menu-bookmark', icon: 'bookmark', label: 'Bookmark…', ticked: m.bookmarked(note.id), run: withCtx(c => c.bookmark(note.id)) }] : []),
      { id: 'vl-menu-find', icon: 'search', label: 'Find…', run: () => m.find() },
      { id: 'vl-menu-copy', icon: 'link', label: 'Copy path', run: () => void copyText(`${path ? `${path}/` : ''}${note.title || 'Untitled'}.md`, { toasts }) },
    ] : [
      { id: 'vl-menu-copy', icon: 'link', label: 'Copy path', run: () => void copyText(`${path ? `${path}/` : ''}${note.title || 'Untitled'}.md`, { toasts }) },
    ] },
    { rows: [{ id: 'vl-menu-share', icon: 'arrowUpRight', label: 'Share', run: () => void shareText(m.body(), { title: note.title, toasts }) }] },
    { rows: write && m.on('xDetails') ? [{ id: 'vl-menu-details', icon: 'info', label: 'Details…', run: () => m.details() }] : [] },
    { rows: write ? [{ id: 'vl-menu-delete', icon: 'trash2', label: 'Delete file', danger: true, run: withCtx(c => remove(c, note)) }] : [] },
  ]);
}

/** the menu for the note open, shown @param {MenuCtx} m */
export function openNoteMenu(m) {
  const note = m.note();
  if (!note) return;
  cards = menuCards(m, note);
  sheet ||= bottomSheet({ id: 'vl-menu', label: 'More options', cards: () => cards });
  sheet.open();
}
