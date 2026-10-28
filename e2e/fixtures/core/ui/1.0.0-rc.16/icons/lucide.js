// Icons from Lucide (https://lucide.dev, ISC licence), drawn as SVG on a 24-grid with the text colour. Only the icons
// below ship: each is its own named export, so an app that imports `icon` and `check` carries just those two. Add one
// by copying its nodes from lucide.dev: [tag, attributes] pairs, nothing else. No emoji or text glyphs as icons
// anywhere in the core (tools/check.mjs fails on them).
const NS = 'http://www.w3.org/2000/svg';

/** @typedef {readonly (readonly [string, Readonly<Record<string, string | number>>])[]} IconNodes */

/** @type {IconNodes} */ export const check = [['path', { d: 'M20 6 9 17l-5-5' }]];
/** @type {IconNodes} */ export const x = [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]];
/** @type {IconNodes} */ export const chevronLeft = [['path', { d: 'm15 18-6-6 6-6' }]];
/** @type {IconNodes} */ export const chevronRight = [['path', { d: 'm9 18 6-6-6-6' }]];
/** @type {IconNodes} */ export const menu = [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]];
/** @type {IconNodes} */ export const info = [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]];
/** @type {IconNodes} */ export const refreshCw = [['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }], ['path', { d: 'M21 3v5h-5' }],
  ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }], ['path', { d: 'M8 16H3v5' }]];
/** @type {IconNodes} */ export const cloudOff = [['path', { d: 'm2 2 20 20' }], ['path', { d: 'M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193' }],
  ['path', { d: 'M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07' }]];
/** @type {IconNodes} */ export const triangleAlert = [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
  ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]];
/** @type {IconNodes} */ export const loaderCircle = [['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }]];
/** @type {IconNodes} */ export const gripVertical = [['circle', { cx: 9, cy: 12, r: 1 }], ['circle', { cx: 9, cy: 5, r: 1 }], ['circle', { cx: 9, cy: 19, r: 1 }],
  ['circle', { cx: 15, cy: 12, r: 1 }], ['circle', { cx: 15, cy: 5, r: 1 }], ['circle', { cx: 15, cy: 19, r: 1 }]];

/**
 * An icon as an <svg class="ui-icon"> (hidden from screen readers: the button or chip around it carries the name).
 * Sized by `.ui-icon` in ui.css (1.25em); stroke and fill come from the text colour.
 * @param {IconNodes} nodes  one of the exports above
 * @param {{ class?: string }} [o]  class: added after ui-icon
 * @returns {SVGSVGElement}
 */
export function icon(nodes, o = {}) {
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(NS, 'svg'));
  const set = /** @type {(e: Element, a: Record<string, string | number>) => void} */ ((e, a) => { for (const k in a) e.setAttribute(k, String(a[k])); });
  set(svg, { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false', class: o.class ? `ui-icon ${o.class}` : 'ui-icon' });
  for (const [tag, attrs] of nodes) { const n = document.createElementNS(NS, tag); set(n, attrs); svg.append(n); }
  return svg;
}
