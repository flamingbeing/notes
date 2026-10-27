// The page's shell: the kit's gestures, sync chip and update prompt, Settings (with the account), and the screen switch. The
// screens (screens/) show the notes list and the note sheet; cloud.js holds sign-in and sync.
import { syncChip, updatePrompt, plural, startGestures } from '@core/ui';
import { start, usingEmulator, emulatorSignIn } from './cloud.js';
import { $, dialog } from './shell/dom.js';
import { screenSwitch } from './shell/screen-switch.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { listScreen } from './screens/list.js';
import { settingsSheet } from './settings/settings-sheet.js';
import { spacesSheet } from './spaces/spaces-sheet.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

// the kit's parts that need script: hold menus, sheets, select mode, large title, tab bar (the adaptive shell is the list's)
const kit = startGestures();
// for the tests: add(title, body?) -> '' or why the save was refused
window.starter = { ready: false, add: async (title, body) => (await app?.create({ title, body }))?.refused ?? 'no app', signInAs: emulatorSignIn, files: () => app?.files, members: () => app?.members };
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });
updatePrompt($('update-prompt'), { update: app?.update || null });

if (!app) notSetUpScreen().show({ phase: 'not-set-up' });
else {
  // the chip and the tests' status read the whole app (sync and files), not the sync module alone: "Saved" only when
  // nothing is unsent anywhere, the same count sign-out reports. (The files module says 'saving'; the chip's word is 'pending'.)
  /** @param {(st: { state: string, count: number }) => void} fn */
  const chipStatus$ = fn => app.status$(st => {
    const state = st.state === 'saving' ? 'pending' : st.state;
    fn(state === 'synced' && st.unsent > 0 ? { state: 'pending', count: st.unsent } : { state, count: st.count });
  });
  // (the chip reads only status$) in the phone's bar and, where there is no bar, at the foot of the side bar
  for (const id of ['sync-chip', 'sync-chip-w']) syncChip($(id), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });
  chipStatus$(st => { window.starter.status = st.state; });
  settingsSheet(app);
  const list = listScreen(app, kit);
  const spaces = spacesSheet(app, list.toast);
  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: list,
  });
  $('sign-out').addEventListener('click', async () => {
    dialog('settings').close();
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The list is kept on this device for your next sign-in.';
  });
  app.follow({
    onState(s) {
      $('who').textContent = s.user ? s.user.email : '';
      for (const id of ['open-settings', 'open-settings-w']) $(id).hidden = !s.user;
      if (s.phase === 'ready') spaces.draw(s);
      if (s.user) $('sign-out-msg').textContent = '';
      show(s);
    },
    onList(items, changed) {
      list.draw(items, changed);
      window.starter.ready = true;
    },
    onFiles() { list.files(); },
    // a clash with another device's edit: the other device's text stays, this device's is kept as its own note
    onConflict(copy) { list.toast(`Edited on two devices at once; your version is kept as “${copy.title}”.`); },
    // taken out of a space (or it was deleted): its notes have left this device
    onRemoved(name) { list.toast(`You’re no longer in “${name}”; its notes are gone from this device.`); },
  });
}
