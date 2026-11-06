// The Vault layout's left sidebar's insides: the kit's sidebar (app-ui ui/vault/sidebar.js, made by shell.js: the
// drawer, one view at a time, the view's tools and the view picker pill at the bottom) holds Notes' views (Files,
// Search, Tags, Bookmarks, and Notes when the Note list extra is on), each loaded the first time it shows, and in its
// footer the space row: the space's name (tap: switch spaces), how many files and folders it has, and the Settings
// gear. The view shown is kept per space (vault-ui/state.js).
import { claim, haptic } from '@core/ui';
import { glyph } from './icons.js';
import { buildTree, stillEmpty } from './tree.js';

/** @typedef {import('../notes/model.js').Note} Note */
/**
 * @typedef {{ el: HTMLElement, tools: HTMLElement[], redraw: () => void, shown?: () => void, run?: (q: string) => void }} View
 * @typedef {{
 *   app: import('../cloud.js').Started, list: ReturnType<typeof import('../screens/list.js').listScreen>,
 *   state: () => ReturnType<typeof import('./state.js').vaultState>, on: (key: string) => boolean, canWrite: () => boolean,
 *   current: () => Note | null, notes: () => Note[], open: (note: Note) => Promise<void>, openInNewTab: (note: Note) => Promise<void>,
 *   openSettings: () => unknown, toast: (msg: string, o?: { action?: { label: string, run: () => void } }) => unknown,
 *   searchFor: (q: string) => void, redraw: () => void, closeDrawer: () => Promise<void>, isOpen: () => boolean,
 *   bookmarked: (id: string) => boolean, bookmark: (id: string, on?: boolean) => void, extraFolders: () => string[],
 *   tool: (id: string, label: string, icon: string, run: () => unknown) => HTMLButtonElement, menu: () => Promise<typeof import('./file-menu.js')>,
 *   create: (path: string) => Promise<void>, leave: (id: string) => Promise<void>,
 *   hold: (box: HTMLElement, held: (row: HTMLElement) => void) => void,
 * }} Ctx
 */

/** each view's code, loaded the first time it shows (the views' names, icons and plugins: shell.js, LEFT_VIEWS)
 * @type {Record<string, (ctx: Ctx) => Promise<View>>} */
const MAKERS = {
  files: ctx => import('./files.js').then(m => m.filesView(ctx)),
  search: ctx => import('./search-view.js').then(m => m.searchView(ctx)),
  tags: ctx => import('./tags.js').then(m => m.tagsView(ctx)),
  bookmarks: ctx => import('./bookmarks.js').then(m => m.bookmarksView(ctx)),
  notes: ctx => import('./notes-view.js').then(m => m.notesView(ctx)),
};

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

const HOLD_MS = 500;   // a press this long is a long-press (the row's menu)
const HOLD_SLOP = 10;  // px a finger may wander and still be holding
/**
 * A long-press or right-click on a row ([data-row]) in the box: its menu. The kit's holdMenus leaves dialogs alone (the
 * drawer is one), so the drawer has its own: a press held still for HOLD_MS (the arbiter's 'hold', so a swipe that
 * started first keeps the touch), a buzz, and the tap that ends it swallowed.
 * @param {HTMLElement} box @param {(row: HTMLElement) => void} held
 */
const holdRows = (box, held) => {
  /** @type {{ timer: ReturnType<typeof setTimeout>, x: number, y: number, id: number } | null} */
  let p = null;
  let holding = false;   // a long-press opened the menu; the finger is still down
  let liftAt = 0;        // when that finger came up (the click it makes is the menu's)
  const stop = () => { if (p) clearTimeout(p.timer); p = null; };
  box.addEventListener('pointerdown', e => {
    stop();
    if (e.button !== 0 || e.pointerType === 'mouse') return;
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-row]'));
    if (!row || !box.contains(row)) return;
    p = { x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => {
      p = null;
      if (!claim('hold')) return;
      haptic('long');
      holding = true;
      held(row);
    }, HOLD_MS) };
  });
  box.addEventListener('pointermove', e => { if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP) stop(); });
  for (const t of ['pointerup', 'pointercancel']) box.addEventListener(t, stop, true);
  document.addEventListener('ui-gesture-captured', e => { if (/** @type {CustomEvent} */ (e).detail?.name !== 'hold') stop(); });
  for (const t of ['pointerup', 'pointercancel', 'touchend']) document.addEventListener(t, () => { if (holding) { holding = false; liftAt = Date.now(); } }, true);
  // (the click that ends a long-press, wherever it lands (the menu's shade, by then), and a touch's own context menu,
  // are the menu's)
  document.addEventListener('click', e => { if (holding || Date.now() - liftAt < 350) { liftAt = 0; e.preventDefault(); e.stopPropagation(); } }, true);
  box.addEventListener('contextmenu', e => {
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('[data-row]'));
    if (!row || !box.contains(row)) return;
    e.preventDefault();
    if (holding || p || Date.now() - liftAt < 350) return;   // (a touch's long-press: the timer's)
    held(row);
  });
};

/**
 * @param {Omit<Ctx, 'searchFor' | 'redraw' | 'tool' | 'menu' | 'bookmarked' | 'bookmark' | 'extraFolders' | 'closeDrawer' | 'isOpen' | 'hold'>} base
 * @param {import('app-ui/ui/vault/sidebar.js').Sidebar} side  the kit's sidebar this fills (shell.js made it: the drawer, the
 *   view picker); its views are drawn by render() here, its footer gets the space row
 */
export function leftSidebar(base, side) {
  const d = side.el;
  const spaceName = el('span', { className: 'vl-space-name' });
  const spaceCount = el('span', { className: 'vl-space-count' });
  const space = el('button', { type: 'button', id: 'vl-space', className: 'vl-space' }, el('span', { className: 'vl-space-top' }, spaceName, glyph('chevronDown', 'vl-space-chev')), spaceCount);
  space.setAttribute('aria-haspopup', 'dialog');
  const gear = el('button', { type: 'button', id: 'vl-gear', className: 'vl-gear' }, glyph('settings'));
  gear.setAttribute('aria-label', 'Settings');
  side.foot.append(el('div', { className: 'vl-vault-row' }, space, gear));

  /** @type {Map<string, View>} */
  const ready = new Map();
  let showing = '';

  /** @type {Ctx} */
  const ctx = {
    ...base,
    closeDrawer: () => side.close(),
    isOpen: () => side.isOpen(),
    redraw: () => redraw(),
    searchFor: q => { void show('search').then(() => ready.get('search')?.run?.(q)); },
    bookmarked: id => base.state().get().bookmarks.includes(id),
    bookmark(id, on) {
      const now = base.state().get().bookmarks;
      const want = on ?? !now.includes(id);
      base.state().set({ bookmarks: want ? [...now.filter(x => x !== id), id] : now.filter(x => x !== id) });
      redraw();
    },
    extraFolders: () => {
      // (a folder made here that now holds a note is shown by the note: no longer kept)
      const kept = base.state().get().folders;
      const still = stillEmpty(kept, base.notes());
      if (still.length !== kept.length) base.state().set({ folders: still });
      return still;
    },
    tool(id, label, icon, run) {
      const b = el('button', { type: 'button', id, className: 'vl-tool' }, glyph(icon));
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => void run());
      return b;
    },
    menu: () => import('./file-menu.js'),
    hold: holdRows,
    // (a toast while the drawer is open shows in it: the page under a modal dialog can't be reached, its Undo neither)
    toast(msg, o) {
      const host = document.getElementById('toasts');
      if (host && side.isOpen() && host.parentNode !== d) { home ||= { parent: host.parentNode, next: host.nextSibling }; d.append(host); }
      return base.toast(msg, o);
    },
  };
  /** @type {{ parent: Node | null, next: Node | null } | null} where the toasts live when the drawer is shut */
  let home = null;
  const toastsHome = () => {
    const host = document.getElementById('toasts');
    if (host && home && host.parentNode === d) home.parent?.insertBefore(host, home.next);
  };

  /** a view drawn for the sidebar (its first showing) @param {string} key @returns {Promise<import('app-ui/ui/vault/sidebar.js').SidebarView>} */
  const render = async key => {
    const make = MAKERS[key];
    if (!make) throw new Error(`no view ${key}`);
    const v = await make(ctx);
    v.el.classList.add('vl-view');
    ready.set(key, v);
    return {
      el: v.el, tools: v.tools,
      // (shown, or the sidebar opened on it: kept as this space's choice, drawn for the notes now)
      shown: () => {
        showing = key;
        if (base.state().get().leftView !== key) base.state().set({ leftView: key });
        v.redraw();
        v.shown?.();
      },
    };
  };
  /** show a view (kept as this space's choice) @param {string} key */
  const show = async key => { await side.show(key); return ready.get(key) || null; };

  // ---- the space row: the name, its counts; the switcher; Settings
  const paintSpace = () => {
    const sp = base.list.space();
    spaceName.textContent = sp && sp.id !== base.app.vault() ? sp.name || 'Space' : 'My notes';
    const t = buildTree(base.notes(), ctx.extraFolders());
    const files = `${t.files.toLocaleString()} ${t.files === 1 ? 'file' : 'files'}`;
    const folders = `${t.folders.toLocaleString()} ${t.folders === 1 ? 'folder' : 'folders'}`;
    spaceCount.textContent = `${files}, ${folders}`;
  };
  /** @type {Promise<{ open: () => void }> | undefined} */
  let switcher;
  space.addEventListener('click', async () => {
    switcher ||= import('./spaces-switch.js').then(m => m.spacesSwitch(base));
    (await switcher).open();
  });
  gear.addEventListener('click', () => void base.openSettings());
  paintSpace();

  let queued = 0;
  /** everything the notes show, again (at most once a frame) */
  const redraw = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      paintSpace();
      // (a view came or went, or another is wanted: the sidebar picks again; else the one showing draws again)
      if (side.current() !== showing) side.refresh(); else ready.get(showing)?.redraw();
    });
  };

  return {
    ctx,
    render,
    /** the drawer is opening */
    opened() { paintSpace(); },
    /** the drawer has shut */
    closed() { toastsHome(); },
    redraw,
    /** a view by key (the e2e and other sheets) @param {string} key */
    show,
  };
}
