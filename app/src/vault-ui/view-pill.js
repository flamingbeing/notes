// A sidebar's view picker (both drawers): a pill naming the view shown; a tap raises a card of the views from it
// (covering it, the pill showing faint at its foot), the one shown marked. Back, Esc, a tap elsewhere in the drawer or
// a pick closes the card. It moves only by transform and opacity (the kit's glide); reduced motion: a fade.
import { glide, still } from '@core/ui';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';

/** @typedef {{ key: string, label: string, icon: string }} ViewName */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string)} kids @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };

/**
 * @param {{ prefix: string, drawer: HTMLElement, views: () => ViewName[], current: () => ViewName | null, choose: (key: string) => unknown }} o
 *   prefix: the ids (`<prefix>-pill`, `<prefix>-menu`, `<prefix>-<key>`); drawer: the drawer it sits in (a tap
 *   elsewhere in it closes the card); views: the views on now; current: the one shown; choose: a view picked
 */
export function viewPicker(o) {
  const pillIcon = el('span', { className: 'vl-pill-icon' });
  const pillLabel = el('span', { className: 'vl-pill-label' });
  const pill = el('button', { type: 'button', id: `${o.prefix}-pill`, className: 'vl-view-pill' }, pillIcon, pillLabel, glyph('chevronsUpDown', 'vl-pill-chev'));
  pill.setAttribute('aria-haspopup', 'menu');
  pill.setAttribute('aria-expanded', 'false');
  const card = el('div', { id: `${o.prefix}-menu`, className: 'vl-view-card', hidden: true });
  card.setAttribute('role', 'menu');
  card.setAttribute('aria-label', 'Views');
  const wrap = el('div', { className: 'vl-pill-wrap' }, pill, card);

  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let cardStep = null;
  const fillCard = () => {
    const now = o.current();
    card.replaceChildren(...o.views().map(def => {
      const b = el('button', { type: 'button', className: 'vl-view-row', id: `${o.prefix}-${def.key}` }, glyph(def.icon), el('span', { textContent: def.label }));
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(def.key === now?.key));
      b.addEventListener('click', () => { void closeCard().then(() => o.choose(def.key)); });
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
  o.drawer.addEventListener('pointerdown', e => {
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

  return {
    wrap,
    /** the pill names this view (none: '' and the words given) @param {ViewName | null} def @param {string} [none] */
    paint(def, none = 'No views') {
      pillIcon.replaceChildren(...(def ? [glyph(def.icon)] : []));
      pillLabel.textContent = def ? def.label : none;
      pill.setAttribute('aria-label', def ? `View: ${def.label}. Change view` : none);
    },
    close: closeCard,
  };
}
