// The phone bar's sync button: the sync state as an icon (synced, syncing = spinning, offline = struck cloud, needs
// attention = dot). Tapping it asks for a sync now. App-only: app-ui's chip is a word-and-icon status, not a button.
import { iconOf } from './icons.js';

const WORDS = {
  synced: 'Synced. Tap to sync now',
  pending: 'Syncing. Tap to sync now',
  offline: 'Offline, changes wait. Tap to retry',
  attention: 'Sync needs attention. Tap to retry',
  'at-risk': 'Changes at risk of not syncing. Tap to retry',
  unknown: 'Checking sync',
};
const MIN_SPIN_MS = 700;   // a tap that finishes at once still shows the icon turning

/**
 * @param {HTMLButtonElement} btn
 * @param {{ status$: (fn: (st: { state: string, count: number }) => void) => void, syncNow: () => Promise<unknown> }} o
 */
export function syncButton(btn, { status$, syncNow }) {
  let spinUntil = 0, state = 'unknown', timer = 0, drawn = '';
  const draw = () => {
    const shown = state === 'pending' || Date.now() < spinUntil ? 'syncing' : state;
    const word = WORDS[/** @type {keyof typeof WORDS} */ (state)] || state;
    const label = shown === 'syncing' && state !== 'pending' ? WORDS.pending : word;
    btn.dataset.state = shown;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const name = shown === 'offline' ? 'cloudOff' : 'refreshCw';
    if (drawn !== name) { drawn = name; btn.replaceChildren(iconOf(name)); }
  };
  status$(st => { state = st.state; draw(); });
  btn.addEventListener('click', async () => {
    spinUntil = Date.now() + MIN_SPIN_MS;
    clearTimeout(timer); timer = window.setTimeout(draw, MIN_SPIN_MS + 20);
    draw();
    try { await syncNow(); } catch { /* the status shows it */ }
  });
  draw();
}
