// The Vault layout's find-as-you-type sheet (the quick switcher and the command palette): a grey sheet from below the
// header to the bottom, the note dimmed above it; the results from the top (one line each, the letters that matched in
// bold, the first one selected), the box at the BOTTOM, just above the keyboard (a white pill: what is typed, then a
// create button while there is text and a clear button). The arrows move the selection, Enter picks it, Shift+Enter
// (and Enter with nothing found) makes what is typed, where the sheet can. Back (the app's transients), Esc or a tap
// on the shade closes it. It moves only by transform and opacity, on the kit's spring (glide).
import { glide, still } from '@core/ui';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';
import { shadeEl } from './sheet.js';

/**
 * @typedef {{ key: string, text: string, ranges: [number, number][], muted?: number, label?: string }} Item
 *   text: the line shown; ranges: its letters to show bold; muted: how many characters at its start are muted (a
 *   command's group); label: what a screen reader says, if not the text
 */

const MAX = 60;   // rows shown at most

/**
 * @param {{ id: string, label: string, placeholder: string, list: (q: string) => Item[], choose: (key: string) => unknown,
 *   create?: (q: string) => unknown, empty: string, createLabel?: string }} o
 *   list: the rows for what is typed (best first); choose: a row picked (the sheet already gone); create: what is typed
 *   made (a new note), if the sheet makes things; empty: the words when nothing matches
 */
export function pickSheet(o) {
  const d = document.createElement('dialog');
  d.id = o.id;
  d.className = 'vl-pick';
  d.setAttribute('aria-label', o.label);
  const listId = `${o.id}-list`;
  const list = Object.assign(document.createElement('div'), { id: listId, className: 'vl-pick-list' });
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', o.label);
  const none = Object.assign(document.createElement('p'), { className: 'vl-pick-none', hidden: true });
  none.dataset.faint = '';
  const input = /** @type {HTMLInputElement} */ (Object.assign(document.createElement('input'), {
    id: `${o.id}-q`, type: 'text', placeholder: o.placeholder, autocomplete: 'off', spellcheck: false, className: 'vl-pick-q',
  }));
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-label', o.label);
  input.enterKeyHint = 'go';
  const make = Object.assign(document.createElement('button'), { type: 'button', id: `${o.id}-create`, className: 'vl-pick-btn', hidden: true });
  make.setAttribute('aria-label', o.createLabel || 'Create');
  make.append(glyph('filePlus'));
  const clear = Object.assign(document.createElement('button'), { type: 'button', id: `${o.id}-clear`, className: 'vl-pick-btn vl-pick-clear' });
  clear.setAttribute('aria-label', 'Clear');
  clear.append(glyph('circleXFilled'));
  const box = Object.assign(document.createElement('div'), { className: 'vl-pick-box' });
  box.append(input, make, clear);
  const foot = Object.assign(document.createElement('div'), { className: 'vl-pick-foot' });
  foot.append(box);
  d.append(list, none, foot);
  document.body.append(d);

  /** @type {Item[]} */
  let items = [];
  let sel = 0;
  /** @param {Item} it @param {number} i */
  const rowEl = (it, i) => {
    const r = document.createElement('div');
    r.id = `${o.id}-o${i}`;
    r.className = 'vl-pick-row';
    r.setAttribute('role', 'option');
    r.setAttribute('aria-selected', String(i === sel));
    if (it.label) r.setAttribute('aria-label', it.label);
    const muted = it.muted || 0;
    /** a piece of the text, its matched letters bold @param {number} a @param {number} b @param {HTMLElement} into */
    const piece = (a, b, into) => {
      let at = a;
      for (const [x, y] of it.ranges) {
        const s = Math.max(x, a), e = Math.min(y, b);
        if (e <= s) continue;
        if (s > at) into.append(it.text.slice(at, s));
        into.append(Object.assign(document.createElement('b'), { textContent: it.text.slice(s, e) }));
        at = e;
      }
      if (at < b) into.append(it.text.slice(at, b));
    };
    if (muted) { const g = Object.assign(document.createElement('span'), { className: 'vl-pick-group' }); piece(0, muted, g); r.append(g); }
    const main = Object.assign(document.createElement('span'), { className: 'vl-pick-text' });
    piece(muted, it.text.length, main);
    r.append(main);
    r.addEventListener('click', () => void pick(i));
    return r;
  };
  const paint = () => {
    list.replaceChildren(...items.map(rowEl));
    none.hidden = items.length > 0 || !input.value.trim();
    none.textContent = o.empty;
    make.hidden = !o.create || !input.value.trim();
    input.setAttribute('aria-activedescendant', items.length ? `${o.id}-o${sel}` : '');
  };
  const update = () => { items = o.list(input.value).slice(0, MAX); sel = 0; paint(); list.scrollTop = 0; };
  /** @param {number} to */
  const select = to => {
    if (!items.length) return;
    sel = (to + items.length) % items.length;
    for (const [i, r] of [...list.children].entries()) r.setAttribute('aria-selected', String(i === sel));
    input.setAttribute('aria-activedescendant', `${o.id}-o${sel}`);
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
  };

  // ---- open and close: up from the bottom, the shade fading in
  const height = () => d.getBoundingClientRect().height || innerHeight;
  /** @type {ReturnType<typeof glide> | null} */
  let run = null;
  let y = 0;
  /** @param {number} at */
  const put = at => { y = at; d.style.transform = at > 0.5 ? `translateY(${at}px)` : ''; shadeEl().style.opacity = String(Math.max(0, 1 - at / height())); };
  /** @param {number} to */
  const move = async to => {
    const from = run ? run.stop() : y;
    run = null;
    if (still()) { put(to); return; }
    const h = height();
    const g = glide([[d, v => ({ transform: `translateY(${Math.max(0, v)}px)` })], [shadeEl(), v => ({ opacity: String(Math.max(0, 1 - v / h)) })]], from, to, 0);
    run = g;
    await g.done;
    if (run === g) { run = null; put(to); g.stop(); }
  };
  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let step = null;
  let shut = /** @type {Promise<void> | null} */ (null);
  const hide = () => (shut ||= (async () => {
    input.blur();
    await move(height());
    d.close();
    shadeEl().classList.remove('on');
    shut = null;
  })());
  const close = async () => {
    const s = step;
    step = null;
    await Promise.all([s?.close(), hide()]);
  };
  /** the row picked: the sheet gone first (its Back step too), so what it opens is a step of its own @param {number} i */
  const pick = async i => {
    const it = items[i];
    if (!it) return;
    await close();
    await o.choose(it.key);
  };
  const createNow = async () => {
    const q = input.value.trim();
    if (!q || !o.create) return;
    await close();
    await o.create(q);
  };

  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(sel + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (e.shiftKey || (!items.length && o.create)) void createNow(); else void pick(sel);
    }
  });
  make.addEventListener('click', () => void createNow());
  // (clear: what is typed, else the sheet)
  clear.addEventListener('click', () => { if (input.value) { input.value = ''; update(); input.focus(); } else void close(); });
  d.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientY < r.top) void close();
  });

  const open = () => {
    if (d.open && !shut) { input.focus(); return; }
    input.value = '';
    update();
    shadeEl().classList.add('on');
    if (!d.open) d.showModal();
    put(height());
    step = transients().open(() => { step = null; void hide(); });
    input.focus({ preventScroll: true });
    void move(0);
  };
  return { open, close, isOpen: () => d.open && !shut, el: d, input };
}
