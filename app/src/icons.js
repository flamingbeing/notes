// Notes' own Lucide icons (the kit's icons/lucide.js has only the ones it uses itself); drawn by the kit's `icon`.
// Static markup names one with data-icon="pencil"; fillIcons() puts the SVG in. No emoji or text glyphs as icons.
import { icon } from '@core/ui';

/** @typedef {Parameters<typeof icon>[0]} IconNodes */
/** @type {Record<string, IconNodes>} */
export const ICONS = {
  menu: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  pencil: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
  folder: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  settings: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  arrowLeft: [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
  squareCheck: [['path', { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]],
  redo: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
};

/** @param {string} name @returns {SVGSVGElement} */
export const iconOf = name => icon(ICONS[name]);

/** @param {ParentNode} [root]  every [data-icon] element that is still empty gets its icon */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) if (!el.firstElementChild) el.replaceChildren(iconOf(/** @type {HTMLElement} */ (el).dataset.icon || ''));
}
