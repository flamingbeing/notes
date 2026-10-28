// The sync chip (#status, one per page): the sync module's state as an icon (a count badge on it) and a word.
import { LABELS } from './labels.js';
import { el } from './dom.js';
import { icon, check, refreshCw, cloudOff, triangleAlert, loaderCircle } from '../icons/lucide.js';

// the icon each state draws (colour comes from data-state in ui.css; pending spins)
const ICON = { synced: check, pending: refreshCw, offline: cloudOff, attention: triangleAlert, 'at-risk': triangleAlert, unknown: loaderCircle };

/**
 * @param {HTMLElement} host  the chip is added here
 * @param {{ sync: import('./types').SyncApi, labels?: Record<string, string>, idPrefix?: string }} o  labels: words over LABELS
 *   idPrefix: put before each of the part's ids (two on one page, or ids the app already uses)
 * @returns {() => void} stop: unsubscribes and removes the chip
 */
export function syncChip(host, { sync, labels = {}, idPrefix = '' }) {
  const words = { ...LABELS, ...labels };
  const chip = el('span', { id: `${idPrefix}status`, class: 'ui-chip chip', role: 'status', 'aria-live': 'polite' });
  const mark = el('span', { class: 'ui-chip-icon' }), badge = el('span', { class: 'ui-chip-badge', 'aria-hidden': 'true' }), text = el('span', { class: 'ui-chip-text' }, words.unknown);
  mark.append(icon(ICON.unknown), badge);
  chip.append(mark, text);
  host.append(chip);
  const off = sync.status$(st => {
    chip.dataset.state = st.state;
    if (mark.dataset.state !== st.state) {   // (a new icon only when the state changes, so the spin keeps turning)
      mark.dataset.state = st.state;
      mark.replaceChildren(icon(ICON[/** @type {keyof typeof ICON} */ (st.state)] || ICON.unknown), badge);
    }
    badge.textContent = st.count ? String(st.count) : '';
    text.textContent = (words[st.state] || st.state) + (st.count ? ` (${st.count})` : '');
  });
  return () => { off(); chip.remove(); };
}
