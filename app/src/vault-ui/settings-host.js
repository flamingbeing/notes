// The Vault layout's Settings: a full-height dialog with the kit's settingsScreen. Its pages: Layout (Vault or Classic;
// a change loads the app again in that layout), Core plugins (the Vault layout's own features, then the Classic
// layout's "Notes extras", each a switch for this device), then every page the Classic Settings have, so nothing is
// lost. The pages of a Notes extra show only while it is on. Back closes a page, then the dialog.
import { settingsScreen } from '@core/ui';
import { transients } from '../shell/transients.js';
import { SECTIONS, LAYOUT_ROW, deviceSections, nameControls, keysOf } from '../settings/settings-sheet.js';
import { PLUGINS, GROUPS } from './plugins.js';
import { glyph } from './icons.js';

/** @typedef {import('app-ui/ui/settings-screen').SettingSection} SettingSection */

/** each Classic page shown only while its Notes extra is on (an option key the screen watches) @type {Record<string, string>} */
const GATED = { List: 'xNoteList', 'Tab bar': 'xTabBar' };
const GATED_START = { 'More (': 'xMore', 'Advanced (': 'xAdvanced' };

/** the Core plugins page's rows: one card per group, alphabetical inside it */
const pluginRows = () => /** @type {const} */ (['core', 'extra']).flatMap(g => [
  { heading: GROUPS[g].title },
  ...PLUGINS.filter(p => p.group === g).sort((a, b) => a.label.localeCompare(b.label)).map(p => ({ key: p.key, label: p.label, sub: p.sub })),
]);

/**
 * @param {{ settings: import('app-ui/settings/types').SettingsApi, update?: import('app-ui/ui/types').UpdateApi | null }} app
 * @returns {{ open: () => void, close: () => Promise<void> }}
 */
export function settingsHost(app) {
  const { settings } = app;
  const d = document.createElement('dialog');
  d.id = 'vl-settings';
  d.className = 'vl-settings';
  d.setAttribute('aria-labelledby', 'vl-settings-title');
  const head = Object.assign(document.createElement('div'), { className: 'vl-settings-head' });
  const title = Object.assign(document.createElement('h2'), { id: 'vl-settings-title', textContent: 'Settings' });
  const shut = Object.assign(document.createElement('button'), { type: 'button', id: 'vl-settings-close', className: 'vl-btn' });
  shut.setAttribute('aria-label', 'Close settings');
  shut.append(glyph('x'));
  head.append(title, shut);
  const body = Object.assign(document.createElement('div'), { id: 'vl-settings-body', className: 'vl-settings-body' });
  d.append(head, body);
  document.body.append(d);

  /** @param {SettingSection} s @returns {SettingSection} */
  const gate = s => {
    const key = GATED[s.title] || Object.entries(GATED_START).find(([start]) => s.title.startsWith(start))?.[1];
    return key ? { ...s, visible: key } : s;
  };
  /** @type {SettingSection[]} */
  const sections = [
    { title: 'Layout', sub: 'Vault layout or Classic layout', group: 'Options', find: 'vault classic', rows: [LAYOUT_ROW] },
    { title: 'Core plugins', sub: 'Turn features on or off', group: 'Options', find: 'plugins extras', rows: pluginRows() },
    ...SECTIONS.map(gate),
    ...deviceSections(settings).map(gate),
  ];
  settingsScreen(body, { settings, file: 'notes-settings.json', about: { name: 'Notes', update: app.update || null }, menu: { steps: transients() }, sections });
  nameControls(body, keysOf(sections), settings);
  // the Notes extras card's line under its heading
  const extras = [...body.querySelectorAll('.ui-setting-subhead')].find(h => h.textContent === GROUPS.extra.title);
  if (extras && GROUPS.extra.sub) extras.append(Object.assign(document.createElement('p'), { className: 'vl-subhead-sub', textContent: GROUPS.extra.sub }));
  // (picked here, the page loads again in it; a change from elsewhere, such as Forget this device clearing it, waits for the next start)
  let picked = false;
  body.addEventListener('change', e => { if (/** @type {Element} */ (e.target).id === 'opt-layout') picked = true; }, true);
  settings.watch('layout', () => { if (picked) location.reload(); });

  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let step = null;
  // (a page open in it has its own Back step, above the dialog's: all of them go, newest first)
  const close = async () => { if (step?.active) await transients().dismissAll(); step = null; if (d.open) d.close(); };
  shut.addEventListener('click', () => void close());
  d.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  d.addEventListener('close', () => { if (step?.active) void close(); });
  return {
    open() {
      if (d.open) return;
      d.showModal();
      step = transients().open(() => { step = null; if (d.open) d.close(); });
    },
    close,
  };
}
