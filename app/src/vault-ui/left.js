// The Vault layout's left sidebar, inside the drawer (drawer.js): one view at a time (Files, Search, Tags, Bookmarks,
// and Notes when the Note list extra is on), each loaded the first time it shows; at the bottom the view's tools, the
// view picker pill (its card of views rises from it), and the space row: the space's name (tap: switch spaces), how many
// files and folders it has, and the Settings gear. The view shown is kept per space (vault-ui/state.js).
import { claim, glide, haptic, still } from '@core/ui';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';
import { buildTree, stillEmpty } from './tree.js';

/** @typedef {import('../notes/model.js').Note} Note */
/**
 * @typedef {{ el: HTMLElement, tools: HTMLElement[], redraw: () => void, shown?: () => void, run?: (q: string) => void }} View
 * @typedef {{ key: string, label: string, icon: string, plugin: string, make: (ctx: Ctx) => Promise<View> }} ViewDef
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

/** @type {ViewDef[]} */
const VIEWS = [
  { key: 'files', label: 'Files', icon: 'folder', plugin: 'pFiles', make: ctx => import('./files.js').then(m => m.filesView(ctx)) },
  { key: 'search', label: 'Search', icon: 'search', plugin: 'pSearch', make: ctx => import('./search-view.js').then(m => m.searchView(ctx)) },
  { key: 'tags', label: 'Tags', icon: 'tags', plugin: 'pTags', make: ctx => import('./tags.js').then(m => m.tagsView(ctx)) },
  { key: 'bookmarks', label: 'Bookmarks', icon: 'bookmark', plugin: 'pBookmarks', make: ctx => import('./bookmarks.js').then(m => m.bookmarksView(ctx)) },
  { key: 'notes', label: 'Notes', icon: 'list', plugin: 'xNoteList', make: ctx => import('./notes-view.js').then(m => m.notesView(ctx)) },
];

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
 * @param {ReturnType<typeof import('./drawer.js').sideDrawer>} drawer
 */
export function leftSidebar(base, drawer) {
  const d = drawer.el;
  const views = el('div', { className: 'vl-views' });
  const tools = el('div', { className: 'vl-tools' });
  tools.setAttribute('role', 'toolbar');
  const pillIcon = el('span', { className: 'vl-pill-icon' });
  const pillLabel = el('span', { className: 'vl-pill-label' });
  const pill = el('button', { type: 'button', id: 'vl-view-pill', className: 'vl-view-pill' }, pillIcon, pillLabel, glyph('chevronsUpDown', 'vl-pill-chev'));
  pill.setAttribute('aria-haspopup', 'menu');
  pill.setAttribute('aria-expanded', 'false');
  const card = el('div', { id: 'vl-view-menu', className: 'vl-view-card', hidden: true });
  card.setAttribute('role', 'menu');
  card.setAttribute('aria-label', 'Views');
  const spaceName = el('span', { className: 'vl-space-name' });
  const spaceCount = el('span', { className: 'vl-space-count' });
  const space = el('button', { type: 'button', id: 'vl-space', className: 'vl-space' }, el('span', { className: 'vl-space-top' }, spaceName, glyph('chevronDown', 'vl-space-chev')), spaceCount);
  space.setAttribute('aria-haspopup', 'dialog');
  const gear = el('button', { type: 'button', id: 'vl-gear', className: 'vl-gear' }, glyph('settings'));
  gear.setAttribute('aria-label', 'Settings');
  const foot = el('div', { className: 'vl-left-foot' }, tools, el('div', { className: 'vl-pill-wrap' }, pill, card), el('div', { className: 'vl-vault-row' }, space, gear));
  d.append(el('div', { className: 'vl-left-in' }, views, foot));

  /** @type {Map<string, Promise<View>>} */
  const made = new Map();
  /** @type {Map<string, View>} */
  const ready = new Map();
  const available = () => VIEWS.filter(v => base.on(v.plugin));
  /** the view to show: the one kept, if it is on, else the first that is */
  const current = () => {
    const want = base.state().get().leftView;
    const on = available();
    return on.find(v => v.key === want) || on[0] || null;
  };

  /** @type {Ctx} */
  const ctx = {
    ...base,
    closeDrawer: () => drawer.close(),
    isOpen: () => drawer.isOpen(),
    redraw: () => redraw(),
    searchFor: q => { void show('search').then(v => v?.run?.(q)); },
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
      if (host && drawer.isOpen() && host.parentNode !== d) { home ||= { parent: host.parentNode, next: host.nextSibling }; d.append(host); }
      return base.toast(msg, o);
    },
  };
  /** @type {{ parent: Node | null, next: Node | null } | null} where the toasts live when the drawer is shut */
  let home = null;
  const toastsHome = () => {
    const host = document.getElementById('toasts');
    if (host && home && host.parentNode === d) home.parent?.insertBefore(host, home.next);
  };

  /** @param {ViewDef} def */
  const make = def => {
    let p = made.get(def.key);
    if (!p) {
      p = def.make(ctx).then(v => {
        v.el.classList.add('vl-view');
        v.el.hidden = true;
        views.append(v.el);
        ready.set(def.key, v);
        return v;
      });
      made.set(def.key, p);
      p.catch(() => made.delete(def.key));
    }
    return p;
  };
  let showing = '';
  /** show a view (kept as this space's choice) @param {string} key */
  const show = async key => {
    const def = VIEWS.find(v => v.key === key && base.on(v.plugin));
    if (!def) return null;
    if (base.state().get().leftView !== key) base.state().set({ leftView: key });
    const v = await make(def);
    if (current()?.key !== key) return v;   // (another was picked while it loaded)
    showing = key;
    for (const [k, other] of ready) other.el.hidden = k !== key;
    tools.replaceChildren(...v.tools);
    tools.hidden = !v.tools.length;
    tools.setAttribute('aria-label', `${def.label} tools`);
    pillIcon.replaceChildren(glyph(def.icon));
    pillLabel.textContent = def.label;
    pill.setAttribute('aria-label', `View: ${def.label}. Change view`);
    v.redraw();
    v.shown?.();
    return v;
  };

  // ---- the view picker: a card that rises from the pill (Back, Esc or a tap elsewhere closes it)
  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let cardStep = null;
  const fillCard = () => {
    const now = current();
    card.replaceChildren(...available().map(def => {
      const b = el('button', { type: 'button', className: 'vl-view-row', id: `vl-view-${def.key}` }, glyph(def.icon), el('span', { textContent: def.label }));
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(def.key === now?.key));
      b.addEventListener('click', () => { void closeCard().then(() => show(def.key)); });
      return b;
    }));
    // (the pill shows faint under the list, as it stays in place)
    const ghost = el('div', { className: 'vl-view-ghost' }, glyph(now?.icon || 'folder'), el('span', { textContent: now?.label || '' }), glyph('chevronsUpDown', 'vl-pill-chev'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.dataset.faint = '';
    card.append(ghost);
  };
  const openCard = () => {
    fillCard();
    card.hidden = false;
    pill.setAttribute('aria-expanded', 'true');
    // (it rises from the pill: a short spring, scale and fade; a fade only with reduced motion)
    const calm = still();
    const g = glide([[card, k => ({ opacity: String(k), transform: calm ? 'none' : `translateY(${(1 - k) * 12}px) scale(${0.96 + 0.04 * k})` })]], 0, 1, 0, { response: 0.12 });
    void g.done.then(() => { card.style.opacity = ''; card.style.transform = ''; g.stop(); });
    cardStep = transients().open(() => { cardStep = null; hideCard(); });
    /** @type {HTMLElement | null} */ (card.querySelector('[aria-checked=true]') || card.querySelector('button'))?.focus({ preventScroll: true });
  };
  const hideCard = () => { card.hidden = true; pill.setAttribute('aria-expanded', 'false'); };
  const closeCard = async () => {
    const s = cardStep;
    cardStep = null;
    hideCard();
    await s?.close();
  };
  pill.addEventListener('click', () => { if (card.hidden) openCard(); else void closeCard(); });
  d.addEventListener('pointerdown', e => {
    if (!card.hidden && !card.contains(/** @type {Node} */ (e.target)) && !pill.contains(/** @type {Node} */ (e.target))) void closeCard();
  }, true);
  card.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void closeCard().then(() => pill.focus()); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...card.querySelectorAll('button')];
      const i = rows.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
      rows[(i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
    }
  });

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

  let queued = 0;
  /** everything the notes show, again (at most once a frame) */
  const redraw = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      paintSpace();
      const want = current();
      if (!want) { tools.replaceChildren(); pillLabel.textContent = 'No views'; return; }
      if (want.key !== showing) { void show(want.key); return; }
      ready.get(showing)?.redraw();
    });
  };

  return {
    ctx,
    /** the drawer is opening: the view kept, drawn now */
    shown() {
      paintSpace();
      const want = current();
      if (want) void show(want.key);
      // (the others load while the drawer is open, so a switch is at once)
      const idle = window.requestIdleCallback || (/** @type {(f: () => void) => number} */ f => setTimeout(f, 200));
      idle(() => { for (const def of available()) void make(def); });
    },
    /** the drawer has shut */
    closed() { void closeCard(); toastsHome(); },
    redraw,
    /** a view by key (the e2e and other sheets) @param {string} key */
    show,
  };
}
