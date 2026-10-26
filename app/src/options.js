// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
export const SETTINGS_COLL = 'settings';

/** @type {Record<string, import('../public/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // the person's account: every device they sign in on
  itemCount: { scope: 'account', default: false },
  // the note editor (this device): Markdown shown as written, line numbers, text kept to a readable width
  sourceMode: { scope: 'device', default: false },
  lineNumbers: { scope: 'device', default: false },
  readableWidth: { scope: 'device', default: true },
  // where today's note goes (a folder; none: the top)
  dailyFolder: { scope: 'device', default: '', clean: v => String(v ?? '').trim().replace(/^\/+|\/+$/g, '').slice(0, 200) },
};

/** The options the Settings sheet has a switch for (index.html: #opt-<name>); dailyFolder is a text box. */
export const SWITCHES = Object.keys(OPTIONS).filter(k => typeof OPTIONS[k].default === 'boolean');
