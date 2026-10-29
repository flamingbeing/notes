// The list as last shown, kept on this device so the next start paints it at once (public/snap.js paints it before
// any module loads). Kept: the first rows of the list, the side bar's folders and tags, the counts, which parts of
// the bar were showing, and the bar's icons. Gone on sign-out or when another phase than the list shows.
const KEY = 'notes:snap';
const ROWS = 60;   // more than a tall screen shows
// filled by the list: their markup is kept (the list's rows trimmed to ROWS)
const FILLED = ['items', 'count', 'count-side', 'side-folders', 'side-tags'];
// the page as first drawn: the notes tab, not the one open when it was kept
const START = { home: false, folders: true, settings: true, haiku: true };

/** keep what the list shows now (the list view must be showing) */
export function saveSnap() {
  const view = document.getElementById('list-view');
  if (!view || view.hidden || view.hasAttribute('data-snap')) return;
  /** @type {Record<string, string>} */
  const html = {};
  for (const id of FILLED) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id !== 'items') { html[id] = el.innerHTML; continue; }
    const box = /** @type {HTMLElement} */ (el.cloneNode(false));
    for (const li of [...el.children].slice(0, ROWS)) {
      const c = /** @type {HTMLElement} */ (li.cloneNode(true));
      c.removeAttribute('aria-current'); c.removeAttribute('aria-selected'); c.classList.remove('changed');
      box.append(c);
    }
    html[id] = box.innerHTML;
  }
  /** @type {Record<string, boolean>} */
  const hidden = {};
  const items = document.getElementById('items');
  for (const el of view.querySelectorAll('[id]')) if (!items?.contains(el) && el instanceof HTMLElement) hidden[el.id] = el.hidden;
  Object.assign(hidden, START);
  /** @type {Record<string, string>} */
  const icons = {};
  for (const el of view.querySelectorAll('[data-icon]')) {
    const name = el.getAttribute('data-icon') || '';
    if (name && !(name in icons) && el.firstElementChild && !items?.contains(el)) icons[name] = el.innerHTML;
  }
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, html, hidden, icons })); } catch { /* storage full or off */ }
}

/** forget the kept list (signed out, or no access) */
export function dropSnap() {
  try { localStorage.removeItem(KEY); } catch { /* storage off */ }
}

/**
 * the real list takes over from the painted one: its rows go (the list draws its own) and a row tapped meanwhile is
 * handed back, to open once the real one is drawn. -> the tapped row's note id, or ''
 */
export function takeOver() {
  const view = document.getElementById('list-view');
  if (!view?.hasAttribute('data-snap')) return '';
  view.removeAttribute('data-snap');
  document.getElementById('items')?.replaceChildren();
  const w = /** @type {any} */ (window), tapped = String(w.__snapTap || '');
  delete w.__snapTap;
  return tapped;
}
