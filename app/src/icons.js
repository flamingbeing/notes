// Notes' own Lucide icons (the kit's icons/lucide.js has only the ones it uses itself); drawn by the kit's `icon`.
// Static markup names one with data-icon="pencil"; fillIcons() puts the SVG in. No emoji or text glyphs as icons.
import { icon } from '@core/ui';

/** @typedef {Parameters<typeof icon>[0]} IconNodes */
/** @type {Record<string, IconNodes>} */
export const ICONS = {
  menu: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  pencil: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
  folder: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  settings: [['path', { d: 'M10 5H3' }], ['path', { d: 'M12 19H3' }], ['path', { d: 'M14 3v4' }], ['path', { d: 'M16 15v4' }], ['path', { d: 'M21 5h-7' }], ['path', { d: 'M21 19h-9' }], ['path', { d: 'M8 10v4' }], ['path', { d: 'M21 12h-9' }], ['path', { d: 'M3 12h5' }]],
  arrowLeft: [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
  squareCheck: [['path', { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]],
  redo: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  bookOpen: [['path', { d: 'M12 7v14' }], ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }]],
  type: [['path', { d: 'M12 4v16' }], ['path', { d: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2' }], ['path', { d: 'M9 20h6' }]],
  paperclip: [['path', { d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551' }]],
  calendar: [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }], ['path', { d: 'M3 10h18' }]],
  calendarNext: [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }], ['path', { d: 'M3 10h18' }], ['path', { d: 'm10 13 3 2.5-3 2.5' }]],
  squarePen: [['path', { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }], ['path', { d: 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' }]],
  chevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
  hash: [['path', { d: 'M4 9h16' }], ['path', { d: 'M4 15h16' }], ['path', { d: 'M10 3 8 21' }], ['path', { d: 'M16 3l-2 18' }]],
  fileText: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M10 9H8' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]],
  search: [['circle', { cx: '11', cy: '11', r: '8' }], ['path', { d: 'm21 21-4.3-4.3' }]],
  users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: '9', cy: '7', r: '4' }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  bold: [['path', { d: 'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8' }]],
  italic: [['path', { d: 'M19 4h-9' }], ['path', { d: 'M14 20H5' }], ['path', { d: 'M15 4 9 20' }]],
  heading: [['path', { d: 'M6 12h12' }], ['path', { d: 'M6 20V4' }], ['path', { d: 'M18 20V4' }]],
  list: [['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 18h.01' }], ['path', { d: 'M3 6h.01' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 18h13' }], ['path', { d: 'M8 6h13' }]],
  listOrdered: [['path', { d: 'M10 12h11' }], ['path', { d: 'M10 18h11' }], ['path', { d: 'M10 6h11' }], ['path', { d: 'M4 10h2' }], ['path', { d: 'M4 6h1v4' }], ['path', { d: 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1' }]],
  outdent: [['path', { d: 'M21 12H11' }], ['path', { d: 'M21 18H11' }], ['path', { d: 'M21 6H11' }], ['path', { d: 'm7 8-4 4 4 4' }]],
  indent: [['path', { d: 'M21 12H11' }], ['path', { d: 'M21 18H11' }], ['path', { d: 'M21 6H11' }], ['path', { d: 'm3 8 4 4-4 4' }]],
  link: [['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }], ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]],
  listChecks: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
  trash: [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }], ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }], ['path', { d: 'M10 11v6' }], ['path', { d: 'M14 11v6' }]],
  clipboard: [['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }]],
};

/** @param {string} name @returns {SVGSVGElement} */
export const iconOf = name => icon(ICONS[name]);

/** @param {ParentNode} [root]  every [data-icon] element that is still empty gets its icon */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const name = /** @type {HTMLElement} */ (el).dataset.icon || '';
    if (!el.firstElementChild && Object.hasOwn(ICONS, name)) el.replaceChildren(iconOf(name));
  }
}
