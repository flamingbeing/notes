// A swipe right on the note page goes back to the list, the page following the finger (on a phone, where the page
// covers the list; beside the list there is nothing to go back to). Not from the screen's left edge (the phone's own
// Back owns it), not mostly up or down (that scrolls), not while text is selected or after a hold (that is a selection),
// and not in a sideways scroller (a wide table, the format bar). The close saves, as Back and the close button do.
const EDGE = 24;
const SLOP = 10;
const HOLD_MS = 400;

/**
 * @param {HTMLDialogElement} sheet
 * @param {() => boolean} close  closes the page (saving it); false when it refused to (the page stays)
 */
export function swipeBack(sheet, close) {
  /** @type {{ x: number, y: number, at: number, on: boolean, dx: number, seen: [number, number][] } | null} */
  let s = null;
  const selected = () => {
    const a = document.activeElement;
    if ((a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement) && a.selectionStart !== a.selectionEnd) return true;
    return !(getSelection()?.isCollapsed ?? true);
  };
  /** @param {EventTarget | null} target */
  const inScroller = target => {
    for (let el = target instanceof Element ? target : null; el && el !== sheet; el = el.parentElement)
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    return false;
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** @param {string} to @param {() => void} then */
  const glide = (to, then) => {
    if (still()) { then(); return; }
    sheet.style.transition = 'transform .22s ease-out';
    sheet.style.transform = to;
    setTimeout(then, 230);
  };
  const reset = () => { sheet.style.transition = ''; sheet.style.transform = ''; sheet.classList.remove('swiping'); };

  sheet.addEventListener('touchstart', e => {
    s = null;
    if (e.touches.length !== 1 || !sheet.matches(':modal')) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || selected() || inScroller(e.target)) return;
    s = { x: t.clientX, y: t.clientY, at: e.timeStamp, on: false, dx: 0, seen: [] };
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!s) return;
    const t = e.touches[0];
    if (!s.on) {
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.hypot(dx, dy) < SLOP) return;
      if (dx <= 0 || dx < 2 * Math.abs(dy) || e.timeStamp - s.at > HOLD_MS || selected()) { s = null; return; }
      s.on = true; s.x = t.clientX;
      sheet.classList.add('swiping');
    }
    if (e.cancelable) e.preventDefault();
    s.dx = Math.max(0, t.clientX - s.x);
    s.seen.push([e.timeStamp, s.dx]);
    if (s.seen.length > 5) s.seen.shift();
    sheet.style.transform = `translateX(${s.dx}px)`;
  }, { passive: false });
  const end = () => {
    const was = s; s = null;
    if (!was?.on) return;
    const [t0, x0] = was.seen[0] ?? [0, 0], [t1, x1] = was.seen[was.seen.length - 1] ?? [0, 0];
    const speed = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    // past a third of the screen, or a quick flick that went right
    if (was.dx > innerWidth / 3 || (speed > 0.5 && was.dx > 30)) glide(`translateX(${innerWidth}px)`, () => { const shut = close(); if (shut) reset(); else glide('', reset); });
    else glide('', reset);
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
