// The Vault layout's Core plugins (pure: the unit tests read it in Node). Each is a device option (settings/options.js):
// the Vault layout's own features are on, the Classic layout's extras ("Notes extras") are off until a device turns
// them on. In the Classic layout none of these apply: it keeps every feature as it was, governed by its own options.

/** @typedef {{ key: string, label: string, sub: string, icon: string, group: 'core' | 'extra', gear?: string }} Plugin */

/** @type {Plugin[]} the Core plugins page's rows, in order (alphabetical within each card) */
export const PLUGINS = [
  { key: 'pBacklinks', label: 'Backlinks', sub: 'Show the notes that link to the current note.', icon: 'link2', group: 'core', gear: 'backlinks' },
  { key: 'pBookmarks', label: 'Bookmarks', sub: 'Keep notes you use often one tap away.', icon: 'bookmark', group: 'core' },
  { key: 'pPalette', label: 'Command palette', sub: 'Run any command from a searchable list.', icon: 'terminal', group: 'core', gear: 'palette' },
  { key: 'pDaily', label: 'Daily notes', sub: 'Open or make today’s note.', icon: 'calendar', group: 'core', gear: 'daily' },
  { key: 'pFiles', label: 'Files', sub: 'Browse your notes and folders as a tree.', icon: 'folder', group: 'core' },
  { key: 'pOutgoing', label: 'Outgoing links', sub: 'Show the links in the current note.', icon: 'link', group: 'core' },
  { key: 'pOutline', label: 'Outline', sub: 'Show the headings of the current note.', icon: 'list', group: 'core' },
  { key: 'pSwitcher', label: 'Quick switcher', sub: 'Jump to a note by typing part of its name.', icon: 'search', group: 'core' },
  { key: 'pRandom', label: 'Random note', sub: 'Open a random note.', icon: 'dices', group: 'core' },
  { key: 'pSearch', label: 'Search', sub: 'Search the text of every note.', icon: 'textSearch', group: 'core' },
  { key: 'pTags', label: 'Tags view', sub: 'Show every tag and how often it is used.', icon: 'tags', group: 'core' },
  { key: 'pWordCount', label: 'Word count', sub: 'Show the words and characters of the note.', icon: 'type', group: 'core' },
  { key: 'xAdvanced', label: 'Advanced', sub: 'Connect Claude to your notes (MCP), when it is on.', icon: 'wrench', group: 'extra', gear: 'advanced' },
  { key: 'xDayButtons', label: 'Day buttons', sub: 'Today and Next day buttons at the top of a note.', icon: 'calendar', group: 'extra' },
  { key: 'xDetails', label: 'Details panel', sub: 'A note’s folder, links, files and Move, from its menu.', icon: 'info', group: 'extra' },
  { key: 'xHaiku', label: 'Haiku', sub: 'The Haiku page, from the menu (admins only).', icon: 'sparkles', group: 'extra', gear: 'haiku' },
  { key: 'xLineSpacing', label: 'Line spacing', sub: 'Tight, normal or roomy lines in the editor.', icon: 'type', group: 'extra' },
  { key: 'xMore', label: 'More', sub: 'Bin, shares from other apps and feedback, as each is set.', icon: 'listChecks', group: 'extra', gear: 'more' },
  { key: 'xNoteList', label: 'Note list', sub: 'The list of notes with a preview of each.', icon: 'list', group: 'extra', gear: 'list' },
  { key: 'xSelect', label: 'Select many', sub: 'Pick several notes and change them together.', icon: 'listChecks', group: 'extra' },
  { key: 'xSwipeBack', label: 'Swipe back to list', sub: 'Swipe right from the edge of a note to the note list.', icon: 'chevronLeft', group: 'extra' },
  { key: 'xSwipeTabs', label: 'Swipe between tabs', sub: 'Swipe sideways between the tab bar’s pages.', icon: 'arrowLeftRight', group: 'extra' },
  { key: 'xSyncButton', label: 'Sync button', sub: 'The cloud button at the top of a note.', icon: 'cloud', group: 'extra' },
  { key: 'xTabBar', label: 'Tab bar', sub: 'Notes, Folders, Haiku and Settings tabs at the bottom.', icon: 'menu', group: 'extra', gear: 'tabs' },
];

/** the card headings on the Core plugins page */
export const GROUPS = {
  core: { title: 'Core plugins', sub: '' },
  extra: { title: 'Notes extras', sub: 'Features of the Classic layout. Off in the Vault layout until you turn them on.' },
};

const BY_KEY = new Map(PLUGINS.map(p => [p.key, p]));

/**
 * Is a feature on? In the Classic layout every Notes extra is (its own options still decide) and the Vault layout's
 * plugins don't apply; in the Vault layout, the plugin's option (an unset one: its default, on for the Vault's own
 * features and off for the extras).
 * @param {string} layout  'vault' | 'classic'
 * @param {Record<string, unknown> | ((key: string) => unknown)} values  the options (or a getter)
 * @param {string} key  a plugin's key
 */
export function featureOn(layout, values, key) {
  const p = BY_KEY.get(key);
  if (!p) return false;
  if (layout === 'classic') return p.group === 'extra';
  const v = typeof values === 'function' ? values(key) : values?.[key];
  return typeof v === 'boolean' ? v : p.group === 'core';
}
