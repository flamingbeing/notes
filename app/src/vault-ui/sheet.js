// The Vault layout's bottom sheets (menus, the ribbon, the open tabs, pickers): the kit's vault menu sheet (app-ui
// ui/vault/menu-sheet.js: grouped cards of rows on a grey sheet from the bottom; Back, Esc, a tap on the shade or a
// drag of its top down closes it), given the app's Back steps (its transients) and its glyphs by name. The one shade
// here is for the find-as-you-type sheet (pick-sheet.js), which is Notes' own.
import { menuSheet } from '@core/ui/vault';
import { transients } from '../shell/transients.js';
import { GLYPHS } from './icons.js';

/**
 * @typedef {{ id?: string, icon?: string, label: string, run: () => unknown, ticked?: boolean, danger?: boolean, next?: boolean, hint?: string,
 *   radio?: boolean, disabled?: boolean, sub?: string, aside?: { id?: string, icon: string, label: string, run: () => unknown } }} Row
 *   ticked: an on-state (a tick at the end); next: opens another list (a chevron); danger: red (a delete); radio: one of
 *   a choice (a radio at the end, filled on the one chosen); disabled: shown, not tappable (the hint says why); sub: a
 *   second, smaller line (a note's folder); aside: a button of its own at the end (a tab's close), the sheet left open
 * @typedef {{ rows: Row[], title?: string }} Card
 */

let shade = /** @type {HTMLElement | null} */ (null);
/** the find-as-you-type sheet's shade (below the top layer, so the sheet's own backdrop takes the taps) */
export const shadeEl = () => {
  if (!shade) { shade = Object.assign(document.createElement('div'), { className: 'vl-shade' }); document.body.append(shade); }
  return shade;
};

/** @param {string | undefined} name */
const nodes = name => (name ? GLYPHS[name] || GLYPHS.x : undefined);

/**
 * @param {{ id: string, label: string | (() => string), cards: () => Card[], heading?: () => string }} o  cards: what it
 *   shows, read each time it opens (and label: what it is for, when it changes too); heading: a title over the cards
 */
export function bottomSheet({ id, label, cards, heading }) {
  return menuSheet({
    id, label, heading, steps: transients(),
    cards: () => cards().map(c => ({
      title: c.title,
      rows: c.rows.map(r => ({ ...r, icon: nodes(r.icon), aside: r.aside && { ...r.aside, icon: /** @type {import('./icons.js').IconNodes} */ (nodes(r.aside.icon)) } })),
    })),
  });
}
