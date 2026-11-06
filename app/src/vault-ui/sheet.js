// The Vault layout's bottom sheet: grouped white cards of rows on a grey sheet that rises from the bottom (menus, the
// ribbon, the open tabs). Back (the app's transients), Esc, a tap on the shade or a drag of its top down closes it; it
// moves only by transform and opacity, on the kit's spring (glide) and drag.
import { drag, glide } from '@core/ui';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';

/**
 * @typedef {{ id?: string, icon?: string, label: string, run: () => unknown, ticked?: boolean, danger?: boolean, next?: boolean, hint?: string,
 *   radio?: boolean, disabled?: boolean }} Row
 *   ticked: an on-state (a tick at the end); next: opens another list (a chevron); danger: red (a delete); radio: one of
 *   a choice (a radio at the end, filled on the one chosen); disabled: shown, not tappable (the hint says why)
 * @typedef {{ rows: Row[], title?: string }} Card
 */

let shade = /** @type {HTMLElement | null} */ (null);
/** the one shade behind every sheet (below the top layer, so the sheet's own backdrop takes the taps) */
const shadeEl = () => {
  if (!shade) { shade = Object.assign(document.createElement('div'), { className: 'vl-shade' }); document.body.append(shade); }
  return shade;
};

/**
 * @param {{ id: string, label: string | (() => string), cards: () => Card[] }} o  cards: what it shows, read each time it
 *   opens (and label: what it is for, when it changes too)
 */
export function bottomSheet({ id, label, cards }) {
  const named = typeof label === 'function' ? label : () => label;
  const d = document.createElement('dialog');
  d.id = id;
  d.className = 'vl-sheet';
  d.setAttribute('aria-label', named());
  const grab = Object.assign(document.createElement('div'), { className: 'vl-grab' });
  grab.setAttribute('aria-hidden', 'true');
  const body = Object.assign(document.createElement('div'), { className: 'vl-sheet-body' });
  d.append(grab, body);
  document.body.append(d);

  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const height = () => d.getBoundingClientRect().height || innerHeight / 2;
  /** @type {ReturnType<typeof glide> | null} */
  let run = null;
  let y = 0;
  const put = (/** @type {number} */ at) => {
    y = at;
    d.style.transform = `translateY(${Math.max(0, at)}px)`;
    shadeEl().style.opacity = String(Math.max(0, 1 - at / height()));
  };
  /** glide to `to` (px down from open) at speed v @param {number} to @param {number} [v] */
  const move = async (to, v = 0) => {
    const from = run ? run.stop() : y;
    run?.stop();
    if (still()) { put(to); return; }
    const h = height();
    const g = glide([[d, x => ({ transform: `translateY(${Math.max(0, x)}px)` })], [shadeEl(), x => ({ opacity: String(Math.max(0, 1 - x / h)) })]], from, to, v);
    run = g;
    const landed = await g.done;
    if (run === g) { run = null; put(to); g.stop(); }
    return landed;
  };

  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let step = null;
  let shut = /** @type {Promise<void> | null} */ (null);
  /** slide out and close (the history step already gone) @param {number} [v] */
  const hide = (v = 0) => (shut ||= (async () => {
    await move(height(), v);
    d.close();
    shadeEl().classList.remove('on');
    shut = null;
  })());

  /** @param {Row} r */
  const rowEl = r => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'vl-row' });
    if (r.id) b.id = r.id;
    if (r.danger) b.classList.add('vl-danger');
    if (r.icon) b.append(glyph(r.icon));
    b.append(Object.assign(document.createElement('span'), { className: 'vl-row-label', textContent: r.label }));
    if (r.hint) { const h = Object.assign(document.createElement('span'), { className: 'vl-row-hint', textContent: r.hint }); h.dataset.faint = ''; b.append(h); }
    if (r.ticked !== undefined) { b.setAttribute('aria-pressed', String(r.ticked)); if (r.ticked) b.append(glyph('check', 'vl-tick')); }
    if (r.radio !== undefined) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(r.radio)); b.append(glyph(r.radio ? 'circleDot' : 'circle', `vl-radio${r.radio ? ' on' : ''}`)); }
    if (r.disabled) { b.disabled = true; b.classList.add('vl-disabled'); }
    if (r.next) b.append(glyph('chevronRight', 'vl-next'));
    // (the sheet goes first, its Back step with it, so what the row opens is on top of the page as it was)
    b.addEventListener('click', async () => { await close(); r.run(); });
    return b;
  };
  const fill = () => {
    body.replaceChildren(...cards().filter(c => c.rows.length).map(c => {
      const card = Object.assign(document.createElement('div'), { className: 'vl-card' });
      card.setAttribute('role', 'group');
      if (c.title) card.setAttribute('aria-label', c.title);
      if (c.rows.some(r => r.radio !== undefined)) card.setAttribute('role', 'radiogroup');
      card.append(...c.rows.map(rowEl));
      return card;
    }));
  };

  const open = () => {
    if (d.open && !shut) return;
    d.setAttribute('aria-label', named());
    fill();
    shadeEl().classList.add('on');
    if (!d.open) d.showModal();
    put(height());
    step = transients().open(() => { step = null; void hide(); });
    void move(0);
    /** @type {HTMLElement | null} */ (body.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  };
  /** closed (its Back step taken back too) -> once it is gone */
  const close = async (v = 0) => {
    const s = step;
    step = null;
    await Promise.all([s?.close(), hide(v)]);
  };
  d.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  // a tap on the shade (the dialog's backdrop: outside its box)
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) void close();
  });
  // the top of the sheet dragged down: past a third (or flicked) it closes, else it settles back
  drag(grab, {
    axis: 'y', mouse: true, name: 'sheet',
    start: () => { const at = run ? run.stop() : y; run = null; put(at); return at; },
    move: x => put(x),
    end: (x, v) => { if (x > height() / 3 || v > 0.5) void close(v); else void move(0, v); },
    bounds: () => [0, height()],
  });
  return { open, close, isOpen: () => d.open && !shut, el: d };
}
