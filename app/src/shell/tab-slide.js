// A tapped tab slides its page in from the side the tab is on, as logbook's pages do (its default page motion: 280 ms,
// the page moves a third of the way in while it fades in). The kit's tab pages switch at once on a tap and follow the
// finger on a swipe, so this only acts on a tap; Reduce Motion (or Still) leaves the switch as it is.
import { still } from '@core/ui';

const MS = 280, EASE = 'cubic-bezier(.2, .7, .2, 1)', SHIFT = 0.3;

/** the tab bar's pages, in its order (a hidden tab left out) @returns {HTMLElement[]} */
const stops = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('nav.ui-tabbar [data-tab-page]')]
  .filter(t => !(/** @type {HTMLElement} */ (t)).hidden)
  .map(t => document.querySelector(/** @type {string} */ (t.getAttribute('data-tab-page'))))
  .filter(p => p !== null));

export function tabSlide() {
  const first = document.querySelector('nav.ui-tabbar [data-tab-page][aria-current="page"]');
  /** @type {Element | null} */
  let last = first ? document.querySelector(/** @type {string} */ (first.getAttribute('data-tab-page'))) : null;
  let tapped = false;
  document.addEventListener('click', e => {
    if (!(/** @type {Element} */ (e.target)).closest?.('[data-tab-page]')) return;
    tapped = true;
    setTimeout(() => { tapped = false; }, 400);
  }, true);
  document.addEventListener('ui-tab', e => {
    const page = /** @type {HTMLElement} */ (/** @type {CustomEvent} */ (e).detail.page), from = last;
    last = page;
    if (!tapped) return;   // a swipe has already moved the pages
    tapped = false;
    const order = stops();
    if (!from || from === page || still() || !order.includes(page)) return;
    const dir = order.indexOf(page) > order.indexOf(/** @type {HTMLElement} */ (from)) ? 1 : -1;
    const host = page.parentElement;
    host?.classList.add('is-tab-sliding');
    page.animate([{ transform: `translateX(${Math.round(innerWidth * SHIFT) * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: MS, easing: EASE }).finished.catch(() => {}).then(() => host?.classList.remove('is-tab-sliding'));
  });
}
