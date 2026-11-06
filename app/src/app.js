// The page's shell: the kit's gestures, sync chip, Settings (with the account), and the screen switch. The
// screens (screens/) show the notes list and the note sheet; cloud.js holds sign-in and sync.
import { syncChip, syncButton, plural, startGestures, holdMenus } from '@core/ui';
import { start, usingEmulator, emulatorSignIn } from './cloud.js';
import { fillIcons } from './icons.js';
import { $, dialog } from './shell/dom.js';
import { screenSwitch } from './shell/screen-switch.js';
import { saveSnap, dropSnap, takeOver } from './shell/snap.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { listScreen } from './screens/list.js';
import { tabBar } from './settings/bar.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog:modal');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

// the kit's parts that need script: hold menus, sheets, select mode, large title, tab bar (the adaptive shell is the list's)
// no drawer swipe: a right swipe on the first page only stretches it (owner, 29 Oct 2026: the drawer's pull took
// swipes meant to change tab); the side bar's choices are the Folders tab
const kit = startGestures(document);
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
  // an update's reload owed while someone typed or a sheet was open is tried again once they stop (a field left, a
  // dialog closed), from the start: the Settings screen, which also does it, is made only later
  if (app.update) {
    const retry = () => setTimeout(() => app.update?.retryUpdate(), 0);
    document.addEventListener('focusout', retry);
    document.addEventListener('close', retry, true);
  }
  // (the chip reads only status$) in the phone's bar and, where there is no bar, at the foot of the side bar
  for (const id of ['sync-chip-w']) syncChip($(id), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });
  syncButton($('sync-btn'), { sync: /** @type {any} */ ({ status$: chipStatus$ }), syncNow: async () => { window.starter.syncTaps = Number(window.starter.syncTaps ?? 0) + 1; app.sync.nudge('wake'); await app.sync.flush(); } });
  chipStatus$(st => { window.starter.status = st.state; });
  // the layout (this device; boot.js set <html data-layout> before the first paint): Vault (the default) or Classic
  const vault = document.documentElement.dataset.layout === 'vault';
  tabBar(app.settings);
  const list = listScreen(app, kit);
  // loaded once wanted, not with the app (the start stays small): the Settings sheet (warmed once the list is up, so the
  // tab opens at once) and the spaces switcher (made as soon as the list is ready). The Vault layout has its own
  // settings (vault-ui/settings.js), which keep every option; only one is made, as both name their controls #opt-<key>.
  /** @type {Promise<{ openPanel: () => void }> | undefined} */ let settingsMade;
  const settings = () => (settingsMade ||= import('./settings/settings-sheet.js').then(m => { const made = m.settingsSheet(app); settingsShown(); return made; }));
  let whoText = '';
  const settingsShown = () => { const w = document.getElementById('who'); if (w) w.textContent = whoText; list.modules(); };
  /** @type {Promise<{ draw: (s: import('./cloud.js').State) => void }> | undefined} */ let spacesMade;
  /** @type {import('./cloud.js').State | null} */ let readyState = null;
  const spaces = () => (spacesMade ||= import('./spaces/spaces-sheet.js').then(m => m.spacesSheet(app, list.toast)));
  if (!vault) {
    for (const id of ['open-settings', 'open-settings-w']) $(id).addEventListener('pointerdown', () => void settings());
    $('open-settings').addEventListener('click', () => void settings());
    $('open-settings-w').addEventListener('click', async () => (await settings()).openPanel());
  }
  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: list,
  });
  // (Sign out is on a Settings page, made later: the click is caught here)
  document.addEventListener('click', e => { if (/** @type {Element} */ (e.target).closest?.('#sign-out')) void signOut(); });
  const signOut = async () => {
    // (the Vault layout: the note open is saved, then the page shows none, so nothing of this account stays on screen)
    if (vault) await (await list.pageReady()).blank();
    dialog('settings-panel').close();
    /** @type {HTMLDialogElement | null} */ (document.getElementById('vl-set'))?.close();
    kit.tabs?.go('#home');
    dropSnap();
    // (the Vault layout's own state on this device, vault-ui/state.js: the last note, tabs and the like)
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('notes:vl:')) localStorage.removeItem(k); } catch { /* storage off */ }
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The list is kept on this device for your next sign-in.';
  };
  // the list as shown, kept for the next start (public/snap.js paints it at once): a moment after it changes, and on leaving
  let snapTimer = 0;
  // (when the page is idle, so a swipe or typing never waits on it)
  const keepSnap = () => { clearTimeout(snapTimer); snapTimer = window.setTimeout(() => (window.requestIdleCallback || setTimeout)(() => saveSnap()), 1000); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(snapTimer); saveSnap(); } });
  // Back after a redirect sign-in comes to the page the sign-in left from, kept whole by the browser (the back/forward
  // cache) and still on the sign-in screen: load it again, so it opens as it is now (the list)
  let phase = '';
  /** @type {Promise<unknown> | undefined} */ let shellMade;
  addEventListener('pageshow', e => { if (e.persisted && phase !== 'ready') location.reload(); });
  app.follow({
    onState(s) {
      phase = s.phase;
      // (the Vault layout's note page and pill show only with the notes up: not over the sign-in or no-access screens)
      document.documentElement.classList.toggle('vl-off', s.phase !== 'ready');
      whoText = s.user ? s.user.email : '';
      const who = document.getElementById('who');
      if (who) who.textContent = whoText;
      for (const id of ['open-settings', 'open-settings-w']) $(id).hidden = !s.user;
      if (s.phase === 'ready') { readyState = s; void spaces().then(sp => { if (readyState) sp.draw(readyState); }); }
      if (s.user) $('sign-out-msg').textContent = '';
      if (s.phase !== 'ready') { takeOver(); dropSnap(); }
      show(s);
    },
    onList(items, changed) {
      const tapped = takeOver();
      list.draw(items, changed);
      window.starter.ready = true;
      // the list is up: the Classic Settings sheet next (idle), the Vault layout's shell at once
      if (!vault) { if ('requestIdleCallback' in window) requestIdleCallback(() => void settings(), { timeout: 1500 }); else setTimeout(() => void settings(), 300); }
      else if (!shellMade) shellMade = import('./vault-ui/shell.js').then(m => m.vaultShell(app, kit, list, { who: () => whoText }));
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
