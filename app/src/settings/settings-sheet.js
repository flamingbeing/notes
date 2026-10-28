// The Settings sheet (the Settings tab's page on a phone, a side panel from 600 px) drawn by the kit's settingsScreen from the app's options
// (options.js): a switch per option, boxes for the two folders, this device's look and density, the buttons that open
// the other sheets, and the account (who is signed in, Sign out). The editor's options apply in note-page.js. An option
// for the account while signed out is refused by the settings api, and the screen says why.
import { settingsScreen } from '@core/ui';
import { themeSwitch } from '@core/theme';
import { $, dialog } from '../shell/dom.js';

/** @typedef {import('app-ui/ui/settings-screen').SettingSection} SettingSection */

/** @type {SettingSection[]} */
const SECTIONS = [
  { title: 'List', rows: [
    { key: 'itemCount', label: 'Show how many notes there are', sub: 'Every device you sign in on' },
    { key: 'bigRows', label: 'Larger list rows', sub: 'This device' },
  ] },
  { title: 'Editor (this device)', rows: [
    { key: 'sourceMode', label: 'Source mode', sub: 'Show the Markdown as written' },
    { key: 'lineNumbers', label: 'Line numbers' },
    { key: 'readableWidth', label: 'Readable line width' },
  ], mount: folders },
  { title: 'More (this device, each off until you turn it on)', rows: [
    { key: 'binScreen', label: 'Bin', sub: 'Bring back deleted notes' },
    { key: 'bulkEdit', label: 'Select many notes', sub: 'Change them together' },
    { key: 'shareIn', label: 'Receive shares from other apps', sub: 'Android' },
    { key: 'feedbackOn', label: 'Send feedback' },
  ] },
  { title: 'Advanced (this device, off until you turn it on)', rows: [
    { key: 'mcpOn', label: 'Connect Claude to my notes (MCP)' },
  ] },
];
/** the keys of the rows above, in order (a row's control is #opt-<key>) */
const KEYS = SECTIONS.flatMap(s => (s.rows || []).map(r => r.key));

/** a row holding the given parts @param {...Node} parts */
function row(...parts) {
  const li = document.createElement('li');
  li.className = 'ui-row';
  li.append(...parts);
  return li;
}
/** @param {HTMLElement} host @param {HTMLLIElement[]} rows  the rows, as a list */
function listIn(host, rows) {
  const list = document.createElement('ul');
  list.className = 'ui-list';
  list.append(...rows);
  host.append(list);
}

/** the two folder boxes, kept when the box is left (the app's clean trims the slashes) @param {HTMLElement} host */
function folders(host) {
  const rows = [['newFolder', 'Folder for new notes', 'none, such as Inbox'], ['dailyFolder', 'Folder for today’s note', 'none, such as Daily']].map(([key, label, hint]) => {
    const box = Object.assign(document.createElement('input'), { id: `opt-${key}`, maxLength: 200, placeholder: hint, autocomplete: 'off' });
    const name = Object.assign(document.createElement('label'), { htmlFor: box.id, className: 'ui-row-main', textContent: label });
    box.dataset.key = key;
    return row(name, box);
  });
  listIn(host, rows);
}

/** @param {{ settings: import('app-ui/settings/types').SettingsApi, update?: import('app-ui/ui/types').UpdateApi | null }} app */
export function settingsSheet(app) {
  const { settings } = app;
  const panel = dialog('settings-panel');

  // what the options do to the page, now and whenever one changes (here or on another device)
  const apply = () => {
    $('items').classList.toggle('big', settings.get('bigRows'));
    $('count').hidden = !settings.get('itemCount');
  };
  settings.watch(null, apply);
  apply();

  const body = $('settings-body');
  settingsScreen(body, {
    settings, file: 'notes-settings.json', about: { name: 'Notes', update: app.update || null },
    sections: [
      ...SECTIONS,
      { title: 'This device', mount: host => themeSwitch(host) },
      { title: 'Notes and files', mount: host => listIn(host, [
        ['open-transfer', 'Import or export notes', false], ['open-drive', 'Google Drive', false],
        ['open-bin', 'Bin', true], ['open-feedback', 'Send feedback', true], ['open-mcp', 'Connect MCP', true],
      ].map(([id, label, hidden]) => row(Object.assign(document.createElement('button'), { id, type: 'button', textContent: label, hidden })))) },
      { title: 'Account', mount: host => listIn(host, [row(
        Object.assign(document.createElement('span'), { id: 'who', className: 'ui-row-main' }),
        Object.assign(document.createElement('button'), { id: 'sign-out', type: 'button', textContent: 'Sign out' }),
      )]) },
    ],
  });
  // the controls are named by their option (#opt-<key>), as the tests have always had them
  [...body.querySelectorAll('.ui-setting')].slice(0, KEYS.length).forEach((li, i) => {
    const control = li.querySelector('input,select'), label = li.querySelector('label');
    if (control && label) { control.id = `opt-${KEYS[i]}`; /** @type {HTMLLabelElement} */ (label).htmlFor = control.id; }
  });
  // the folder boxes (text options, which the screen has no row for) save when the box is left
  for (const box of /** @type {NodeListOf<HTMLInputElement>} */ (body.querySelectorAll('input[data-key]'))) {
    const key = /** @type {string} */ (box.dataset.key);
    const show = () => { box.value = String(settings.get(key) || ''); };
    show();
    settings.watch(key, show);
    box.addEventListener('change', async () => { await settings.set(key, box.value).catch(() => {}); show(); });
  }

  // a tablet or laptop shows it as a side panel (the phone's tab is the page itself): the body moves in and back out
  const page = $('settings');
  $('open-settings-w').addEventListener('click', () => { $('settings-panel-body').append(body); panel.showModal(); });
  panel.addEventListener('close', () => page.append(body));
  $('settings-close').addEventListener('click', () => panel.close());
}
