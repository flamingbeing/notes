// The Vault layout's right sidebar's insides, in the kit's sidebar from the right (app-ui ui/vault/sidebar.js, made by
// shell.js: the drawer, the pane's tools and the view picker pill at the bottom): one pane at a time, each following its
// Core plugin: Backlinks (the Linked mentions of the note open, as under the note), Outgoing links (the notes this one
// links to; one not there yet shows faint and a tap makes it), Outline (the note's headings as a tree; a tap scrolls
// the note there) and, with Daily notes on, Calendar (a month of days, a dot on each with a daily note; a tap opens or
// makes that day's note). At the bottom the pane's tools, the view picker pill and the footer: the note's name, its
// words and characters (Word count), and the sync state (a tap syncs now, as the Classic cloud button does). The pane
// shown is kept per space (vault-ui/state.js). Loaded the first time it is wanted.
import { glyph } from './icons.js';
import { headingsOf } from './outline.js';
import { countText } from './count.js';
import { monthGrid, dailyMap, dayOf, WEEKDAYS, MONTHS } from './month.js';
import { linksIn, keyOf } from '../notes/parse.js';
import { linkIndex } from '../notes/links.js';
import { isoDay } from '../notes/model.js';

/** @typedef {import('../notes/model.js').Note} Note */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
/** @template {HTMLElement} E @param {E} e @returns {E} */
const faint = e => { e.dataset.faint = ''; return e; };

/** the sync states the footer shows: the Classic cloud button's (app-ui syncButton's data-state) -> icon, look, words */
const SYNC = /** @type {Record<string, { icon: string, cls: string, word: string }>} */ ({
  synced: { icon: 'circleCheck', cls: 'ok', word: 'Synced' },
  syncing: { icon: 'refreshCw', cls: 'busy', word: 'Syncing…' },
  offline: { icon: 'cloudOff', cls: 'off', word: 'Offline, kept on this device' },
  attention: { icon: 'circleAlert', cls: 'bad', word: 'Not synced: needs you' },
  'at-risk': { icon: 'circleAlert', cls: 'bad', word: 'Not synced yet' },
  unknown: { icon: 'cloud', cls: 'off', word: 'Connecting…' },
});

/**
 * @param {{
 *   list: ReturnType<typeof import('../screens/list.js').listScreen>,
 *   page: ReturnType<typeof import('../screens/note-page.js').notePage>,
 *   on: (key: string) => boolean, state: () => ReturnType<typeof import('./state.js').vaultState>,
 *   notes: () => Note[], current: () => Note | null, body: () => string, canWrite: () => boolean,
 *   open: (note: Note, line?: number) => Promise<unknown>, openTitle: (title: string) => Promise<unknown>,
 *   daily: (iso: string) => Promise<unknown>, toast: (msg: string) => unknown,
 * }} o  open: a note opened from here (at a line); openTitle: a link's note opened, made if it isn't there; daily:
 *   that day's note opened, made if it isn't there; body: the open note's text as it is now (typed, maybe not saved)
 * @param {import('app-ui/ui/vault/sidebar.js').Sidebar} side  the kit's sidebar this fills (its panes by pane(), its
 *   footer the note's name, size and sync state)
 */
export function rightSidebar(o, side) {
  // the footer: the note's name and size; the sync state
  const fName = el('div', { className: 'vl-foot-name' });
  const fCount = el('div', { id: 'vl-foot-count', className: 'vl-foot-count' });
  const sync = el('button', { type: 'button', id: 'vl-sync', className: 'vl-sync' });
  const footer = el('div', { id: 'vl-footer', className: 'vl-footer' }, el('div', { className: 'vl-foot-text' }, fName, fCount), sync);
  side.foot.append(footer);

  /** @type {Record<string, { el: HTMLElement, draw: () => void, tools?: HTMLElement[] }>} */
  const panes = {};

  // ---- Backlinks: the mentions block (mentions.js), its tools in the drawer's tool row
  /** @type {Promise<unknown> | null} */
  let backMade = null;
  const backPane = el('div', { id: 'vl-r-backlinks', className: 'vl-view vl-rpane', hidden: true });
  panes.backlinks = { el: backPane, draw: () => {
    backMade ||= import('./mentions.js').then(m => {
      const block = m.mentionsBlock({ host: backPane, prefix: 'vl-rb', id: 'vl-rb', notes: o.notes, current: o.current, state: o.state,
        open: async (note, line) => { await side.leave(); await o.open(note, line); }, enabled: () => true });
      const t = /** @type {HTMLElement | null} */ (block.el.querySelector('.vl-mn-tools'));
      panes.backlinks.tools = t ? [...t.children].map(x => /** @type {HTMLElement} */ (x)) : [];
      panes.backlinks.draw = () => { block.draw(); none.hidden = !!o.current(); };
      const none = faint(el('p', { className: 'vl-rpane-empty', hidden: true }, 'No file is open.'));
      backPane.append(none);
      const v = made.get('backlinks');
      if (v) v.tools = panes.backlinks.tools;
      // (shown already: shown again, its tools with it)
      if (showing === 'backlinks') void side.show('backlinks'); else panes.backlinks.draw();
    }).catch(() => { backMade = null; });
  } };

  // ---- Outgoing links: "Links N", then each note linked (a faint one isn't there yet: a tap makes it)
  const outCount = faint(el('span', { className: 'vl-rpane-count' }));
  const outRows = el('div', { id: 'vl-out-rows', className: 'vl-out-rows' });
  const outPane = el('div', { id: 'vl-r-outgoing', className: 'vl-view vl-rpane', hidden: true },
    el('div', { className: 'vl-rpane-head' }, el('h2', { className: 'vl-rpane-title' }, 'Links'), outCount), outRows);
  panes.outgoing = { el: outPane, draw: () => {
    const note = o.current();
    const all = o.notes();
    const idx = linkIndex(all);
    /** @type {Map<string, { text: string, note: Note | null }>} */
    const seen = new Map();
    for (const l of note ? linksIn(o.body()) : []) {
      if (!l.target) continue;
      // (an embedded file that is not a note: an attachment, not a link)
      if (/\.[a-z0-9]{1,5}$/i.test(l.target) && !/\.md$/i.test(l.target)) continue;
      const k = keyOf(l.target);
      if (!seen.has(k)) seen.set(k, { text: l.target, note: idx.resolve(l.target) });
    }
    outCount.textContent = String(seen.size);
    outCount.setAttribute('aria-label', `${seen.size} ${seen.size === 1 ? 'link' : 'links'}`);
    outRows.replaceChildren(...[...seen.values()].map(({ text, note: to }) => {
      const b = el('button', { type: 'button', className: 'vl-out-row' }, faint(el('span', { className: 'vl-out-icon' }, glyph('link'))), el('span', { className: 'vl-out-name' }, to?.title || text));
      if (!to) { faint(b); b.setAttribute('aria-label', `${text} (not created yet)`); }
      b.addEventListener('click', async () => {
        if (!to && !o.canWrite()) { o.toast('This space is read-only.'); return; }
        await side.leave();
        if (to) await o.open(to); else await o.openTitle(text);
      });
      return b;
    }));
    if (!seen.size) outRows.append(faint(el('p', { className: 'vl-rpane-empty' }, note ? 'No links found.' : 'No file is open.')));
  } };

  // ---- Outline: the headings as a tree; a tap scrolls the note to one
  const outlineRows = el('div', { id: 'vl-outline', className: 'vl-outline' });
  const outlinePane = el('div', { id: 'vl-r-outline', className: 'vl-view vl-rpane', hidden: true }, outlineRows);
  /** the note scrolled to a heading (the drawer gone first) @param {{ line: number, text: string }} h @param {number} n  its place among the headings */
  const goTo = async (h, n) => {
    await side.leave();
    if (o.page.reading()) {
      const read = document.getElementById('edit-read');
      const hs = [...(read?.querySelectorAll('h1, h2, h3, h4, h5, h6') || [])];
      const target = hs.find(x => x.textContent?.trim() === h.text) || hs[n];
      target?.scrollIntoView({ block: 'start' });
      return;
    }
    await o.page.whenEditor();
    const v = o.page.editor();
    if (!v || h.line >= v.state.doc.lines) return;
    const pos = v.state.doc.line(h.line + 1).from;
    // (the editor's own scroll, the heading at the top, clear of the header)
    const View = /** @type {{ scrollIntoView: (pos: number, o: { y: string, yMargin: number }) => unknown }} */ (/** @type {unknown} */ (v.constructor));
    v.dispatch({ selection: { anchor: pos }, effects: /** @type {any} */ (View.scrollIntoView(pos, { y: 'start', yMargin: 80 })) });
  };
  panes.outline = { el: outlinePane, draw: () => {
    const hs = o.current() ? headingsOf(o.body()) : [];
    outlineRows.replaceChildren(...hs.map((h, i) => {
      const b = el('button', { type: 'button', className: 'vl-outline-row' }, el('span', { className: 'vl-outline-text' }, h.text));
      b.style.paddingInlineStart = `${5 + h.depth * 17}px`;
      b.dataset.level = String(h.level);
      b.addEventListener('click', () => void goTo(h, i));
      return b;
    }));
    if (!hs.length) outlineRows.append(faint(el('p', { className: 'vl-rpane-empty' }, o.current() ? 'No headings found.' : 'No file is open.')));
  } };

  // ---- Calendar: a month; a dot under each day with a daily note; a tap opens or makes that day's
  let month = /** @type {{ y: number, m: number } | null} */ (null);
  const calTitle = el('h2', { className: 'vl-cal-title' });
  const calPrev = el('button', { type: 'button', id: 'vl-cal-prev', className: 'vl-cal-nav' }, glyph('chevronLeft'));
  calPrev.setAttribute('aria-label', 'Previous month');
  const calNext = el('button', { type: 'button', id: 'vl-cal-next', className: 'vl-cal-nav' }, glyph('chevronRight'));
  calNext.setAttribute('aria-label', 'Next month');
  const calGrid = el('div', { id: 'vl-cal-grid', className: 'vl-cal-grid' });
  calGrid.setAttribute('role', 'grid');
  const calPane = el('div', { id: 'vl-r-calendar', className: 'vl-view vl-rpane', hidden: true },
    el('div', { className: 'vl-cal-head' }, calTitle, el('div', { className: 'vl-cal-navs' }, calPrev, calNext)), calGrid);
  /** @param {number} by */
  const shift = by => { const now = month || { y: new Date().getFullYear(), m: new Date().getMonth() }; const t = new Date(now.y, now.m + by, 1); month = { y: t.getFullYear(), m: t.getMonth() }; panes.calendar.draw(); };
  calPrev.addEventListener('click', () => shift(-1));
  calNext.addEventListener('click', () => shift(1));
  panes.calendar = { el: calPane, draw: () => {
    const today = isoDay();
    const open = o.current();
    const openDay = open ? dayOf(open) : '';
    if (!month) { const at = new Date(`${openDay || today}T12:00:00`); month = { y: at.getFullYear(), m: at.getMonth() }; }
    const g = monthGrid(month.y, month.m, today);
    const have = dailyMap(o.notes());
    calTitle.replaceChildren(`${MONTHS_SHORT[g.month]} `, el('span', { className: 'vl-cal-year' }, String(g.year)));
    calTitle.setAttribute('aria-label', g.title);
    const head = el('div', { className: 'vl-cal-row vl-cal-wk' }, ...WEEKDAYS.map(w => el('span', { className: 'vl-cal-wd' }, w.toUpperCase())));
    head.setAttribute('role', 'row');
    for (const c of head.children) c.setAttribute('role', 'columnheader');
    /** @type {HTMLElement[]} */
    const rows = [head];
    for (let w = 0; w < g.days.length / 7; w++) {
      const row = el('div', { className: 'vl-cal-row' });
      row.setAttribute('role', 'row');
      for (const day of g.days.slice(w * 7, w * 7 + 7)) {
        const note = have.get(day.iso);
        const b = el('button', { type: 'button', className: 'vl-cal-day' }, el('span', { className: 'vl-cal-n' }, String(day.day)), el('span', { className: 'vl-cal-dot' }));
        b.dataset.iso = day.iso;
        b.setAttribute('role', 'gridcell');
        if (!day.inMonth) faint(b);
        if (day.today) b.classList.add('vl-cal-now');
        if (note) b.classList.add('vl-cal-has');
        if (day.iso === openDay) b.setAttribute('aria-current', 'date');
        // (the name starts with the number shown)
        const [y, mo] = day.iso.split('-').map(Number);
        b.setAttribute('aria-label', `${day.day} ${MONTHS[mo - 1]} ${y}${day.today ? ', today' : ''}${note ? ', daily note' : ''}`);
        b.addEventListener('click', async () => {
          if (!note && !o.canWrite()) { o.toast('This space is read-only.'); return; }
          await side.leave();
          if (note) await o.open(note); else await o.daily(day.iso);
        });
        row.append(b);
      }
      rows.push(row);
    }
    calGrid.replaceChildren(...rows);
  } };


  // ---- the footer
  const paintFoot = () => {
    const note = o.current();
    fName.textContent = note ? note.title || 'Untitled' : 'No file is open';
    fCount.hidden = !note || !o.on('pWordCount');
    if (!fCount.hidden) fCount.textContent = countText(o.body());
  };
  // (the sync state: the Classic cloud button's (it stays the one that syncs, shown in the header only with the Sync
  // button extra on), drawn in the reference's look)
  const cloudBtn = /** @type {HTMLElement | null} */ (document.getElementById('sync-btn'));
  let shownSync = '';
  const paintSync = () => {
    const st = cloudBtn?.dataset.state || 'unknown';
    const look = SYNC[st] || SYNC.unknown;
    sync.dataset.state = st;
    sync.className = `vl-sync vl-sync-${look.cls}`;
    sync.setAttribute('aria-label', `${look.word}. Sync now`);
    if (shownSync !== look.icon) { shownSync = look.icon; sync.replaceChildren(glyph(look.icon)); }
  };
  if (cloudBtn) new MutationObserver(paintSync).observe(cloudBtn, { attributes: true, attributeFilter: ['data-state'] });
  paintSync();
  sync.addEventListener('click', () => cloudBtn?.click());

  let showing = '';
  /** @type {Map<string, import('app-ui/ui/vault/sidebar.js').SidebarView>} */
  const made = new Map();
  /** a pane for the sidebar (it draws it each time it shows) @param {string} key */
  const pane = key => {
    let v = made.get(key);
    if (!v) {
      const p = panes[key];
      if (!p) throw new Error(`no pane ${key}`);
      v = {
        el: p.el, tools: p.tools,
        shown: () => {
          showing = key;
          if (o.state().get().rightView !== key) o.state().set({ rightView: key });
          paintFoot();
          panes[key].draw();
        },
      };
      made.set(key, v);
    }
    return v;
  };
  const redraw = () => {
    paintFoot();
    if (side.current() !== showing) side.refresh(); else panes[showing]?.draw();
  };

  return {
    pane,
    /** the drawer is opening: drawn for the note open now (the sidebar shows the pane) */
    opened() { month = null; paintFoot(); },
    /** the notes or the note open changed (drawn only while it shows) */
    redraw() { if (side.isOpen()) redraw(); },
    /** a pane by key (the palette's "Show outline") @param {string} key */
    show(key) { o.state().set({ rightView: key }); void side.show(key); },
  };
}
