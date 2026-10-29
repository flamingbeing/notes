// The page's shell: the kit's gestures, sync chip, Settings (with the account), and the screen switch. The
// screens (screens/) show the notes list and the note sheet; cloud.js holds sign-in and sync.
import { syncChip, plural, startGestures, holdMenus } from '@core/ui';
import { start, usingEmulator, emulatorSignIn } from './cloud.js';
import { fillIcons } from './icons.js';
import { $, dialog } from './shell/dom.js';
import { screenSwitch } from './shell/screen-switch.js';
import { saveSnap, dropSnap, takeOver } from './shell/snap.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { syncButton } from './sync-button.js';
import { listScreen } from './screens/list.js';
import { settingsSheet } from './settings/settings-sheet.js';
import { spacesSheet } from './spaces/spaces-sheet.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog:modal');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

// the kit's parts that need script: hold menus, sheets, select mode, large title, tab bar (the adaptive shell is the list's)
// a right swipe on the first page pulls the side bar out as a drawer, with the finger (Android's Back keeps the edges)
/** @type {(() => ReturnType<ReturnType<typeof listScreen>['drawer']>) | null} */
let sideDrawer = null;   // the list screen's, once it is made
const kit = startGestures(document, { drawer: () => sideDrawer?.() ?? null });
// (the kit starts hold menus only when one is on the page at start; the note rows come later)
if (!kit.menus) holdMenus(document);
fillIcons();
// the bar's Today / Select / New belong to the notes page: on the Folders or Settings page they leave the bar
document.addEventListener('ui-tab', e => { $('list-view').dataset.page = /** @type {CustomEvent} */ (e).detail.page.id; });
// for the tests: add(title, body?) -> '' or why the save was refused
window.starter = { ready: false, add: async (title, body) => (await app?.create({ title, body }))?.refused ?? 'no app', signInAs: emulatorSignIn, files: () => app?.files, members: () => app?.members };
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });

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
  for (const id of ['sync-chip-w']) syncChip($(id), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });
  syncButton(/** @type {HTMLButtonElement} */ ($('sync-btn')), { status$: chipStatus$, syncNow: async () => { window.starter.syncTaps = Number(window.starter.syncTaps ?? 0) + 1; app.sync.nudge?.('wake'); await app.sync.flush(); } });
  chipStatus$(st => { window.starter.status = st.state; });
  settingsSheet(app);
  const list = listScreen(app, kit);
  sideDrawer = list.drawer;
  const spaces = spacesSheet(app, list.toast);
  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: list,
  });
  $('sign-out').addEventListener('click', async () => {
    dialog('settings-panel').close();
    kit.tabs?.go('#home');
    dropSnap();
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The list is kept on this device for your next sign-in.';
  });
  // the list as shown, kept for the next start (public/snap.js paints it at once): a moment after it changes, and on leaving
  let snapTimer = 0;
  // (when the page is idle, so a swipe or typing never waits on it)
  const keepSnap = () => { clearTimeout(snapTimer); snapTimer = window.setTimeout(() => (window.requestIdleCallback || setTimeout)(() => saveSnap()), 1000); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(snapTimer); saveSnap(); } });
  // Back after a redirect sign-in comes to the page the sign-in left from, kept whole by the browser (the back/forward
  // cache) and still on the sign-in screen: load it again, so it opens as it is now (the list)
  let phase = '';
  addEventListener('pageshow', e => { if (e.persisted && phase !== 'ready') location.reload(); });
  app.follow({
    onState(s) {
      phase = s.phase;
      $('who').textContent = s.user ? s.user.email : '';
      for (const id of ['open-settings', 'open-settings-w']) $(id).hidden = !s.user;
      if (s.phase === 'ready') spaces.draw(s);
      if (s.user) $('sign-out-msg').textContent = '';
      if (s.phase !== 'ready') { takeOver(); dropSnap(); }
      show(s);
    },
    onList(items, changed) {
      const tapped = takeOver();
      list.draw(items, changed);
      window.starter.ready = true;
      // (unless a note is open already: the one open before a reload comes back by itself)
      if (tapped && !dialog('edit').open) /** @type {HTMLElement | null} */ ($('items').querySelector(`li[data-id="${CSS.escape(tapped)}"]`))?.click();
      keepSnap();
    },
    onFiles() { list.files(); },
    // a clash with another device's edit: the other device's text stays, this device's is kept as its own note
    onConflict(copy) { list.toast(`Edited on two devices at once; your version is kept as “${copy.title}”.`); },
    // taken out of a space (or it was deleted): its notes have left this device
    onRemoved(name) { list.toast(`You’re no longer in “${name}”; its notes are gone from this device.`); },
  });
}
