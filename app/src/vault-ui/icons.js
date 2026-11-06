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
