// The Vault layout's side drawer (left now, right later): a full-height panel that slides in from its side while the
// note (and the navigation pill) slide the other way by its width, a shade over the strip of note still showing.
// Opened by a button or by a sideways swipe that starts on the note (never at the screen's edge: that is the phone's
// Back), following the finger; closed by a tap on the shade, a swipe back, Back (the app's transients) or Esc.
// It moves only by transform and opacity: the finger's place as it moves, the kit's spring (glide) as it lets go,
// the kit's arbiter (claim) so a swipe that is the drawer's is no one else's. Reduced motion: it fades, nothing slides.
import { claim, glide, still, tracker } from '@core/ui';
import { transients } from '../shell/transients.js';

const EDGE = 24;          // px from the screen's edge: the phone's own Back gesture
const SLOP = 12;          // px a finger goes sideways before the drawer takes it
const RATIO = 1.5;        // sideways at least this much more than up or down
const FLING = 0.3;        // px/ms: a let-go this fast opens (or closes) whatever the distance
const OPEN_AT = 0.4;      // past this much of its width, a let-go opens it
const TAP_RESPONSE = 0.16;   // s: the spring of a tap's open or close (lands in about 200 ms, slowing down)

/**
 * @param {{ id: string, label: string, side?: 'left' | 'right', pushed: () => (HTMLElement | null)[],
 *   onChange?: (open: boolean) => void, onOpen?: () => void }} o
 *   pushed: what slides aside with it (the note, the pill); onChange: opening or closing (the button's look);
 *   onOpen: it is about to show (fill it)
 */
export function sideDrawer({ id, label, side = 'left', pushed, onChange, onOpen }) {
  const d = document.createElement('dialog');
  d.id = id;
  d.className = `vl-drawer vl-drawer-${side}`;
  d.setAttribute('aria-label', label);
  d.tabIndex = -1;
  const shade = Object.assign(document.createElement('div'), { className: 'vl-drawer-shade' });
  shade.setAttribute('aria-hidden', 'true');
  document.body.append(shade, d);
  const sign = side === 'left' ? 1 : -1;
  const width = () => d.getBoundingClientRect().width || Math.min(417, innerWidth * 0.84);

  /** @type {ReturnType<typeof glide> | null} */
  let run = null;
  let x = 0;          // how far open, 0 (shut) to its width
  let shown = false;  // open, or opening (the button's look)
  /** the styles for a place @param {number} at @param {number} w */
  const frames = (at, w) => {
    const calm = still();
    const k = Math.max(0, Math.min(1, at / w));
    return {
      drawer: calm ? { transform: 'none', opacity: String(k) } : { transform: `translateX(${sign * (at - w)}px)`, opacity: '1' },
      push: calm ? { transform: 'none' } : { transform: `translateX(${sign * at}px)` },
      shade: { opacity: String(k) },
    };
  };
  const moved = () => pushed().filter(/** @returns {e is HTMLElement} */ e => !!e);
  /** at a place now (a finger's, or the end of a glide) @param {number} at */
  const put = at => {
    x = at;
    const f = frames(at, width());
    Object.assign(d.style, f.drawer);
    // (open, it has no transform: a fixed child, a toast say, sits on the screen, not in the drawer's box)
    if (at >= width() - 0.5) d.style.transform = 'none';
    for (const e of moved()) e.style.transform = at > 0 && f.push.transform !== 'none' ? f.push.transform : '';
    shade.style.opacity = f.shade.opacity;
  };
  /** glide to `to` from where it is, at the finger's speed @param {number} to @param {number} [v] @param {boolean} [tap] */
  const move = async (to, v = 0, tap = false) => {
    const from = run ? run.stop() : x;
    run = null;
    const w = width();
    if (Math.abs(from - to) < 1) { put(to); return true; }
    const g = glide([
      [d, at => frames(at, w).drawer],
      ...moved().map(e => /** @type {[Element, (at: number) => Keyframe]} */ ([e, at => frames(at, w).push])),
      [shade, at => frames(at, w).shade],
    ], from, to, sign * v, tap ? { response: TAP_RESPONSE } : undefined);
    run = g;
    const landed = await g.done;
    if (run === g) { run = null; put(to); g.stop(); }
    return landed;
  };

  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let step = null;
  /** @param {boolean} on */
  const look = on => { if (shown !== on) { shown = on; onChange?.(on); } };
  /** shown, not yet modal (a finger is pulling it): over the page, its own layer */
  const reveal = () => {
    if (d.open) return;
    onOpen?.();
    shade.classList.add('on');
    document.documentElement.classList.add('vl-drawer-on');
    d.show();
    put(0);
  };
  /** fully open: modal (the page under it out of reach), a Back step */
  const settle = () => {
    if (!d.matches(':modal')) { d.close(); d.showModal(); }
    d.focus({ preventScroll: true });
    step ||= transients().open(() => { step = null; void hide(); });
  };
  let shutting = /** @type {Promise<void> | null} */ (null);
  /** slide away and close (its Back step already gone) @param {number} [v] @param {boolean} [tap] */
  const hide = (v = 0, tap = !v) => (shutting ||= (async () => {
    look(false);
    await move(0, v, tap);
    if (!shown) {
      d.close();
      shade.classList.remove('on');
      document.documentElement.classList.remove('vl-drawer-on');
      for (const e of moved()) e.style.transform = '';
    }
    shutting = null;
  })());

  const open = async (v = 0) => {
    look(true);
    // (the keyboard goes down: nothing typed under the drawer)
    const a = /** @type {HTMLElement | null} */ (document.activeElement);
    if (a && a !== document.body && !d.contains(a)) a.blur();
    reveal();
    const tap = !v && !run && x === 0;
    settle();
    await move(width(), v, tap);
  };
  /** closed, its Back step taken back too -> once it has gone @param {number} [v] */
  const close = async (v = 0) => {
    const s = step;
    step = null;
    await Promise.all([s?.close(), hide(v)]);
  };
  /** closed, without waiting for the slide: once its Back step is gone (so a page opened next is a step of its own) */
  const leave = async () => {
    if (!shown && !step) return;
    const s = step;
    step = null;
    void hide();
    await s?.close();
  };
  const isOpen = () => d.open && shown;
  d.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  // a tap on the shade (outside the drawer's box)
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (side === 'left' ? e.clientX > r.right : e.clientX < r.left) void close();
  });

  // ---- the finger: a swipe on the note opens it, a swipe on it (or the shade) shuts it
  const speed = tracker();
  /** @type {{ x: number, y: number, on: boolean, from: number, opening: boolean } | null} */
  let t = null;
  /** @param {TouchEvent} e @param {boolean} opening @param {() => boolean} [can] */
  const down = (e, opening, can = () => true) => {
    t = null;
    if (e.touches.length !== 1 || !can()) return;
    const p = e.touches[0];
    t = { x: p.clientX, y: p.clientY, on: false, from: opening ? 0 : width(), opening };
    speed.reset(e.timeStamp, p.clientX);
  };
  /** @param {TouchEvent} e */
  const follow = e => {
    if (!t) return;
    const p = e.touches[0];
    const dx = (p.clientX - t.x) * sign, dy = p.clientY - t.y;
    if (!t.on) {
      if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return;
      const way = t.opening ? dx > 0 : dx < 0;
      if (!way || Math.abs(dx) <= RATIO * Math.abs(dy) || Math.abs(dx) <= SLOP || !claim('drawer')) { t = null; return; }
      t.on = true;
      t.x = p.clientX;   // (from here, so it doesn't jump by the slop)
      t.from = run ? run.stop() : x;
      run = null;
      if (t.opening) {
        look(true);
        const a = /** @type {HTMLElement | null} */ (document.activeElement);
        if (a && a !== document.body) a.blur();
        reveal();
      }
    }
    if (e.cancelable) e.preventDefault();
    speed.add(e.timeStamp, p.clientX);
    put(Math.max(0, Math.min(width(), t.from + (p.clientX - t.x) * sign)));
  };
  /** @param {TouchEvent} e */
  const up = e => {
    const was = t;
    t = null;
    if (!was?.on) return;
    const v = e.type === 'touchend' ? speed.speed(e.timeStamp) * sign : 0;
    const w = width();
    const opens = v > FLING || (v > -FLING && x > w * OPEN_AT);
    if (opens) { void open(v); return; }
    if (step) void close(v); else void hide(v);
  };
  d.addEventListener('touchstart', e => down(e, false, () => isOpen()), { passive: true });
  d.addEventListener('touchmove', follow, { passive: false });
  d.addEventListener('touchend', up);
  d.addEventListener('touchcancel', up);

  /**
   * A swipe on this element opens the drawer (not from the screen's edge, not in a sideways scroller, not with text
   * selected). edge: how far in from the edge the swipe must start (more when the edge swipe is another's).
   * @param {HTMLElement} el @param {{ can?: () => boolean, edge?: () => number }} [o]
   */
  const swipeFrom = (el, { can = () => true, edge = () => EDGE } = {}) => {
    /** @param {EventTarget | null} target */
    const scroller = target => {
      for (let n = target instanceof Element ? target : null; n && n !== el; n = n.parentElement)
        if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
      return false;
    };
    const selected = () => !(getSelection()?.isCollapsed ?? true);
    el.addEventListener('touchstart', e => {
      const p = e.touches[0];
      const from = side === 'left' ? p?.clientX : innerWidth - (p?.clientX ?? 0);
      down(e, true, () => !d.open && can() && from >= edge() && !scroller(e.target) && !selected());
    }, { passive: true });
    el.addEventListener('touchmove', follow, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
  };

  return { el: d, open: () => open(), close: () => close(), leave, toggle: () => (isOpen() ? close() : open()), isOpen, swipeFrom, EDGE };
}
