// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
export const SETTINGS_COLL = 'settings';

/** a folder as typed -> as kept: no slashes at the ends, at most 200 characters @param {unknown} v */
function folder(v) { return String(v ?? '').trim().replace(/^\/+|\/+$/g, '').slice(0, 200); }

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // the person's account: every device they sign in on
  itemCount: { scope: 'account', default: false },
  // the note editor (this device): Markdown shown as written, line numbers, text kept to a readable width
  sourceMode: { scope: 'device', default: false },
  lineNumbers: { scope: 'device', default: false },
  readableWidth: { scope: 'device', default: true },
  // the formatting bar (pinned above the keyboard; the Aa button on a note hides it too), and ticking a to-do moves it down
  fmtBar: { scope: 'device', default: true },
  tickToBottom: { scope: 'device', default: false },
  // where today's note and a new note go (a folder, such as Daily and Inbox; none: the top)
  dailyFolder: { scope: 'device', default: '', clean: folder },
  newFolder: { scope: 'device', default: '', clean: folder },
  // Google Drive copy (@core/drive): off until set up from the Drive sheet, never from the settings sheet's switches
  driveOn: { scope: 'device', default: false },
  // modules added in D2 (recipes/): each off until this device turns it on
  binScreen: { scope: 'device', default: true },
  bulkEdit: { scope: 'device', default: true },
  shareIn: { scope: 'device', default: true },
  feedbackOn: { scope: 'device', default: true },
  // Advanced: the one-time code for the Notes MCP server (Connect MCP)
  mcpOn: { scope: 'device', default: true },
};

/** The options the Settings sheet has a switch for (index.html: #opt-<name>); the folders are text boxes. */
export const SWITCHES = Object.keys(OPTIONS).filter(k => typeof OPTIONS[k].default === 'boolean' && k !== 'driveOn');
export const TEXTS = Object.keys(OPTIONS).filter(k => typeof OPTIONS[k].default === 'string');
