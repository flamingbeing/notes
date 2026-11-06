// The note menu's "Find…": a small bar under the header that finds words in the note open (any case), selects each
// match in turn (the editor scrolls to it) and says which of how many; Enter or the down arrow goes to the next,
// Shift+Enter or the up arrow to the one before. Back, Esc or the close button shuts it. Loaded on its first use.
import { EditorSelection } from '@vendor/codemirror';
import { transients } from '../shell/transients.js';
import { glyph } from './icons.js';

/** @typedef {import('@codemirror/view').EditorView} View */

/** where `q` is in `text`, any case @param {string} text @param {string} q @returns {[number, number][]} */
export function matchesOf(text, q) {
  if (!q) return [];
  const low = text.toLowerCase(), k = q.toLowerCase();
  /** @type {[number, number][]} */
  const out = [];
  for (let i = low.indexOf(k); i >= 0 && out.length < 9999; i = low.indexOf(k, i + Math.max(1, k.length))) out.push([i, i + k.length]);
  return out;
}

/** @param {{ view: () => View | null, host: HTMLElement }} o */
export function findBar(o) {
  const input = /** @type {HTMLInputElement} */ (Object.assign(document.createElement('input'), { id: 'vl-find-q', type: 'search', placeholder: 'Find…', autocomplete: 'off', spellcheck: false }));
  input.setAttribute('aria-label', 'Find in this note');
  input.enterKeyHint = 'search';
  const count = Object.assign(document.createElement('span'), { id: 'vl-find-count', className: 'vl-find-count' });
  count.setAttribute('role', 'status');
  /** @param {string} id @param {string} icon @param {string} label @param {() => void} run */
  const button = (id, icon, label, run) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', id, className: 'vl-find-btn' });
    b.setAttribute('aria-label', label);
    b.append(glyph(icon));
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', run);
    return b;
  };
  const prev = button('vl-find-prev', 'chevronUp', 'Previous match', () => go(-1));
  const next = button('vl-find-next', 'chevronDown', 'Next match', () => go(1));
  const shut = button('vl-find-close', 'x', 'Close find', () => void close());
  const bar = Object.assign(document.createElement('div'), { id: 'vl-find', className: 'vl-find', hidden: true });
  bar.setAttribute('role', 'search');
  bar.append(glyph('search', 'vl-find-icon'), input, count, prev, next, shut);
  o.host.append(bar);

  /** @type {[number, number][]} */
  let hits = [];
  let at = -1;
  const paint = () => {
    count.textContent = !input.value ? '' : hits.length ? `${at + 1} / ${hits.length}` : 'No results';
    prev.disabled = next.disabled = hits.length < 2;
  };
  /** the match `at` selected and in sight */
  const select = () => {
    const v = o.view();
    if (!v || at < 0 || !hits[at]) return;
    const [a, b] = hits[at];
    v.dispatch({ selection: EditorSelection.range(a, b), scrollIntoView: true });
  };
  const search = () => {
    const v = o.view();
    hits = v ? matchesOf(v.state.doc.toString(), input.value) : [];
    const from = v?.state.selection.main.from ?? 0;
    at = hits.length ? Math.max(0, hits.findIndex(([a]) => a >= from)) : -1;
    select();
    paint();
  };
  /** @param {number} d */
  const go = d => {
    if (!hits.length) return;
    at = (at + d + hits.length) % hits.length;
    select();
    paint();
  };
  input.addEventListener('input', () => {
    // (from the top each time the words change)
    const v = o.view();
    if (v) v.dispatch({ selection: EditorSelection.cursor(0) });
    search();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void close(); }
  });

  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let step = null;
  const hide = () => { bar.hidden = true; document.documentElement.classList.remove('vl-finding'); };
  const close = async () => { const s = step; step = null; hide(); await s?.close(); };
  return {
    open() {
      bar.hidden = false;
      document.documentElement.classList.add('vl-finding');
      step ||= transients().open(() => { step = null; hide(); });
      input.focus();
      input.select();
      if (input.value) search(); else paint();
    },
    close,
    isOpen: () => !bar.hidden,
  };
}
