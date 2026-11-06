// The Vault layout's commands: what the command palette lists (and the ribbon menu shares), as plain data (pure: the
// unit tests read it in Node). A command belongs to a group ("Daily notes: Open today's daily note"), may need a Core
// plugin on (a plugin that is off hides its commands) and may ask more (a note open, the right to write, a Notes extra
// on). Its run calls one of the shell's actions, handed in with the context, so every save still goes the app's way
// (through the write queue).

/** @typedef {import('../notes/model.js').Note} Note */
/**
 * @typedef {{
 *   switcher: () => unknown, palette: () => unknown, daily: (step: 0 | -1 | 1) => unknown, create: () => unknown, toggleRead: () => unknown,
 *   toggleEditMode: () => unknown, leftView: (key: string) => unknown, reveal: () => unknown, bookmark: () => unknown,
 *   right: (view: string) => unknown, toggleMentions: () => unknown, random: () => unknown, rename: () => unknown,
 *   move: () => unknown, remove: () => unknown, copyPath: () => unknown, find: () => unknown, closeTab: () => unknown,
 *   newTab: () => unknown, tabs: () => unknown, settings: () => unknown, sync: () => unknown, page: (key: string) => unknown,
 *   bin: () => unknown, select: () => unknown,
 * }} Actions
 * @typedef {{
 *   on: (key: string) => boolean, canWrite: () => boolean, note: () => Note | null | undefined, admin: () => boolean,
 *   binOn: () => boolean, act: Actions,
 * }} CmdCtx
 * @typedef {{ id: string, group: string, name: string, icon: string, plugin?: string, when?: (c: CmdCtx) => boolean,
 *   run: (c: CmdCtx) => unknown }} Command
 */

/** @param {CmdCtx} c */
const note = c => !!c.note();
/** @param {CmdCtx} c */
const write = c => c.canWrite();
/** @param {CmdCtx} c */
const writeNote = c => c.canWrite() && !!c.note();

/** @type {Command[]} every command, in the palette's order when nothing is typed (after the recent ones) */
export const COMMANDS = [
  { id: 'switcher:open', group: 'Quick switcher', name: 'Open quick switcher', icon: 'search', plugin: 'pSwitcher', run: c => c.act.switcher() },
  { id: 'daily:today', group: 'Daily notes', name: 'Open today’s daily note', icon: 'calendar', plugin: 'pDaily', when: write, run: c => c.act.daily(0) },
  { id: 'daily:prev', group: 'Daily notes', name: 'Open previous daily note', icon: 'chevronLeft', plugin: 'pDaily', run: c => c.act.daily(-1) },
  { id: 'daily:next', group: 'Daily notes', name: 'Open next daily note', icon: 'chevronRight', plugin: 'pDaily', run: c => c.act.daily(1) },
  { id: 'daily:calendar', group: 'Daily notes', name: 'Show calendar', icon: 'calendar', plugin: 'pDaily', run: c => c.act.right('calendar') },
  { id: 'file:new', group: '', name: 'Create new note', icon: 'squarePen', when: write, run: c => c.act.create() },
  { id: 'editor:reading', group: 'Editor', name: 'Toggle reading view', icon: 'bookOpen', when: note, run: c => c.act.toggleRead() },
  { id: 'editor:mode', group: 'Editor', name: 'Toggle Live Preview/Source mode', icon: 'codeXml', when: note, run: c => c.act.toggleEditMode() },
  { id: 'editor:find', group: 'Editor', name: 'Find in current file', icon: 'search', when: note, run: c => c.act.find() },
  { id: 'search:open', group: 'Search', name: 'Search in all files', icon: 'textSearch', plugin: 'pSearch', run: c => c.act.leftView('search') },
  { id: 'files:show', group: 'Files', name: 'Show file explorer', icon: 'folder', plugin: 'pFiles', run: c => c.act.leftView('files') },
  { id: 'files:reveal', group: 'Files', name: 'Reveal current file in navigation', icon: 'folderOpen', plugin: 'pFiles', when: note, run: c => c.act.reveal() },
  { id: 'tags:show', group: 'Tags view', name: 'Show tags', icon: 'tags', plugin: 'pTags', run: c => c.act.leftView('tags') },
  { id: 'bookmarks:add', group: 'Bookmarks', name: 'Bookmark current note', icon: 'bookmark', plugin: 'pBookmarks', when: note, run: c => c.act.bookmark() },
  { id: 'bookmarks:show', group: 'Bookmarks', name: 'Show bookmarks', icon: 'bookmark', plugin: 'pBookmarks', run: c => c.act.leftView('bookmarks') },
  { id: 'backlinks:show', group: 'Backlinks', name: 'Show backlinks', icon: 'link2', plugin: 'pBacklinks', run: c => c.act.right('backlinks') },
  { id: 'backlinks:doc', group: 'Backlinks', name: 'Toggle backlinks in document', icon: 'link2', plugin: 'pBacklinks', when: note, run: c => c.act.toggleMentions() },
  { id: 'outgoing:show', group: 'Outgoing links', name: 'Show outgoing links', icon: 'link', plugin: 'pOutgoing', run: c => c.act.right('outgoing') },
  { id: 'outline:show', group: 'Outline', name: 'Show outline', icon: 'list', plugin: 'pOutline', run: c => c.act.right('outline') },
  { id: 'random:open', group: 'Random note', name: 'Open random note', icon: 'dices', plugin: 'pRandom', run: c => c.act.random() },
  { id: 'note:rename', group: 'Note', name: 'Rename file', icon: 'pencilLine', when: writeNote, run: c => c.act.rename() },
  { id: 'note:move', group: 'Note', name: 'Move file to another folder', icon: 'folderInput', when: writeNote, run: c => c.act.move() },
  { id: 'note:delete', group: 'Note', name: 'Delete current file', icon: 'trash2', when: writeNote, run: c => c.act.remove() },
  { id: 'note:copy-path', group: 'Note', name: 'Copy file path', icon: 'copy', when: note, run: c => c.act.copyPath() },
  { id: 'tab:close', group: 'Note', name: 'Close current tab', icon: 'x', run: c => c.act.closeTab() },
  { id: 'tab:new', group: 'Tabs', name: 'New tab', icon: 'plus', run: c => c.act.newTab() },
  { id: 'tab:list', group: 'Tabs', name: 'Show open tabs', icon: 'galleryVerticalEnd', run: c => c.act.tabs() },
  { id: 'app:settings', group: 'App', name: 'Open settings', icon: 'settings', run: c => c.act.settings() },
  { id: 'app:sync', group: 'App', name: 'Sync now', icon: 'refreshCw', run: c => c.act.sync() },
  // the Notes extras, each only while it is on
  { id: 'extra:list', group: 'Notes extras', name: 'Open note list', icon: 'list', plugin: 'xNoteList', run: c => c.act.page('notes') },
  { id: 'extra:haiku', group: 'Notes extras', name: 'Open Haiku', icon: 'feather', plugin: 'xHaiku', when: c => c.admin(), run: c => c.act.page('haiku') },
  { id: 'extra:bin', group: 'Notes extras', name: 'Open the bin', icon: 'trash2', plugin: 'xMore', when: c => c.binOn(), run: c => c.act.bin() },
  { id: 'extra:select', group: 'Notes extras', name: 'Select many notes', icon: 'listChecks', plugin: 'xSelect', when: write, run: c => c.act.select() },
];

/** a command's name as the palette shows it ("Group: Command") @param {Command} cmd */
export const fullName = cmd => (cmd.group ? `${cmd.group}: ${cmd.name}` : cmd.name);

/** the commands that can run now (their plugin on, their conditions met) @param {CmdCtx} c @returns {Command[]} */
export const available = c => COMMANDS.filter(cmd => (!cmd.plugin || c.on(cmd.plugin)) && (!cmd.when || cmd.when(c)));

/**
 * the commands as listed with nothing typed: the recent ones first (most recent first), then the rest in order
 * @param {Command[]} list @param {string[]} recent  ids
 */
export function withRecent(list, recent) {
  const byId = new Map(list.map(c => [c.id, c]));
  const first = recent.map(id => byId.get(id)).filter(/** @returns {c is Command} */ c => !!c);
  return [...first, ...list.filter(c => !first.includes(c))];
}

/** a command run: kept at the top of the recent ones (no repeats, at most 10) @param {string[]} recent @param {string} id */
export const ranRecent = (recent, id) => [id, ...recent.filter(x => x !== id)].slice(0, 10);
