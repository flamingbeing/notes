// The Vault layout's pull down on a note: a finger that pulls the note down from its top (the scroll at 0) brings a
// terminal glyph in under the header, more of it the further it goes; past 64 px (a tick of haptics there) the let-go
// opens the command palette, as the reference app's mobile pull-down does. The note's own stretch is the kit's bounce
// (app-ui bounce.js); this only reads the finger (passive listeners, never in the scroll's way) and draws the glyph,
// by transform and opacity. A drawer or sheet that takes the touch (the kit's gesture arbiter) wins.
import { rubber, swipeIntent, haptic, captured } from '@core/ui';
import { glyph } from './icons.js';

export const PULL = 64;

/**
 * @param {{ scroller: () => HTMLElement | null, host: HTMLElement, can: () => boolean, run: () => unknown }} o
 *   scroller: the note's scroll (at its top the pull starts); host: where the glyph goes; can: the pull is on now (the
 *   Command palette plugin on, nothing over the note); run: the pull let go past the line
 */
export function pullDown(o) {
  const mark = document.createElement('div');
  mark.id = 'vl-pull';
  mark.className = 'vl-pull';
  mark.setAttribute('aria-hidden', 'true');
  mark.append(glyph('terminal'));
  o.host.append(mark);

  let y0 = 0, x0 = 0, dy = 0;
  /** null: not decided; true: a pull; false: not (a scroll, a sideways swipe) */
  let pulling = /** @type {boolean | null} */ (null);
  let armed = false;
  let watching = false;
  /** @param {number} d */
  const draw = d => {
    const k = Math.min(1, d / PULL);
    mark.style.opacity = String(k);
    mark.style.transform = `translateY(${rubber(d, 120) * 0.5}px) scale(${0.7 + 0.3 * k})`;
    mark.classList.toggle('on', d >= PULL);
  };
  const reset = () => {
    watching = false; pulling = null; dy = 0; armed = false;
    mark.classList.add('vl-pull-off');
    mark.style.opacity = '0';
    mark.style.transform = '';
    mark.classList.remove('on');
  };
  const root = /** @type {HTMLElement} */ (o.host);
  root.addEventListener('touchstart', e => {
    const s = o.scroller();
    if (e.touches.length !== 1 || !s || !o.can() || s.scrollTop > 0 || !s.contains(/** @type {Node} */ (e.target))) { watching = false; return; }
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; dy = 0; pulling = null; armed = false; watching = true;
    mark.classList.remove('vl-pull-off');
  }, { passive: true, capture: true });
  root.addEventListener('touchmove', e => {
    if (!watching) return;
    const t = e.touches[0];
    if (!t) return;
    const mx = t.clientX - x0, my = t.clientY - y0;
    if (pulling === null) {
      const intent = swipeIntent(mx, my);
      if (!intent) return;
      pulling = intent === 'y' && my > 0;
      if (!pulling) { reset(); return; }
    }
    const owner = captured();
    if ((owner && owner !== 'bounce') || (o.scroller()?.scrollTop ?? 0) > 0) { reset(); return; }
    dy = Math.max(0, my);
    if (!armed && dy >= PULL) { armed = true; haptic('threshold'); }
    else if (armed && dy < PULL) armed = false;
    draw(dy);
  }, { passive: true, capture: true });
  const end = () => {
    if (!watching) return;
    const go = pulling && armed && o.can();
    reset();
    if (go) void o.run();
  };
  root.addEventListener('touchend', end, { capture: true });
  root.addEventListener('touchcancel', () => reset(), { capture: true });
  reset();
  return { el: mark };
}
