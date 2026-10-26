// The page's shell: the theme, the kit's sync chip and update prompt, the account footer, and the screen switch. The
// screens (screens/) show the notes list and the note sheet; cloud.js holds sign-in and sync.
import { syncChip, updatePrompt, plural } from '@core/ui';
import { themeSwitch } from '@core/theme';
import { start, usingEmulator, emulatorSignIn } from './cloud.js';
import { $ } from './dom.js';
import { screenSwitch } from './screen-switch.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { listScreen } from './screens/list.js';
import { settingsSheet } from './settings-sheet.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

themeSwitch($('theme-switch'));
// for the tests: add(title, body?) -> '' or why the save was refused
window.starter = { ready: false, add: async (title, body) => (await app?.create({ title, body }))?.refused ?? 'no app', signInAs: emulatorSignIn, files: () => app?.files };
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
  syncChip($('sync-chip'), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });   // (the chip reads only status$)
  chipStatus$(st => { window.starter.status = st.state; });
  let signedIn = false;
  settingsSheet(app, () => signedIn);
  const list = listScreen(app);
  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: list,
  });
  $('sign-out').addEventListener('click', async () => {
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The list is kept on this device for your next sign-in.';
  });
  app.follow({
    onState(s) {
      $('who').textContent = s.user ? s.user.email : '';
      $('sign-out').hidden = !s.user;
      $('open-settings').hidden = !s.user;
      signedIn = !!s.user;
      if (s.user) $('sign-out-msg').textContent = '';
      show(s);
    },
    onList(items, changed) {
      list.draw(items, changed);
      window.starter.ready = true;
    },
    // a clash with another device's edit: the other device's text stays, this device's is kept as its own note
    onConflict(copy) { list.toast(`Edited on two devices at once; your version is kept as “${copy.title}”.`); },
  });
}
