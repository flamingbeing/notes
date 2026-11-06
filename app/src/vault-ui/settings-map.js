// The Vault layout's Settings, as data (pure: the unit tests read it in Node). The root's "Options" card lists the
// option pages; its "Core plugins" card lists the page of each plugin (or Notes extra) that has options, while it is
// on. Each page is a list of rows: an option (a switch, a choice or a folder box, from its key), a heading over the
// rows after it, a button that opens one of the app's sheets (by its id, as list.js knows it), a line of words, or a
// part the screen draws itself (the theme, the tab arranger, the account). Every option of settings/options.js has a
// page here (driveOn aside: only the Google Drive sheet sets it), so nothing the Classic Settings have is lost.
import { PLUGINS } from './plugins.js';

/**
 * @typedef {{ key: string, label: string, sub?: string, choices?: [string, string][], when?: string, hint?: string,
 *   alias?: boolean }} OptionRow  an option: a switch (true/false), a choice (choices) or a folder box (hint: its
 *   placeholder); when: shown only while that plugin is on; alias: the option's second row (its control has its own id)
 * @typedef {{ heading: string, sub?: string }} HeadingRow  a heading over the rows after it (a new card)
 * @typedef {{ button: string, label: string, sub?: string, text: string, danger?: boolean }} ButtonRow  a pill that
 *   opens one of the app's sheets (button: the pill's id)
 * @typedef {{ link: string, label: string, sub?: string, text: string }} LinkRow  a pill that opens a web page
 * @typedef {{ info: string, label: string, sub?: string }} InfoRow  words, nothing to change
 * @typedef {{ part: string, label: string, sub?: string, find?: string, keys?: string[] }} PartRow  drawn by the screen
 *   (settings.js); keys: the options it changes
 * @typedef {OptionRow | HeadingRow | ButtonRow | LinkRow | InfoRow | PartRow} Row
 * @typedef {{ id: string, title: string, icon: string, plugin?: string, rows: Row[] }} Page  plugin: the page of that
 *   plugin (or Notes extra), in the root's Core plugins card while it is on
 */

const HELP = 'https://github.com/flamingbeing/notes#readme';

/** @type {Page[]} the option pages (the root's Options card, in order), then the plugin pages */
export const PAGES = [
  { id: 'general', title: 'General', icon: 'circleUserRound', rows: [
    { part: 'version', label: 'Version' },
    { part: 'update', label: 'Check for updates', sub: 'Look for a newer version of Notes now.' },
    { link: HELP, label: 'Help', sub: 'How Notes works, on its project page.', text: 'Open' },
    { heading: 'Account' },
    { part: 'account', label: 'Your account', sub: 'You’re signed in as', find: 'log out sign out email' },
    { heading: 'Advanced' },
    { part: 'file', label: 'Settings file', sub: 'Save your account settings to a file, or load them from one.', find: 'export import' },
  ] },
  { id: 'appearance', title: 'Appearance', icon: 'palette', rows: [
    { part: 'scheme', label: 'Base color scheme', sub: 'Light or dark, or follow this device.', find: 'dark light theme colour color mode night' },
    { part: 'accent', label: 'Accent color', sub: 'The colour of links, switches and the cursor.', find: 'colour color accent purple' },
    { heading: 'Font' },
    { part: 'fontSize', label: 'Font size', sub: 'The size of note text, in reading and editing views.', find: 'text size bigger smaller larger zoom' },
    { heading: 'Interface' },
    { key: 'layout', label: 'Layout', sub: 'Vault layout or Classic layout, on this device. Changing it reloads the app.',
      choices: [['vault', 'Vault layout'], ['classic', 'Classic layout']] },
    { key: 'lineSpacing', label: 'Line spacing', sub: 'The space between lines in the editor.', when: 'xLineSpacing',
      choices: [['tight', 'Tight'], ['normal', 'Normal'], ['roomy', 'Roomy']] },
    { heading: 'Advanced', sub: 'On this device. Looks, styles, grounds and density are the Classic layout’s.' },
    { part: 'theme', label: 'Theme', sub: 'Dark style, bars and sheets, motion and haptics on this device.',
      find: 'oled black glass solid bars sheets motion haptics' },
  ] },
  { id: 'editor', title: 'Editor', icon: 'pencilLine', rows: [
    { key: 'vNewTabView', label: 'Default view for new tabs', sub: 'The view a note opens in.',
      choices: [['edit', 'Editing view'], ['read', 'Reading view']] },
    { key: 'vEditMode', label: 'Default editing mode', sub: 'The editing mode a note starts in.',
      choices: [['source', 'Source mode'], ['live', 'Live Preview']] },
    { heading: 'Display' },
    { key: 'vInlineTitle', label: 'Inline title', sub: 'Show the note’s name as an editable title at the top of the note.' },
    { key: 'readableWidth', label: 'Readable line length', sub: 'Keep lines short enough to read easily.' },
    { key: 'lineNumbers', label: 'Line numbers', sub: 'Show a number beside each line.' },
    { key: 'tickToBottom', label: 'Ticked to-dos go to the bottom', sub: 'A to-do you tick moves below the open ones.' },
    { heading: 'Classic layout' },
    { key: 'sourceMode', label: 'Source mode', sub: 'In the Classic layout: show the Markdown as written.' },
  ] },
  { id: 'files', title: 'Files and links', icon: 'folderCog', rows: [
    { key: 'vStartFile', label: 'Default file to open', sub: 'What opens when the app starts.',
      choices: [['last', 'Last opened'], ['daily', 'Today’s daily note'], ['none', 'Nothing']] },
    { key: 'newFolder', label: 'Default location for new notes', sub: 'The folder new notes go in. Empty: the top of your notes.', hint: 'Top of your notes' },
    { heading: 'Deleted files' },
    { info: 'Moved to the Notes bin', label: 'Deleted files', sub: 'A deleted note can be brought back from the bin.' },
    { heading: 'Import and export' },
    { button: 'open-transfer', label: 'Import and export', sub: 'Bring notes in, take them out, or make a backup.', text: 'Open' },
    { button: 'open-drive', label: 'Google Drive copy', sub: 'Keep a copy of your notes in your Google Drive.', text: 'Open' },
  ] },
  { id: 'toolbar', title: 'Mobile toolbar', icon: 'tabletSmartphone', rows: [
    { key: 'fmtBar', label: 'Show the toolbar', sub: 'Formatting buttons above the keyboard while you write.' },
    { heading: 'Toolbar commands' },
    { part: 'commands', label: 'Toolbar commands', find: 'undo redo bold italic heading link tag bullet checklist indent' },
  ] },
  { id: 'account', title: 'Account and spaces', icon: 'users', rows: [
    { part: 'spaces', label: 'Spaces', sub: 'Your own notes and the shared spaces you are in.', find: 'switch space' },
    { part: 'space-tools', label: 'Manage spaces', sub: 'The members of the shared space that is open, or a new space.', find: 'members new space' },
    { heading: 'Notes' },
    { key: 'itemCount', label: 'Show how many notes there are', sub: 'On every device you sign in on.' },
  ] },
  { id: 'plugins', title: 'Core plugins', icon: 'toyBrick', rows: [
    { part: 'plugins', label: 'Core plugins', find: 'notes extras features' },
  ] },
  { id: 'about', title: 'About', icon: 'info', rows: [
    { part: 'install', label: 'Install this app', sub: 'Opens from your home screen, like any other app.' },
    { part: 'licences', label: 'About this app', sub: 'The outside code it uses and their licences.', find: 'licences licenses version' },
  ] },
  // ---- plugin pages
  { id: 'backlinks', title: 'Backlinks', icon: 'link2', plugin: 'pBacklinks', rows: [
    { key: 'vMentions', label: 'Backlinks in document', sub: 'Show the linked mentions at the bottom of each note.' },
  ] },
  { id: 'palette', title: 'Command palette', icon: 'terminal', plugin: 'pPalette', rows: [
    { key: 'vPull', label: 'Pull down for the palette', sub: 'Pull a note down from its top to open the command palette.' },
  ] },
  { id: 'daily', title: 'Daily notes', icon: 'calendar', plugin: 'pDaily', rows: [
    { key: 'dailyFolder', label: 'New file location', sub: 'The folder daily notes go in. Empty: the top of your notes.', hint: 'Top of your notes' },
    { key: 'vDailyOnStart', label: 'Open daily note on startup', sub: 'Open today’s note when the app starts, made if needed.' },
  ] },
  { id: 'tabs', title: 'Tab bar', icon: 'menu', plugin: 'xTabBar', rows: [
    { part: 'arranger', label: 'Tab bar', sub: 'The order of the tabs, and which show.', find: 'arrange tabs order', keys: ['tabs'] },
  ] },
  { id: 'list', title: 'Note list', icon: 'list', plugin: 'xNoteList', rows: [
    { key: 'bigRows', label: 'Larger list rows', sub: 'On this device.' },
    { key: 'itemCount', label: 'Show how many notes there are', sub: 'On every device you sign in on.', alias: true },
  ] },
  { id: 'more', title: 'More', icon: 'listChecks', plugin: 'xMore', rows: [
    { key: 'binScreen', label: 'Bin', sub: 'Bring back deleted notes.' },
    { key: 'bulkEdit', label: 'Select many notes', sub: 'In the Classic layout: change several notes together.' },
    { key: 'shareIn', label: 'Receive shares from other apps', sub: 'Android.' },
    { key: 'feedbackOn', label: 'Send feedback' },
    { heading: 'Open' },
    { button: 'open-bin', label: 'Bin', sub: 'Deleted notes, to bring back.', text: 'Open' },
    { button: 'open-feedback', label: 'Send feedback', sub: 'Tell us what works and what doesn’t.', text: 'Open' },
  ] },
  { id: 'advanced', title: 'Advanced', icon: 'wrench', plugin: 'xAdvanced', rows: [
    { key: 'mcpOn', label: 'Connect Claude to my notes (MCP)', sub: 'A one-time code for the Notes MCP server.' },
    { button: 'open-mcp', label: 'Connect', sub: 'Get the code.', text: 'Open' },
  ] },
  { id: 'haiku', title: 'Haiku', icon: 'sparkles', plugin: 'xHaiku', rows: [
    { part: 'haiku', label: 'Haiku', sub: 'A prompt run on the text you paste (admins only).' },
  ] },
];

/** the option pages: the root's Options card */
export const OPTION_PAGES = PAGES.filter(p => !p.plugin);
/** the plugin pages: the root's Core plugins card, each while its plugin is on */
export const PLUGIN_PAGES = PAGES.filter(p => p.plugin);

/** a row's option key, if it is an option's own row (not its second row) @param {Row} r */
export const keyOf = r => ('key' in r && !r.alias ? r.key : '');

/**
 * Where each option is changed: its page's id. The plugin switches are on the Core plugins page.
 * @returns {Record<string, string>}
 */
export function optionPages() {
  /** @type {Record<string, string>} */
  const at = {};
  for (const p of PLUGINS) at[p.key] = 'plugins';
  for (const page of PAGES) for (const r of page.rows) {
    const k = keyOf(r);
    if (k) at[k] = page.id;
    if ('part' in r) for (const key of r.keys || []) at[key] = page.id;
  }
  return at;
}

/** the Core plugins page's cards: each group's plugins, alphabetical by name */
export const pluginCards = () => /** @type {const} */ (['core', 'extra']).map(group => ({
  group, rows: PLUGINS.filter(p => p.group === group).sort((a, b) => a.label.localeCompare(b.label)),
}));

/** the mobile toolbar's commands, in order (toolbar.js draws them; the Mobile toolbar page lists them) */
export const TOOLBAR = [
  { id: 'undo', icon: 'undo2', label: 'Undo' },
  { id: 'redo', icon: 'redo2', label: 'Redo' },
  { id: 'link', icon: 'brackets', label: 'Add internal link' },
  { id: 'tag', icon: 'hash', label: 'Add tag' },
  { id: 'attach', icon: 'paperclip', label: 'Insert attachment' },
  { id: 'heading', icon: 'heading', label: 'Toggle heading' },
  { id: 'bold', icon: 'bold', label: 'Toggle bold' },
  { id: 'italic', icon: 'italic', label: 'Toggle italic' },
  { id: 'strike', icon: 'strikethrough', label: 'Toggle strikethrough' },
  { id: 'highlight', icon: 'highlighter', label: 'Toggle highlight' },
  { id: 'list', icon: 'list', label: 'Bullet list' },
  { id: 'task', icon: 'listChecks', label: 'Checklist' },
  { id: 'indent', icon: 'indentIncrease', label: 'Indent' },
  { id: 'unindent', icon: 'indentDecrease', label: 'Unindent' },
  { id: 'hide', icon: 'keyboardOff', label: 'Hide keyboard' },
];
