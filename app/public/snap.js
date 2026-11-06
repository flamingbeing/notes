// The list as this device last showed it, painted before any module loads (a classic script at the end of the page, so
// the first frame already has it): like a phone app reopening where it was. It may be a moment old; the real list
// replaces it once sign-in and sync are ready (src/shell/snap.js saves it and takes over). Taps on a row meanwhile are
// kept and opened then. Nothing kept (a new device, signed out): the page starts as before.
(() => {
  // the layout (as boot.js reads it): the Vault layout opens on a note, not on the list, so nothing is painted there
  let layout = 'vault';
  try { if (JSON.parse(localStorage.getItem('notes:settings:settings/device') || '{}')?.values?.layout === 'classic') layout = 'classic'; } catch { /* the default */ }
  document.documentElement.dataset.layout = layout;
  if (layout !== 'classic') return;
  let s;
  try { s = JSON.parse(localStorage.getItem('notes:snap') || 'null'); } catch { return; }
  if (!s || s.v !== 1) return;
  const view = document.getElementById('list-view');
  if (!view) return;
  for (const [id, html] of Object.entries(s.html || {})) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  for (const [id, h] of Object.entries(s.hidden || {})) { const el = document.getElementById(id); if (el) el.hidden = h; }
  for (const el of view.querySelectorAll('[data-icon]')) {
    const svg = s.icons?.[el.getAttribute('data-icon') || ''];
    if (svg && !el.firstElementChild) el.innerHTML = svg;
  }
  view.dataset.snap = '';
  view.hidden = false;
  // a tap on a row before the app is ready: kept, and opened once it is (src/shell/snap.js)
  document.getElementById('items')?.addEventListener('click', e => {
    const row = e.target instanceof Element ? e.target.closest('li[data-id]') : null;
    if (row && view.hasAttribute('data-snap')) window.__snapTap = row.getAttribute('data-id');
  });
})();
