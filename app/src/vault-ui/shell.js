// The Vault layout's shell (loaded once the list is up, only in that layout): the note page is the home screen. It
// adds the header over the note (the sidebar button, the title, the view and More buttons), the navigation pill at
// the bottom (Back, Forward, the quick switcher, a new tab, the tabs, the ribbon menu), the "No file is open" page,
// the start (the note open last, today's note, or nothing, as this device asks), the open tabs kept per space, the
// right sidebar (a swipe left on the note), the quick switcher, the command palette (Ctrl+P, a pull down on the note),
// the ribbon menu, the tabs sheet, and the Notes extras: the Classic layout's features, each back when this device turns it on (vault-ui/plugins.js).
// Every sheet and page over the note is a Back step (the app's transients), so Android Back closes it first; Back
// with none open goes to the note before, as the pill's Back does.
import { nextWorkday, uniqueTitle } from '../notes/model.js';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';
import { featureOn } from './plugins.js';
import { history as noteSteps, tabs as tabList } from './nav.js';
import { vaultState } from './state.js';
import { sideDrawer } from './drawer.js';
import { noteUi } from './note-ui.js';

/** @typedef {import('../notes/model.js').Note} Note */

/**
 * @param {string} id @param {string} label @param {string} icon @param {string} [cls]
 * @returns {HTMLButtonElement}
 */
const button = (id, label, icon, cls = 'vl-btn') => {
  const b = Object.assign(document.createElement('button'), { type: 'button', id, className: cls });
  b.setAttribute('aria-label', label);
  if (icon) b.append(glyph(icon));
  return b;
};
/** @param {string} tag @param {Record<string, string>} [props] @param {...(Node | string)} kids */
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

/**
 * @param {import('../cloud.js').Started} app
 * @param {ReturnType<typeof import('@core/ui').startGestures>} kit
 * @param {ReturnType<typeof import('../screens/list.js').listScreen>} list
 * @param {{ who: () => string }} o  who: the signed-in person's email (the Account page)
 */
export async function vaultShell(app, kit, list, { who }) {
  const { settings } = app;
  const html = document.documentElement;
  // (its styles: one file, fetched now; the page under it is blank until then, app.css's few lines)
  const css = el('link', { rel: 'stylesheet', href: 'vault.css' });
  const styled = new Promise(r => { css.addEventListener('load', r); css.addEventListener('error', r); setTimeout(r, 2000); });
  document.head.append(css);
  const page = await list.pageReady();
  await styled;
  const edit = /** @type {HTMLDialogElement} */ (document.getElementById('edit'));
  const form = /** @type {HTMLFormElement} */ (document.getElementById('edit-form'));
  const titleBox = /** @type {HTMLInputElement} */ (document.getElementById('edit-text'));
  // (the Classic page's Delete button: hidden here, and out of reach of Tab and screen readers too; the note menu's
  // Delete file asks first instead)
  const classicDelete = document.getElementById('edit-delete');
  if (classicDelete) { classicDelete.inert = true; classicDelete.setAttribute('aria-hidden', 'true'); classicDelete.tabIndex = -1; }
  /** @param {string} key */
  const on = key => featureOn('vault', k => settings.get(k), key);

  // ---- state: per space (the person's own notes, or a space they opened)
  let spaceId = list.space()?.id || '';
  let state = vaultState(localStorage, spaceId);
  let tabs = tabList(state.get());
  const steps = noteSteps();
  const save = () => { state.set({ tabs: tabs.list, active: tabs.active }); paint(); };
  const noteOf = (/** @type {string} */ id) => (id ? list.notes().find(n => n.id === id) : undefined);

  // ---- header
  const side = button('vl-side-btn', 'Open the sidebar', 'panelLeft', 'vl-circle');
  side.setAttribute('aria-controls', 'vl-left');
  side.setAttribute('aria-expanded', 'false');
  const title = button('vl-title', '', '', 'vl-title');
  title.removeAttribute('aria-label');
  const titleText = el('span', { className: 'vl-title-text' });
  title.append(titleText);
  const today = button('vl-today', 'Today’s note', 'calendar');
  const nextDay = button('vl-nextday', 'The next working day’s note', 'calendarArrowUp');
  const mode = button('vl-mode-btn', 'Reading view', 'bookOpen');
  const more = button('vl-more-btn', 'More options', 'ellipsisVertical');
  const pill = el('div', { id: 'vl-head-pill', className: 'vl-pill' }, today, nextDay, mode, more);
  const head = el('div', { id: 'vl-head' }, side, title, pill);
  // the "No file is open" page, in the note's place
  const emptyNew = el('button', { type: 'button', id: 'vl-empty-new', className: 'vl-empty-btn', textContent: 'Create new note' });
  const emptyGo = el('button', { type: 'button', id: 'vl-empty-go', className: 'vl-empty-btn', textContent: 'Go to file' });
  const emptyClose = el('button', { type: 'button', id: 'vl-empty-close', className: 'vl-empty-btn', textContent: 'Close' });
  const empty = el('div', { id: 'vl-empty' }, el('div', { className: 'vl-empty-in' }, el('h2', { className: 'vl-empty-title', textContent: 'No file is open' }), emptyNew, emptyGo, emptyClose));
  edit.prepend(head);
  edit.append(empty);
  // the navigation pill
  const back = button('vl-back', 'Back', 'chevronLeft');
  const fwd = button('vl-fwd', 'Forward', 'chevronRight');
  const search = button('vl-search', 'Quick switcher', 'search');
  const plus = button('vl-new', 'New tab', 'plus');
  const count = el('span', { className: 'vl-count' });
  const tabsBtn = button('vl-tabs', 'Open tabs', '');
  tabsBtn.append(count);
  const ribbon = button('vl-ribbon', 'Menu', 'menu');
  const nav = el('nav', { id: 'vl-nav', className: 'vl-pill' }, back, fwd, search, plus, tabsBtn, ribbon);
  nav.setAttribute('aria-label', 'Navigation');
  // (the palette's "Open settings", and the tests: a button for it, never shown)
  const settingsOpen = el('button', { type: 'button', id: 'vl-settings-open', textContent: 'Settings' });
  settingsOpen.hidden = true;
  document.body.append(nav, settingsOpen);
  // the note's form never closes the page (Enter in the title box would submit it)
  form.addEventListener('submit', e => e.preventDefault(), true);

  // ---- Back and Forward, the tabs count
  const paint = () => {
    for (const [b, ok] of /** @type {const} */ ([[back, steps.canBack()], [fwd, steps.canFwd()]])) {
      b.toggleAttribute('data-faint', !ok);
      b.setAttribute('aria-disabled', String(!ok));
    }
    const n = tabs.list.length;
    count.textContent = String(n);
    tabsBtn.setAttribute('aria-label', `Open tabs: ${n}`);
  };
  back.addEventListener('click', () => { if (steps.canBack()) history.back(); });
  fwd.addEventListener('click', () => { if (steps.canFwd()) history.forward(); });
  // (the keyboard up: the pill steps aside, and can't be tapped)
  const keyboard = () => { const up = html.classList.contains('ui-keyboard-open'); nav.inert = up; };
  new MutationObserver(keyboard).observe(html, { attributes: true, attributeFilter: ['class'] });
  keyboard();

  // ---- a Classic page shown over the note (a tab of the Tab bar, the Note list, Haiku): Back takes it away
  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let pageStep = null;
  /** @param {string} id  the tab's id (notes, folders, haiku) */
  const pageMode = id => {
    html.dataset.vlPage = id;
    pageStep ||= transients().open(() => { pageStep = null; delete html.dataset.vlPage; });
  };
  const leavePage = () => {
    delete html.dataset.vlPage;
    const s = pageStep;
    pageStep = null;
    return s?.close();
  };
  /** @param {string} id @param {string} at  the tab's page (#home, #haiku) */
  const showPage = (id, at) => { pageMode(id); kit.tabs?.go(at); };

  // (a dialog shown focuses its first button: not the header's, which would show a focus ring at every start)
  const unfocus = () => { if (head.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur(); };
  const showEdit = () => { if (!edit.open) { edit.show(); unfocus(); } };

  // ---- a note shown, or none (the empty page)
  /** @param {Note} note */
  const titled = note => { titleText.textContent = note.title || titleBox.value || 'Untitled'; };
  /** @param {Note} note @param {{ n: number, pushed: boolean }} step */
  list.pageLayout.onShow = (note, step) => {
    html.classList.remove('vl-blank');
    unfocus();
    if (html.dataset.vlPage) void leavePage();
    titled(note);
    if (note.id) {
      steps.visit(note.id, step.n, step.pushed);
      tabs.show(note.id);
      state.set({ last: note.id, recent: [note.id, ...state.get().recent.filter(x => x !== note.id)].slice(0, 20) });
    }
    save();
    syncMode();
    left?.redraw();
    right?.redraw();
    ui.shown();
  };
  list.pageLayout.onBlank = () => {
    html.classList.add('vl-blank');
    titleText.textContent = 'New tab';
    steps.clear();
    tabs.show('');
    // (the address no longer names the note, so a reload opens this page as it is, and Back from it is the browser's)
    history.replaceState({ ...history.state, note: '' }, '', location.pathname + location.search);
    save();
    right?.redraw();
    ui.blank();
  };
  list.pageLayout.onList = () => {
    const now = list.space()?.id || '';
    if (now !== spaceId) { spaceId = now; state = vaultState(localStorage, spaceId); tabs = tabList(state.get()); paint(); }
    // (the title box's words: a rename being saved has them before the page's note does)
    if (page.current()) titleText.textContent = titleBox.value.trim() || page.current()?.title || 'Untitled';
    left?.redraw();
    right?.redraw();
    ui.changed();
  };
  titleBox.addEventListener('input', () => { titleText.textContent = titleBox.value || 'Untitled'; });
  /** the empty page (its tab stays) */
  const toBlank = async () => {
    showEdit();
    await page.blank();
  };
  /** the tab showing closed: the tab before it shows, or the empty page */
  const closeTab = async () => {
    const next = noteOf(tabs.close());
    save();
    if (next) await page.open(next); else await toBlank();
  };
  /** a new note, made at once (through the write queue), in the folder for new notes (or the one given) */
  const create = async (path = String(settings.get('newFolder') || '')) => {
    if (!list.canWrite()) return;
    const { note, refused } = await app.create({ title: uniqueTitle(list.notes(), 'Untitled', path), path });
    if (refused) { list.toast(refused); return; }
    showEdit();
    await page.open(note);
  };
  const newTab = async () => { tabs.newTab(''); save(); await toBlank(); };
  /** a note of this name, made at once (through the write queue) in the folder for new notes @param {string} t */
  const createTitled = async t => {
    if (!list.canWrite()) { list.toast('This space is read-only.'); return; }
    const path = String(settings.get('newFolder') || '');
    const { note, refused } = await app.create({ title: uniqueTitle(list.notes(), t, path), path });
    if (refused) { list.toast(refused); return; }
    showEdit();
    await page.open(note);
  };
  plus.addEventListener('click', () => void newTab());
  emptyNew.addEventListener('click', () => void create());
  emptyGo.addEventListener('click', () => void switcher());
  emptyClose.addEventListener('click', () => void closeTab());
  search.addEventListener('click', () => void switcher());

  // ---- the quick switcher and the command palette (vault-ui/switcher.js, palette.js: loaded on first use); with the
  // Quick switcher plugin off, the Classic one
  /** @type {Promise<{ open: () => void, isOpen: () => boolean }> | undefined} */
  let switcherMade;
  const switcher = async () => {
    if (!on('pSwitcher')) { await list.pick.switcher(); return; }
    switcherMade ||= import('./switcher.js').then(m => m.quickSwitcher({
      notes: () => list.notes(), recent: () => state.get().recent, canWrite: () => list.canWrite(),
      open: async note => { showEdit(); await page.open(note); }, create: createTitled,
    })).catch(e => { switcherMade = undefined; throw e; });
    (await switcherMade).open();
  };
  /** @type {Promise<{ open: () => void, isOpen: () => boolean }> | undefined} */
  let paletteMade;
  const palette = async () => {
    if (!on('pPalette')) return;
    paletteMade ||= import('./palette.js').then(m => m.commandPalette({ ctx: cmdCtx, state: () => state }))
      .catch(e => { paletteMade = undefined; throw e; });
    (await paletteMade).open();
  };
  // (Ctrl/Cmd+O and +P: these, before the Classic list's own)
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || html.classList.contains('vl-off')) return;
    const k = e.key.toLowerCase();
    if (k !== 'o' && k !== 'p') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // (not over a drawer, a menu or Settings: only over the page, or the other of the two)
    const over = /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog:modal'));
    if (over && !over.classList.contains('vl-pick')) return;
    if (k === 'o') void switcher(); else void palette();
  }, true);

  // ---- the left sidebar: a drawer the note slides aside for (vault-ui/drawer.js), its views loaded the first time it
  // opens (vault-ui/left.js; warmed once the start is done)
  const pushed = () => [edit, nav, html.classList.contains('vl-tabbar') ? document.getElementById('tabbar') : null];
  /** @typedef {ReturnType<typeof import('./left.js').leftSidebar>} Left */
  /** @type {Left | null} */
  let left = null;
  /** @type {Promise<Left> | undefined} */
  let leftMade;
  const leftDrawer = sideDrawer({
    id: 'vl-left', label: 'Left sidebar', pushed,
    onOpen: () => { if (left) left.shown(); else void leftReady().then(l => l.shown()); },
    onChange: open => {
      side.replaceChildren(glyph(open ? 'panelLeftFilled' : 'panelLeft'));
      side.setAttribute('aria-expanded', String(open));
      side.setAttribute('aria-label', open ? 'Close the sidebar' : 'Open the sidebar');
      if (!open) left?.closed();
    },
  });
  /** (the note open, the drawer first: its Back step goes before the note's own) @param {Note} note */
  const openFromSide = async note => { await leftDrawer.leave(); showEdit(); await page.open(note); };
  const leftReady = () => (leftMade ||= import('./left.js').then(m => (left = m.leftSidebar({
    app, list, on, state: () => state, canWrite: () => list.canWrite(), current: () => page.current(), notes: () => list.notes(),
    open: openFromSide,
    openInNewTab: async note => { await leftDrawer.leave(); tabs.open(note.id); save(); showEdit(); await page.open(note); },
    openSettings: () => openSettings(),
    toast: (m, o) => list.toast(m, o),
    create: async path => { await leftDrawer.leave(); await create(path); },
    // a note about to go (deleted): off the page if it is open (its edits saved first), out of the tabs
    leave: async id => { if (page.current()?.id === id) await page.blank(); tabs.forget(id); save(); },
  }, leftDrawer))).catch(e => { leftMade = undefined; throw e; }));
  side.addEventListener('click', () => { if (leftDrawer.isOpen()) void leftDrawer.close(); else void leftReady().then(() => leftDrawer.open()); });
  // a swipe right on the note opens it; with the Notes extras' swipe back on, that swipe is the edge's (a third of the
  // screen) and the drawer's starts past it
  const backZone = () => (on('xSwipeBack') && on('xNoteList') ? Math.round(innerWidth * 0.3) : 0);
  let touchX = 0;
  edit.addEventListener('touchstart', e => { touchX = e.touches[0]?.clientX ?? 0; }, { capture: true, passive: true });
  leftDrawer.swipeFrom(edit, {
    can: () => !html.dataset.vlPage && !document.querySelector('dialog:modal'),
    edge: () => backZone() || leftDrawer.EDGE,
  });

  // ---- the right sidebar: a drawer from the right (a swipe left on the note, the palette), its panes loaded the first
  // time it opens (vault-ui/right.js)
  /** @typedef {ReturnType<typeof import('./right.js').rightSidebar>} Right */
  /** @type {Right | null} */
  let right = null;
  /** @type {Promise<Right> | undefined} */
  let rightMade;
  const rightDrawer = sideDrawer({
    id: 'vl-right', label: 'Right sidebar', side: 'right', pushed,
    onOpen: () => { if (right) right.shown(); else void rightReady().then(r => r.shown()); },
    onChange: open => { if (!open) right?.closed(); },
  });
  const bodyText = () => /** @type {HTMLTextAreaElement | null} */ (document.getElementById('edit-body'))?.value || '';
  const rightReady = () => (rightMade ||= import('./right.js').then(m => (right = m.rightSidebar({
    list, page, on, state: () => state, notes: () => list.notes(), current: () => page.current(), body: bodyText,
    canWrite: () => list.canWrite(), toast: msg => list.toast(msg),
    open: async (note, line) => { showEdit(); await ui.openAt(note, line); },
    openTitle: createTitledOrOpen, daily: iso => list.daily(iso),
  }, rightDrawer))).catch(e => { rightMade = undefined; throw e; }));
  /** the right sidebar open (at a pane) @param {string} [view] */
  const openRight = async view => {
    const r = await rightReady();
    if (view) r.show(view);
    if (!rightDrawer.isOpen()) await rightDrawer.open();
  };
  /** a link's note: the one it names, else made (through the write queue) @param {string} t */
  const createTitledOrOpen = async t => {
    const have = list.notes().find(n => !n._deleted && n.title.toLowerCase() === t.toLowerCase());
    if (have) { showEdit(); await page.open(have); return; }
    await createTitled(t);
  };
  rightDrawer.swipeFrom(edit, {
    can: () => !html.dataset.vlPage && !document.querySelector('dialog:modal') && ['pBacklinks', 'pOutgoing', 'pOutline', 'pDaily'].some(on),
  });

  // ---- the read view and the editing view
  const editMode = /** @type {HTMLButtonElement} */ (document.getElementById('edit-mode'));
  const syncMode = () => {
    const reading = page.reading();
    mode.replaceChildren(glyph(reading ? 'pencilLine' : 'bookOpen'));
    mode.setAttribute('aria-label', reading ? 'Editing view' : 'Reading view');
    mode.setAttribute('aria-pressed', String(reading));
    mode.hidden = !page.current() && !document.getElementById('edit-text')?.matches(':focus');
  };
  new MutationObserver(syncMode).observe(editMode, { attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
  mode.addEventListener('click', () => { page.toggleRead(); syncMode(); });

  // ---- the note page's own parts (vault-ui/note-ui.js): the title renamed in place, the note menu, Find, the mobile
  // toolbar and the Linked mentions
  const ui = noteUi({
    list, page, settings, on, state: () => state, syncMode, closeTab, title, titleText,
    ctx: () => leftReady().then(l => l.ctx),
  });
  more.addEventListener('click', () => void ui.menu());

  /** @type {Promise<{ open: () => void, close: () => Promise<void> }> | undefined} */
  let hostMade;
  const openSettings = async () => {
    hostMade ||= import('./settings.js').then(m => m.settingsHost(app, { list, haiku: () => acts.page('haiku') }));
    (await hostMade).open();
    const w = document.getElementById('who');
    if (w) w.textContent = who();
    list.modules();
  };
  settingsOpen.addEventListener('click', () => void openSettings());
  // ---- the commands (the palette's, the ribbon's): each runs what the app already does elsewhere
  /** a daily note: today's (step 0), else the one before or after the daily note open (or today), as there are */
  const dailyStep = async (/** @type {0 | -1 | 1} */ step) => {
    if (!step) { if (list.canWrite()) { showEdit(); await list.daily(); } return; }
    const m = await import('./month.js');
    const open = page.current();
    const from = (open && m.dayOf(open)) || (await import('../notes/model.js')).isoDay();
    const next = m.nearestDaily(list.notes(), from, step);
    if (next) { showEdit(); await page.open(next); } else list.toast(step < 0 ? 'No earlier daily note.' : 'No later daily note.');
  };
  const randomNote = async () => {
    const all = list.notes().filter(n => !n._deleted && n.id !== page.current()?.id);
    if (!all.length) { list.toast('No other notes.'); return; }
    showEdit();
    await page.open(all[Math.floor(Math.random() * all.length)]);
  };
  /** the left sidebar open at a view @param {string} key */
  const leftView = async key => { const l = await leftReady(); if (!leftDrawer.isOpen()) await leftDrawer.open(); await l.show(key); };
  /** a file action of the left sidebar's menu on the note open @param {'rename' | 'move' | 'remove'} what */
  const fileAct = async what => {
    const note = page.current();
    if (!note) return;
    const [l, fm] = await Promise.all([leftReady(), import('./file-menu.js')]);
    await fm[what](l.ctx, note);
  };
  const noteOpen = () => page.current();
  /** @type {import('./commands.js').Actions} */
  const acts = {
    switcher: () => switcher(), palette: () => palette(), daily: dailyStep, create: () => create(),
    toggleRead: () => { page.toggleRead(); syncMode(); }, toggleEditMode: () => ui.toggleEditMode(),
    leftView, reveal: async () => { await leftView('files'); /** @type {HTMLElement | null} */ (document.getElementById('vl-files-reveal'))?.click(); },
    bookmark: async () => { const n = noteOpen(); if (n) (await leftReady()).ctx.bookmark(n.id); },
    right: view => openRight(view), toggleMentions: () => ui.toggleMentions(), random: randomNote,
    rename: () => fileAct('rename'), move: () => fileAct('move'), remove: () => fileAct('remove'),
    copyPath: async () => {
      const n = noteOpen();
      if (!n) return;
      const [{ copyText }, { cleanPath }] = await Promise.all([import('@core/ui'), import('./tree.js')]);
      const path = cleanPath(n.path);
      await copyText(`${path ? `${path}/` : ''}${n.title || 'Untitled'}.md`, { toasts: { show: (/** @type {string} */ t) => list.toast(t) } });
    },
    find: () => ui.find(), closeTab: () => closeTab(), newTab: () => newTab(), tabs: () => openTabs(),
    settings: () => openSettings(), sync: () => syncBtn.click(),
    page: key => (key === 'haiku' ? showPage('haiku', '#haiku') : showPage('notes', '#home')),
    bin: () => list.openBin(),
    select: () => {
      showPage('notes', '#home');
      requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('#select:not([hidden])'))?.click());
    },
  };
  /** @returns {import('./commands.js').CmdCtx} */
  const cmdCtx = () => ({
    on, canWrite: () => list.canWrite(), note: noteOpen, admin: () => list.role() === 'admin', binOn: () => list.on('binScreen'), act: acts,
  });

  // ---- the ribbon menu and the open tabs (vault-ui/ribbon.js, tabs-sheet.js: loaded on first use)
  /** @type {Promise<{ open: () => void }> | undefined} */
  let ribbonMade;
  ribbon.addEventListener('click', async () => {
    ribbonMade ||= import('./ribbon.js').then(m => m.ribbonMenu(cmdCtx)).catch(e => { ribbonMade = undefined; throw e; });
    (await ribbonMade).open();
  });
  /** tab i shown @param {number} i */
  const showTab = async i => {
    tabs.activate(i); save();
    const note = noteOf(tabs.current());
    showEdit();
    await (note ? page.open(note) : toBlank());
  };
  /** @type {Promise<{ open: () => void }> | undefined} */
  let tabsMade;
  const openTabs = async () => {
    tabsMade ||= import('./tabs-sheet.js').then(m => m.tabsSheet({
      tabs: () => tabs.list, active: () => tabs.active, noteOf,
      show: i => showTab(i), newTab: () => newTab(),
      close: async i => {
        const was = tabs.current(), at = tabs.active;
        const now = tabs.close(i);
        save();
        // (the one showing closed: the page follows)
        if (i === at || now !== was) { const n = noteOf(now); showEdit(); await (n ? page.open(n) : toBlank()); }
      },
      closeAll: async () => { tabs.closeAll(); save(); await toBlank(); },
    })).catch(e => { tabsMade = undefined; throw e; });
    (await tabsMade).open();
  };
  tabsBtn.addEventListener('click', () => void openTabs());


  // ---- the Notes extras
  const tabbar = /** @type {HTMLElement} */ (document.getElementById('tabbar'));
  // (a tab opens its Classic page over the note; Settings opens this layout's own)
  tabbar.addEventListener('click', e => {
    const b = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-tab-id]'));
    if (!b) return;
    if (b.dataset.tabId === 'settings') { e.preventDefault(); e.stopImmediatePropagation(); void openSettings(); return; }
    pageMode(String(b.dataset.tabId));
  }, true);
  // swipe back from a note: the note list (with the Note list on)
  list.pageLayout.swipeOn = () => on('xSwipeBack') && on('xNoteList') && touchX < backZone();
  list.pageLayout.swipeBack = () => { showPage('notes', '#home'); return true; };
  const syncBtn = /** @type {HTMLElement} */ (document.getElementById('sync-btn'));
  const syncHome = /** @type {{ parent: Node | null, next: Node | null }} */ ({ parent: syncBtn.parentNode, next: syncBtn.nextSibling });
  const extras = () => {
    html.classList.toggle('vl-tabbar', on('xTabBar'));
    if (on('xSwipeTabs') && on('xTabBar')) delete tabbar.dataset.swipe; else tabbar.dataset.swipe = 'off';
    html.classList.toggle('vl-details', on('xDetails'));
    html.classList.toggle('vl-spacing', on('xLineSpacing'));
    html.classList.toggle('vl-inline-title', !!settings.get('vInlineTitle'));
    const days = on('xDayButtons') && list.canWrite();
    today.hidden = !days; nextDay.hidden = !days;
    if (on('xSyncButton')) { if (syncBtn.parentNode !== pill) pill.prepend(syncBtn); }
    else if (syncBtn.parentNode === pill) syncHome.parent?.insertBefore(syncBtn, syncHome.next);
    if (!on('xTabBar') && html.dataset.vlPage) void leavePage();
    ui.options();
  };
  today.addEventListener('click', () => void list.daily());
  nextDay.addEventListener('click', () => void list.daily(nextWorkday()));
  settings.watch(null, extras);
  extras();

  // ---- the start: the note the address names (a reload, a link), else as this device asks
  page.drawn();
  window.starter.vault = {
    /** a note opened by its title (tools/shot.mjs) @param {string} t */
    open: async t => { const note = list.notes().find(n => n.title === t); if (note) await page.open(note); return !!note; },
    /** the right sidebar at a pane, the switcher, the palette (tools/shot.mjs) @param {string} [view] */
    right: view => openRight(view),
    switcher: () => switcher(),
    palette: () => palette(),
  };
  // (a note the address named may be open already, shown before the shell was here)
  const opened = page.current();
  if (opened) list.pageLayout.onShow?.(opened, { n: Number(history.state?.n) || 1, pushed: false });
  if (!page.current()) {
    const start = settings.get('vStartFile');
    const saved = state.get();
    const last = saved.tabs.length ? tabs.current() : saved.last;
    const daily = (start === 'daily' || !!settings.get('vDailyOnStart')) && on('pDaily') && list.canWrite();
    if (daily) await list.daily();
    else if (start === 'last' && noteOf(last)) await page.open(/** @type {Note} */ (noteOf(last)));
    if (!page.current()) await toBlank();
  }
  paint();
  syncMode();
  // ---- a pull down on the note: the command palette (vault-ui/pull.js)
  void import('./pull.js').then(m => m.pullDown({
    scroller: () => document.getElementById('edit-scroll'), host: edit, run: () => palette(),
    can: () => on('pPalette') && settings.get('vPull') !== false && !html.dataset.vlPage && !document.querySelector('dialog:modal') && !html.classList.contains('ui-keyboard-open'),
  })).catch(() => { /* offline before it loaded: no pull */ });
  // (the sidebars' code, ready for the first swipe)
  const idle = window.requestIdleCallback || (/** @type {(f: () => void) => number} */ f => setTimeout(f, 1500));
  idle(() => void leftReady().catch(() => { /* offline before it loaded: tried again on the first open */ }));
  idle(() => void rightReady().catch(() => { /* the same */ }));
}
