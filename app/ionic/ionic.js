// The Ionic trial's screens (docs/decisions/0020-ionic-trial.md): the same app (../src/cloud.js: sign-in, sync, the notes
// and settings, unchanged) shown with Ionic's parts in Material mode: a menu (folders, tags, spaces, settings) beside or
// over the list, the list with search, pull to refresh and swipe to delete, a note page pushed onto a nav stack (back
// button and swipe back), and sheets (ion-modal with breakpoints) for a note's details and for settings. What the trial
// leaves out (attachments, import and export, Drive, the bin, select mode, sharing, feedback, MCP, space members) is on
// the classic page, one folder up.
import { start, emulatorSignIn } from '../src/cloud.js';
import { isoDay } from '../src/notes/model.js';
import { createSearch } from '@core/search';
import { THEME_KEY, themeChoice, applyTheme } from './setup.js';

/** @typedef {import('../src/cloud.js').Note} Note */
/** @typedef {NonNullable<Awaited<ReturnType<typeof start>>>} App */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @param {string} html @returns {HTMLElement} */
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return /** @type {HTMLElement} */ (t.content.firstElementChild); };
const esc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const plural = (/** @type {number} */ n, /** @type {string} */ w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the list's helpers (as the classic list's; copied, since its module brings the classic kit with it)
const titleOf = (/** @type {Note | null} */ n) => String(n?.title ?? '') || 'Untitled';
const low = (/** @type {unknown} */ s) => String(s ?? '').toLowerCase();
const bare = (/** @type {string} */ s) => low(s).replace(/^[#/]+|\/+$/g, '');
const hasTag = (/** @type {Note} */ n, /** @type {string} */ t) => (n.tags || []).some(x => low(x) === bare(t) || low(x).startsWith(bare(t) + '/'));
const inFolder = (/** @type {Note} */ n, /** @type {string} */ f) => low(n.path) === bare(f) || low(n.path).startsWith(bare(f) + '/');
/** @param {Note} note @param {string} title */
function previewOf(note, title) {
  const lines = String(note.body || '').slice(0, 800).split('\n').map(l => l.replace(/^\s*(?:#{1,6}|[-*+>]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '').replace(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim()).filter(Boolean);
  if (lines[0] === title) lines.shift();
  return lines.join(' ').slice(0, 240);
}

// the sign-in words (as the classic sign-in sheet's)
/** @param {unknown} err */
function whyFailed(err) {
  const code = String(/** @type {{ code?: unknown } | null} */ (err)?.code || '');
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) return 'Sign-in was cancelled.';
  if (/network-request-failed|unavailable|deadline-exceeded/.test(code)) return 'No signal, so that didn’t work. Try again when you’re online.';
  if (/unauthorized-domain|operation-not-allowed/.test(code)) return 'Sign-in isn’t switched on for this address yet.';
  return 'Sign-in didn’t work. Try again in a moment.';
}
/** @param {{ reason: string, from?: { email?: string } | null }} r */
function whyRefused({ reason, from }) {
  const last = from?.email || 'the last account';
  if (reason === 'unsent') return `This phone still has changes from ${last} that haven’t been sent. Sign in as that account to send them, or forget this device.`;
  if (reason === 'wipe') return `This phone couldn’t clear ${last}’s copy, so it stays. Try again.`;
  return '';
}
/** @param {{ ok: boolean, reason: string, failed?: string[] }} r */
function forgetWords({ ok, reason, failed = [] }) {
  if (ok && failed.length) return `Signed out, but some of this app's data could not be cleared (${failed.join(', ')}). Close every tab of this app and forget again.`;
  if (ok) return 'Forgotten: this device holds nothing of this app now.';
  return reason === 'unsent' ? 'Some changes on this device are not sent yet. Sign in to send them, or forget anyway and lose them.' : 'Forget didn’t work. Try again.';
}

/** @param {string} message */
async function toast(message) {
  const t = /** @type {any} */ (Object.assign(document.createElement('ion-toast'), { message, duration: 3000, position: 'bottom' }));
  document.body.append(t);
  await customElements.whenDefined('ion-toast');
  await t.present();
  void t.onDidDismiss().then(() => t.remove());
}

/** @param {string} header @param {string} message @param {string} yes -> whether the person said yes */
async function confirmAlert(header, message, yes) {
  const a = /** @type {any} */ (document.createElement('ion-alert'));
  Object.assign(a, { header, message, buttons: [{ text: 'Cancel', role: 'cancel' }, { text: yes, role: 'destructive' }] });
  document.body.append(a);
  await a.present();
  const { role } = await a.onDidDismiss();
  a.remove();
  return role === 'destructive';
}

/** a sheet: an ion-modal with breakpoints, removed once closed (opened at once: wire its parts before the animation ends)
 * @param {HTMLElement} body @param {number[]} breakpoints */
function sheet(body, breakpoints = [0, 0.6, 1]) {
  const m = /** @type {any} */ (document.createElement('ion-modal'));
  Object.assign(m, { breakpoints, initialBreakpoint: breakpoints[1], handle: true });
  m.className = 'sheet';
  m.append(body);
  document.querySelector('ion-app')?.append(m);
  void m.onDidDismiss().then(() => m.remove());
  void m.present();
  return m;
}

// for the tests: as the classic page's (add(title, body?) -> '' or why the save was refused)
window.starter = { ready: false, add: async (title, body) => (await app?.create({ title, body }))?.refused ?? 'no app', signInAs: emulatorSignIn };
const app = await start({ canReload: null });   // no update module here: the classic page's service worker serves this page too

if (!app) showGate('not-set-up');
else main(app);

/** @param {string} phase */
function showGate(phase) {
  $('gate').hidden = phase === 'ready';
  $('list-view').hidden = phase !== 'ready';
  for (const id of ['signed-out', 'no-access', 'not-set-up']) $(id).hidden = id !== phase;
}

/** @param {App} app */
function main(app) {
  const { settings } = app;
  const nav = /** @type {any} */ ($('nav'));
  const menu = /** @type {any} */ ($('menu'));
  const canWrite = () => app.space()?.role !== 'view';

  // ---- the gate: sign in, forget this device
  $('sign-in').addEventListener('click', async () => {
    $('sign-in-error').textContent = '';
    try { $('sign-in-error').textContent = whyRefused(await app.auth.signIn()); } catch (e) { $('sign-in-error').textContent = whyFailed(e); }
  });
  /** @param {boolean} force */
  const forget = async force => {
    const r = await app.auth.forget({ force });
    $('forget-force').hidden = r.ok || r.reason !== 'unsent';
    $('forget-msg').textContent = forgetWords(r);
    if (r.ok) $('sign-out-msg').textContent = '';
  };
  $('forget').addEventListener('click', () => void forget(false));
  $('forget-force').addEventListener('click', () => void forget(true));

  // ---- the sync status (the whole app's: "Saved" only when nothing is unsent, as the classic chip)
  let syncWords = '';
  app.status$(st => {
    const state = st.state === 'saving' ? 'pending' : st.state === 'synced' && st.unsent > 0 ? 'pending' : st.state;
    window.starter.status = state;
    const n = st.unsent || st.count;
    syncWords = state === 'synced' ? 'Saved' : state === 'pending' ? (n ? `${n} unsent` : 'Saving…') : state === 'offline' ? 'Offline' : state === 'unknown' ? '' : 'Not saved';
    for (const el of document.querySelectorAll('.sync')) el.textContent = syncWords;
  });

  // ---- the list
  const search = createSearch({
    fields: ['title', 'body', 'tags'],
    operators: { tag: (rec, v) => hasTag(/** @type {Note} */ (rec), v), path: (rec, v) => inFolder(/** @type {Note} */ (rec), v) },
  });
  const known = new Map();
  const textOf = (/** @type {Note} */ n) => JSON.stringify([n.title, n.body, n.tags, n.path]);
  /** @type {{ kind: 'folder' | 'tag', value: string } | null} */
  let filter = null;
  let query = '';
  let shown = 150;   // rows drawn at once; "Show more" adds more (each row is several Ionic parts)

  const listPage = h(`<div>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
        <ion-title id="list-title">Notes</ion-title>
        <ion-buttons slot="end">
          <span class="sync" role="status"></span>
          <ion-button id="today" aria-label="Today’s note"><ion-icon slot="icon-only" name="calendar-outline"></ion-icon></ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar><ion-searchbar id="search" debounce="150" placeholder="Search notes" aria-label="Search notes"></ion-searchbar></ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-refresher slot="fixed" id="refresher"><ion-refresher-content></ion-refresher-content></ion-refresher>
      <ion-chip id="filter-chip" class="filter-chip" hidden><ion-label></ion-label><ion-icon name="close-circle"></ion-icon></ion-chip>
      <ion-note id="search-msg" class="ion-padding-horizontal"></ion-note>
      <ion-list id="items"></ion-list>
      <p id="empty" class="empty" hidden></p>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end"><ion-fab-button id="new" aria-label="New note"><ion-icon name="add"></ion-icon></ion-fab-button></ion-fab>
    </ion-content>
  </div>`);
  const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (listPage.querySelector(sel));

  const visible = () => {
    let notes = app.notes();
    if (filter) notes = notes.filter(n => (filter?.kind === 'tag' ? hasTag(n, filter.value) : inFolder(n, filter?.value || '')));
    q('#search-msg').textContent = '';
    if (!query) return [...notes].sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    const keep = new Set(notes.map(n => n.id));
    const { hits, unknown } = search.search(query, { limit: 1000 });
    q('#search-msg').textContent = unknown.length ? `Did you mean ${unknown.map(u => u.suggest).join(', ')}?` : hits.length ? '' : 'No matches';
    const byId = new Map(notes.map(n => [n.id, n]));
    return hits.filter(x => keep.has(x.id)).map(x => /** @type {Note} */ (byId.get(x.id)));
  };

  const drawList = () => {
    const notes = visible();
    const items = q('#items');
    items.classList.toggle('big', !!settings.get('bigRows'));
    const rows = notes.slice(0, shown).map(n => {
      const title = titleOf(n);
      const row = h(`<ion-item-sliding>
        <ion-item button detail="false" data-id="${esc(n.id)}">
          <ion-label>
            <h2>${esc(title)}</h2>
            ${n.path ? `<p class="path">${esc(n.path)}</p>` : ''}
            <p class="preview">${esc(previewOf(n, title))}</p>
          </ion-label>
        </ion-item>
        ${canWrite() ? '<ion-item-options side="end"><ion-item-option color="danger" expandable data-delete>Delete</ion-item-option></ion-item-options>' : ''}
      </ion-item-sliding>`);
      return row;
    });
    if (notes.length > shown) rows.push(h(`<ion-item button detail="false" data-more><ion-label color="primary">Show ${Math.min(150, notes.length - shown)} more of ${notes.length - shown}</ion-label></ion-item>`));
    items.replaceChildren(...rows);
    const empty = q('#empty');
    empty.hidden = notes.length > 0 || !!query;
    empty.textContent = app.notes().length ? 'Nothing here.' : 'No notes yet. Tap + to write one.';
    const count = app.notes().length;
    q('#list-title').textContent = filter ? (filter.kind === 'tag' ? '#' + filter.value : filter.value) : app.space()?.name || 'Notes';
    if (settings.get('itemCount')) q('#list-title').textContent += ` (${notes.length})`;
    $('count-all').textContent = String(count);
    const chip = q('#filter-chip');
    chip.hidden = !filter;
    /** @type {HTMLElement} */ (chip.querySelector('ion-label')).textContent = filter ? (filter.kind === 'tag' ? `Tag #${filter.value}` : `Folder ${filter.value}`) : '';
    q('#new').parentElement && (/** @type {HTMLElement} */ (q('#new').parentElement).hidden = !canWrite());
  };

  q('#items').addEventListener('click', async e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-more]')) { shown += 150; drawList(); return; }
    const sliding = /** @type {any} */ (t.closest('ion-item-sliding'));
    const id = /** @type {HTMLElement | null} */ (sliding?.querySelector('ion-item[data-id]'))?.dataset.id;
    const note = app.notes().find(n => n.id === id);
    if (!note) return;
    if (t.closest('[data-delete]')) {
      await sliding.close();
      if (await confirmAlert('Delete this note?', `“${titleOf(note)}” leaves every device.`, 'Delete')) { await app.remove(note); void toast('Deleted'); }
      return;
    }
    void openNote(note);
  });
  q('#search').addEventListener('ionInput', e => { query = String(/** @type {any} */ (e).detail.value || '').trim(); shown = 150; drawList(); });
  q('#filter-chip').addEventListener('click', () => { filter = null; drawList(); });
  // pull to refresh: send what is unsent now (the list itself is live)
  q('#refresher').addEventListener('ionRefresh', async e => {
    const ok = await app.sync.flush().catch(() => false);
    /** @type {any} */ (e.target).complete();
    void toast(ok ? 'Up to date' : 'Some changes aren’t sent yet; they send when you’re online.');
  });
  q('#new').addEventListener('click', () => void openNote(null));
  const today = async () => {
    const { note, refused } = await app.daily(isoDay(), String(settings.get('dailyFolder') || ''));
    if (refused) void toast(refused);
    void openNote(note);
  };
  q('#today').addEventListener('click', () => void today());

  // ---- the menu: all notes, today, folders, tags, spaces, settings
  const drawMenu = () => {
    const notes = app.notes();
    /** @type {Map<string, number>} */ const folders = new Map();
    /** @type {Map<string, number>} */ const tags = new Map();
    for (const n of notes) {
      const parts = String(n.path || '').split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) { const f = parts.slice(0, i).join('/'); folders.set(f, (folders.get(f) || 0) + 1); }
      for (const t of n.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
    }
    /** @param {string} id @param {'folder' | 'tag'} kind @param {Map<string, number>} m @param {string} icon */
    const fill = (id, kind, m, icon) => {
      const list = $(id);
      const rows = [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => h(`<ion-menu-toggle auto-hide="false"><ion-item button detail="false" data-${kind}="${esc(v)}">
        <ion-icon slot="start" name="${icon}"></ion-icon><ion-label class="depth-${kind === 'folder' ? Math.min(v.split('/').length - 1, 4) : 0}">${esc(kind === 'tag' ? '#' + v : v.split('/').pop())}</ion-label><ion-note slot="end">${c}</ion-note></ion-item></ion-menu-toggle>`));
      list.replaceChildren(/** @type {HTMLElement} */ (list.querySelector('ion-list-header')), ...rows);
      list.hidden = !rows.length;
    };
    fill('menu-folders', 'folder', folders, 'folder-outline');
    fill('menu-tags', 'tag', tags, 'pricetag-outline');
  };
  $('menu').addEventListener('click', e => {
    const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('ion-item'));
    if (!item) return;
    if (item.dataset.folder !== undefined) filter = { kind: 'folder', value: item.dataset.folder };
    else if (item.dataset.tag !== undefined) filter = { kind: 'tag', value: item.dataset.tag };
    else if (item.dataset.filter !== undefined) filter = null;
    else if (item.id === 'menu-daily') { void today(); return; }
    else if (item.id === 'open-settings') { void openSettings(); return; }
    else if (item.dataset.space) { void switchSpace(item.dataset.space); return; }
    else return;
    void nav.popToRoot();
    drawList();
  });
  /** @param {import('../src/cloud.js').State} s */
  const drawSpaces = s => {
    const open = s.space?.id;
    const rows = [{ id: app.vault(), name: 'My notes', role: 'owner' }, ...(s.spaces || [])].map(sp => h(`<ion-menu-toggle auto-hide="false"><ion-item button detail="false" data-space="${esc(sp.id)}">
      <ion-icon slot="start" name="${sp.id === app.vault() ? 'person-outline' : 'people-outline'}"></ion-icon><ion-label>${esc(sp.name || 'Untitled space')}</ion-label>
      ${sp.id === open ? '<ion-icon slot="end" name="checkmark" color="primary"></ion-icon>' : sp.role === 'view' ? '<ion-note slot="end">view</ion-note>' : ''}</ion-item></ion-menu-toggle>`));
    const list = $('menu-spaces');
    list.replaceChildren(/** @type {HTMLElement} */ (list.querySelector('ion-list-header')), ...rows);
    list.hidden = rows.length < 2;
  };
  /** @param {string} sid */
  const switchSpace = async sid => {
    const why = await app.switchTo(sid);
    if (why) { void toast(why); return; }
    filter = null;
    void nav.popToRoot();
  };

  // ---- a note: pushed onto the nav (back button, swipe back); saved as it is typed and on leaving
  /** @type {null | { id: string, refresh: () => void }} */
  let openPage = null;
  /** @param {Note | null} start  null: a new note, made once something is typed @param {string} [title] */
  async function openNote(start, title = '') {
    let base = start;            // the copy the edits started from (the merge's base); null until a new note is made
    const rw = canWrite();
    const page = h(`<div>
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-back-button default-href="#" text=""></ion-back-button></ion-buttons>
          <ion-title></ion-title>
          <ion-buttons slot="end">
            <span class="sync"></span>
            <ion-button class="toggle-read" aria-label="Read view"><ion-icon slot="icon-only" name="eye-outline"></ion-icon></ion-button>
            <ion-button class="details" aria-label="Details"><ion-icon slot="icon-only" name="ellipsis-vertical"></ion-icon></ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding${settings.get('readableWidth') ? '' : ' wide'}">
        <div class="note-body">
          <ion-input class="note-title" placeholder="Title" aria-label="Title" ${rw ? '' : 'readonly'}></ion-input>
          <p class="note-status small" role="status"></p>
          <div class="cm-host"><textarea class="note-text" aria-label="Text" placeholder="Write here" ${rw ? '' : 'readonly'}></textarea></div>
          <div class="read-view" hidden></div>
        </div>
      </ion-content>
    </div>`);
    const p = (/** @type {string} */ sel) => /** @type {any} */ (page.querySelector(sel));
    const titleBox = p('.note-title'), area = p('.note-text'), host = p('.cm-host'), read = p('.read-view');
    titleBox.value = start ? start.title : title;
    area.value = start ? String(start.body || '') : '';
    p('ion-title').textContent = start ? titleOf(start) : 'New note';
    p('.sync').textContent = syncWords;
    /** @type {null | { value: () => string, set: (t: string) => void }} */
    let ed = null;
    /** @type {null | { show: (t: string) => void }} */
    let reader = null;
    const body = () => (ed ? ed.value() : area.value);
    const title_ = () => String(titleBox.value || '').trim();
    const dirty = () => !base ? !!(title_() || body()) : title_() !== base.title || body() !== String(base.body || '');

    let saving = Promise.resolve();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const save = () => (saving = saving.then(async () => {
      clearTimeout(timer);
      if (!rw || !dirty()) return;
      const t = title_(), b = body();
      let why = '';
      if (!base) {
        const r = await app.create({ title: t, body: b, path: String(settings.get('newFolder') || '') });
        why = r.refused;
        base = r.note;
      } else if (t !== base.title) {
        why = await app.rename(base, t, { body: b });
        base = { ...base, title: t, body: b };
      } else {
        why = await app.edit(base, { body: b });
        base = { ...base, body: b };
      }
      p('.note-status').textContent = why;
      p('ion-title').textContent = titleOf(base);
      if (why) void toast(why);
    }));
    const typing = () => { clearTimeout(timer); timer = setTimeout(() => void save(), 1200); };
    titleBox.addEventListener('ionInput', typing);
    area.addEventListener('input', typing);
    titleBox.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') { e.preventDefault(); ed ? /** @type {any} */ (ed).view.focus() : area.focus(); } });
    page.addEventListener('ionViewWillLeave', () => void save());
    const hide = () => { if (document.visibilityState === 'hidden') void save(); };
    document.addEventListener('visibilitychange', hide);
    page.addEventListener('ionViewDidLeave', () => {
      if (!nav.contains(page)) { document.removeEventListener('visibilitychange', hide); if (openPage?.id === page.dataset.key) openPage = null; }
    });

    /** @param {string} target */
    const go = target => {
      const n = app.find(target);
      if (n) void openNote(n);
      else if (rw) void openNote(null, target);
      else void toast(`No note called “${target}”.`);
    };
    const showRead = (/** @type {boolean} */ on) => {
      read.hidden = !on; host.hidden = on;
      p('.toggle-read').setAttribute('aria-label', on ? 'Edit' : 'Read view');
      p('.toggle-read ion-icon').name = on ? 'create-outline' : 'eye-outline';
      if (on) reader?.show(body());
    };
    p('.toggle-read').addEventListener('click', () => showRead(read.hidden));
    p('.details').addEventListener('click', async () => { await save(); if (base) void details(base, () => base, n => { base = n; }); });

    // the live copy: another device's edit shows here while this page has nothing unsaved
    page.dataset.key = start?.id || 'new-' + Date.now();
    openPage = {
      id: page.dataset.key,
      refresh() {
        if (!base || dirty()) return;
        const now = app.notes().find(n => n.id === base?.id);
        if (!now) return;
        if (now.title === base.title && now.body === base.body) return;
        base = now;
        titleBox.value = now.title; p('ion-title').textContent = titleOf(now);
        if (ed) ed.set(String(now.body || '')); else area.value = String(now.body || '');
        if (!read.hidden) reader?.show(String(now.body || ''));
      },
    };

    await nav.push(page);
    if (!start && rw) setTimeout(() => titleBox.setFocus(), 50);
    // the editor (CodeMirror) and read view, loaded on first use; the plain box stays if they don't load
    try {
      const [{ createEditor }, { readView }] = await Promise.all([import('../src/editor/index.js'), import('../src/editor/read-view.js')]);
      reader = readView(read, go);
      const box = document.createElement('div');
      ed = createEditor({
        parent: box, text: area.value, label: 'Text', readOnly: !rw,
        options: { source: !!settings.get('sourceMode'), lineNumbers: !!settings.get('lineNumbers'), tickToBottom: !!settings.get('tickToBottom') },
        titles: () => app.notes().filter(n => n.id !== base?.id).map(n => ({ title: n.title, path: n.path })),
        onChange: () => typing(),
        onBlur: () => void save(),
        onLink: go,
      });
      area.replaceWith(box);
      document.documentElement.dataset.editor = 'ready';
    } catch (err) {
      console.warn('The editor did not load; using the plain text box.', err);
      document.documentElement.dataset.editor = 'failed';
    }
    if (!rw) showRead(true);
  }

  // ---- a note's details: a sheet with its folder, links, backlinks and Delete
  /** @param {Note} note @param {() => Note | null} now @param {(n: Note) => void} set */
  async function details(note, now, set) {
    const rw = canWrite();
    const links = (note.links || []).map(k => app.find(k)).filter(/** @returns {n is Note} */ n => !!n);
    const back = app.backlinks(note.id);
    const chips = (/** @type {Note[]} */ list) => list.length ? list.map(n => `<ion-chip data-open="${esc(n.id)}">${esc(titleOf(n))}</ion-chip>`).join('') : '<ion-note>None</ion-note>';
    const body = h(`<div class="ion-page">
      <ion-header><ion-toolbar><ion-title>${esc(titleOf(note))}</ion-title></ion-toolbar></ion-header>
      <ion-content class="ion-padding">
        <ion-list>
          <ion-item><ion-input label="Folder" label-placement="stacked" value="${esc(note.path || '')}" placeholder="None (the top)" ${rw ? '' : 'readonly'} class="d-folder"></ion-input></ion-item>
        </ion-list>
        <h3>Links</h3><div class="sheet-links">${chips(links)}</div>
        <h3>Linked from</h3><div class="sheet-links">${chips(back)}</div>
        ${rw ? '<ion-button expand="block" fill="outline" color="danger" class="d-delete ion-margin-top">Delete note</ion-button>' : ''}
      </ion-content>
    </div>`);
    const m = sheet(body, [0, 0.5, 1]);
    const folder = /** @type {any} */ (body.querySelector('.d-folder'));
    // the folder is kept when it is committed (Enter or leaving the box) or the sheet closes
    let moving = Promise.resolve();
    const move = () => (moving = moving.then(async () => {
      const cur = now() || note;
      const path = String(folder.value || '').trim().replace(/^\/+|\/+$/g, '');
      if (path === (cur.path || '')) return;
      const why = await app.edit(cur, { path });
      set({ ...cur, path });
      void toast(why || (path ? `Moved to ${path}` : 'Moved to the top'));
    }));
    folder.addEventListener('ionChange', () => void move());
    folder.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') void move(); });
    void m.onWillDismiss().then(() => move());
    body.addEventListener('click', async e => {
      const t = /** @type {HTMLElement} */ (e.target);
      const chip = /** @type {HTMLElement | null} */ (t.closest('[data-open]'));
      if (chip) { const n = app.notes().find(x => x.id === chip.dataset.open); await m.dismiss(); if (n) void openNote(n); return; }
      if (t.closest('.d-delete')) {
        const cur = now() || note;
        if (!(await confirmAlert('Delete this note?', `“${titleOf(cur)}” leaves every device.`, 'Delete'))) return;
        await m.dismiss();
        await app.remove(cur);
        await nav.pop();
        void toast('Deleted');
      }
    });
  }

  // ---- settings: a sheet with the look, the options this trial covers, the folders, the account and Sign out
  const SWITCHES = /** @type {const} */ ([
    ['bigRows', 'Bigger rows', 'This device'],
    ['itemCount', 'Show the number of notes', 'Every device'],
    ['sourceMode', 'Show Markdown as written', 'This device'],
    ['lineNumbers', 'Line numbers', 'This device'],
    ['readableWidth', 'Keep text to a readable width', 'This device'],
    ['tickToBottom', 'Move ticked to-dos to the bottom', 'This device'],
  ]);
  async function openSettings() {
    await menu.close?.();
    const theme = themeChoice();
    const body = h(`<div class="ion-page">
      <ion-header><ion-toolbar><ion-title>Settings</ion-title></ion-toolbar></ion-header>
      <ion-content class="ion-padding" id="settings">
        <ion-segment value="${theme}" class="s-theme" aria-label="Look">
          <ion-segment-button value="auto"><ion-label>Auto</ion-label></ion-segment-button>
          <ion-segment-button value="light"><ion-label>Light</ion-label></ion-segment-button>
          <ion-segment-button value="dark"><ion-label>Dark</ion-label></ion-segment-button>
        </ion-segment>
        <ion-list>
          ${SWITCHES.map(([k, label, scope]) => `<ion-item><ion-toggle data-opt="${k}" ${settings.get(k) ? 'checked' : ''}><ion-label>${label}<p>${scope}</p></ion-label></ion-toggle></ion-item>`).join('')}
          <ion-item><ion-input data-text="dailyFolder" label="Folder for today’s note" label-placement="stacked" placeholder="None (the top)" value="${esc(settings.get('dailyFolder') || '')}"></ion-input></ion-item>
          <ion-item><ion-input data-text="newFolder" label="Folder for new notes" label-placement="stacked" placeholder="None (the top)" value="${esc(settings.get('newFolder') || '')}"></ion-input></ion-item>
        </ion-list>
        <ion-list>
          <ion-item><ion-label>Signed in as<p id="who">${esc(signedInAs)}</p></ion-label></ion-item>
          <ion-item href="../" detail="true"><ion-label>Classic version<p>Attachments, import and export, Drive, the bin, sharing and more</p></ion-label></ion-item>
        </ion-list>
        <ion-button id="sign-out" expand="block" fill="outline" color="danger">Sign out</ion-button>
      </ion-content>
    </div>`);
    const m = sheet(body, [0, 0.6, 1]);
    body.querySelector('.s-theme')?.addEventListener('ionChange', e => {
      const v = String(/** @type {any} */ (e).detail.value);
      try { if (v === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch { /* private mode: this page only */ }
      applyTheme(/** @type {any} */ (v));
    });
    body.addEventListener('ionChange', async e => {
      const t = /** @type {any} */ (e.target);
      if (t.dataset.opt) await settings.set(t.dataset.opt, !!t.checked);
      else if (t.dataset.text) await settings.set(t.dataset.text, String(t.value || ''));
      drawList();
    });
    body.querySelector('#sign-out')?.addEventListener('click', async () => {
      await m.dismiss();
      await nav.popToRoot();
      const unsent = await app.signOut();
      $('sign-out-msg').textContent = unsent
        ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
        : 'Signed out. The list is kept on this device for your next sign-in.';
    });
  }

  // ---- the app's state and notes
  let signedInAs = '';
  let rooted = false;
  app.follow({
    onState(s) {
      signedInAs = s.user?.email || '';
      if (s.user) $('sign-out-msg').textContent = '';
      if (s.phase === 'no-access') $('uid').textContent = s.user?.uid || '';
      if (s.phase === 'ready') {
        drawSpaces(s);
        if (!rooted) { rooted = true; drawList(); drawMenu(); void nav.setRoot(listPage); }
      } else if (rooted) { rooted = false; filter = null; void nav.setRoot(h('<div></div>')); }
      showGate(s.phase);
    },
    onList(items) {
      const stale = items.filter(n => known.get(n.id) !== textOf(n));
      const now = new Set(items.map(n => n.id));
      for (const id of known.keys()) if (!now.has(id)) { search.remove(id); known.delete(id); }
      for (const n of stale) known.set(n.id, textOf(n));
      search.feed(stale);
      if (rooted) { drawList(); drawMenu(); }
      openPage?.refresh();
      window.starter.ready = true;
    },
    onFiles() { /* attachments are the classic page's */ },
    onConflict(copy) { void toast(`Edited on two devices at once; your version is kept as “${copy.title}”.`); },
    onRemoved(name) { void toast(`You’re no longer in “${name}”; its notes are gone from this device.`); },
  });
  settings.watch('bigRows', () => drawList());
}
