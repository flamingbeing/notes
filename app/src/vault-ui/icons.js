// The Vault layout's glyphs: Lucide icons (lucide.dev, ISC licence), copied by hand from their SVG files as node lists
// for the kit's `icon`. Loaded with the Vault shell, not with the app.
import { icon } from '@core/ui';

/** @typedef {Parameters<typeof icon>[0]} IconNodes */
/** @type {Record<string, IconNodes>} */
export const GLYPHS = {
  panelLeft: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M9 3v18' }]],
  bookOpen: [['path', { d: 'M12 7v14' }], ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }]],
  pencilLine: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z' }], ['path', { d: 'm15 5 3 3' }]],
  ellipsisVertical: [['circle', { cx: '12', cy: '12', r: '1' }], ['circle', { cx: '12', cy: '5', r: '1' }], ['circle', { cx: '12', cy: '19', r: '1' }]],
  chevronLeft: [['path', { d: 'm15 18-6-6 6-6' }]],
  chevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
  search: [['circle', { cx: '11', cy: '11', r: '8' }], ['path', { d: 'm21 21-4.3-4.3' }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  calendar: [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }], ['path', { d: 'M3 10h18' }]],
  calendarPlus: [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['path', { d: 'M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8' }], ['path', { d: 'M3 10h18' }], ['path', { d: 'M16 19h6' }], ['path', { d: 'M19 16v6' }]],
  calendarArrowUp: [['path', { d: 'm14 18 4-4 4 4' }], ['path', { d: 'M16 2v4' }], ['path', { d: 'M18 22v-8' }], ['path', { d: 'M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9' }], ['path', { d: 'M3 10h18' }], ['path', { d: 'M8 2v4' }]],
  squarePen: [['path', { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }], ['path', { d: 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' }]],
  settings: [['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  trash2: [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }], ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }], ['line', { }], ['line', { }]],
  codeXml: [['path', { d: 'm18 16 4-4-4-4' }], ['path', { d: 'm6 8-4 4 4 4' }], ['path', { d: 'm14.5 4-5 16' }]],
  list: [['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 18h.01' }], ['path', { d: 'M3 6h.01' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 18h13' }], ['path', { d: 'M8 6h13' }]],
  feather: [['path', { d: 'M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z' }], ['path', { d: 'M16 8 2 22' }], ['path', { d: 'M17.5 15H9' }]],
  listChecks: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
  wrench: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }]],
  cloud: [['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }]],
  info: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  dices: [['rect', { width: '12', height: '12', x: '2', y: '10', rx: '2', ry: '2' }], ['path', { d: 'm17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6' }], ['path', { d: 'M6 18h.01' }], ['path', { d: 'M10 14h.01' }], ['path', { d: 'M15 6h.01' }], ['path', { d: 'M18 9h.01' }]],
  textSearch: [['path', { d: 'M21 6H3' }], ['path', { d: 'M10 12H3' }], ['path', { d: 'M10 18H3' }], ['circle', { cx: '17', cy: '15', r: '3' }], ['path', { d: 'm21 19-1.9-1.9' }]],
  bookmark: [['path', { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }]],
  sparkles: [['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }], ['path', { d: 'M20 3v4' }], ['path', { d: 'M22 5h-4' }], ['path', { d: 'M4 17v2' }], ['path', { d: 'M5 18H3' }]],
  menu: [['path', { d: 'M4 6h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 18h16' }]],
  terminal: [['path', { d: 'm4 17 6-6-6-6' }], ['path', { d: 'M12 19h8' }]],
  // the left sidebar (slice 2)
  arrowLeftRight: [['path', { d: 'M8 3 4 7l4 4' }], ['path', { d: 'M4 7h16' }], ['path', { d: 'm16 21 4-4-4-4' }], ['path', { d: 'M20 17H4' }]],
  arrowUpNarrowWide: [['path', { d: 'm3 8 4-4 4 4' }], ['path', { d: 'M7 4v16' }], ['path', { d: 'M11 12h4' }], ['path', { d: 'M11 16h7' }], ['path', { d: 'M11 20h10' }]],
  bookmarkMinus: [['path', { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }], ['line', { x1: '15', x2: '9', y1: '10', y2: '10' }]],
  bookmarkPlus: [['path', { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }], ['line', { x1: '12', x2: '12', y1: '7', y2: '13' }], ['line', { x1: '15', x2: '9', y1: '10', y2: '10' }]],
  chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  chevronsDownUp: [['path', { d: 'm7 20 5-5 5 5' }], ['path', { d: 'm7 4 5 5 5-5' }]],
  chevronsUpDown: [['path', { d: 'm7 15 5 5 5-5' }], ['path', { d: 'm7 9 5-5 5 5' }]],
  circleDot: [['circle', { cx: '12', cy: '12', r: '10' }], ['circle', { cx: '12', cy: '12', r: '1' }]],
  circleX: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'm15 9-6 6' }], ['path', { d: 'm9 9 6 6' }]],
  circle: [['circle', { cx: '12', cy: '12', r: '10' }]],
  copy: [['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }], ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]],
  filePlus: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M9 15h6' }], ['path', { d: 'M12 18v-6' }]],
  folderInput: [['path', { d: 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1' }], ['path', { d: 'M2 13h10' }], ['path', { d: 'm9 16 3-3-3-3' }]],
  folderOpen: [['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' }]],
  folderPlus: [['path', { d: 'M12 10v6' }], ['path', { d: 'M9 13h6' }], ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  folder: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  galleryVerticalEnd: [['path', { d: 'M7 2h10' }], ['path', { d: 'M5 6h14' }], ['rect', { width: '18', height: '12', x: '3', y: '10', rx: '2' }]],
  link2: [['path', { d: 'M9 17H7A5 5 0 0 1 7 7h2' }], ['path', { d: 'M15 7h2a5 5 0 1 1 0 10h-2' }], ['line', { x1: '8', x2: '16', y1: '12', y2: '12' }]],
  link: [['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }], ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]],
  listTree: [['path', { d: 'M21 12h-8' }], ['path', { d: 'M21 6H8' }], ['path', { d: 'M21 18h-8' }], ['path', { d: 'M3 6v4c0 1.1.9 2 2 2h3' }], ['path', { d: 'M3 10v6c0 1.1.9 2 2 2h3' }]],
  pencil: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
  slidersHorizontal: [['line', { x1: '21', x2: '14', y1: '4', y2: '4' }], ['line', { x1: '10', x2: '3', y1: '4', y2: '4' }], ['line', { x1: '21', x2: '12', y1: '12', y2: '12' }], ['line', { x1: '8', x2: '3', y1: '12', y2: '12' }], ['line', { x1: '21', x2: '16', y1: '20', y2: '20' }], ['line', { x1: '12', x2: '3', y1: '20', y2: '20' }], ['line', { x1: '14', x2: '14', y1: '2', y2: '6' }], ['line', { x1: '8', x2: '8', y1: '10', y2: '14' }], ['line', { x1: '16', x2: '16', y1: '18', y2: '22' }]],
  tags: [['path', { d: 'm15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19' }], ['path', { d: 'M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z' }], ['circle', { cx: '6.5', cy: '9.5', r: '.5', fill: 'currentColor' }]],
  type: [['polyline', { points: '4 7 4 4 20 4 20 7' }], ['line', { x1: '9', x2: '15', y1: '20', y2: '20' }], ['line', { x1: '12', x2: '12', y1: '4', y2: '20' }]],
  // (the sidebar button while the sidebar is open: the panel's left part filled)
  panelLeftFilled: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M5 3h4v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', fill: 'currentColor' }]],
  // the note page (the mobile toolbar, Linked mentions, the note menu, Find)
  undo2: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]],
  redo2: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]],
  brackets: [['path', { d: 'M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3' }], ['path', { d: 'M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3' }]],
  hash: [['line', { x1: '4', x2: '20', y1: '9', y2: '9' }], ['line', { x1: '4', x2: '20', y1: '15', y2: '15' }], ['line', { x1: '10', x2: '8', y1: '3', y2: '21' }], ['line', { x1: '16', x2: '14', y1: '3', y2: '21' }]],
  paperclip: [['path', { d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551' }]],
  heading: [['path', { d: 'M18 20V4' }], ['path', { d: 'M6 12H18' }], ['path', { d: 'M6 20V4' }]],
  bold: [['path', { d: 'M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8' }]],
  italic: [['line', { x1: '19', x2: '10', y1: '4', y2: '4' }], ['line', { x1: '14', x2: '5', y1: '20', y2: '20' }], ['line', { x1: '15', x2: '9', y1: '4', y2: '20' }]],
  strikethrough: [['path', { d: 'M16 4H9a3 3 0 0 0-2.83 4' }], ['path', { d: 'M14 12a4 4 0 0 1 0 8H6' }], ['line', { x1: '4', x2: '20', y1: '12', y2: '12' }]],
  highlighter: [['path', { d: 'm9 11-6 6v3h9l3-3' }], ['path', { d: 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4' }]],
  indentIncrease: [['path', { d: 'M21 5H11' }], ['path', { d: 'M21 12H11' }], ['path', { d: 'M21 19H11' }], ['path', { d: 'm3 8 4 4-4 4' }]],
  indentDecrease: [['path', { d: 'M21 5H11' }], ['path', { d: 'M21 12H11' }], ['path', { d: 'M21 19H11' }], ['path', { d: 'm7 8-4 4 4 4' }]],
  keyboardOff: [['path', { d: 'M 20 4 A2 2 0 0 1 22 6' }], ['path', { d: 'M 22 6 L 22 16.41' }], ['path', { d: 'M 7 16 L 16 16' }], ['path', { d: 'M 9.69 4 L 20 4' }], ['path', { d: 'M14 8h.01' }], ['path', { d: 'M18 8h.01' }], ['path', { d: 'm2 2 20 20' }], ['path', { d: 'M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2' }], ['path', { d: 'M6 8h.01' }], ['path', { d: 'M8 12h.01' }]],
  arrowUpDown: [['path', { d: 'm21 16-4 4-4-4' }], ['path', { d: 'M17 20V4' }], ['path', { d: 'm3 8 4-4 4 4' }], ['path', { d: 'M7 4v16' }]],
  arrowUpRight: [['path', { d: 'M7 7h10v10' }], ['path', { d: 'M7 17 17 7' }]],
  chevronUp: [['path', { d: 'm18 15-6-6-6 6' }]],
};

/**
 * One glyph as an <svg> (hidden from screen readers: the button around it carries the name), drawn at stroke 1.75.
 * @param {keyof typeof GLYPHS | string} name @param {string} [cls]  added to its class
 */
export function glyph(name, cls = '') {
  const svg = icon(GLYPHS[name] || GLYPHS.x, { class: `vl-icon${cls ? ` ${cls}` : ''}` });
  svg.setAttribute('stroke-width', '1.75');
  return svg;
}
