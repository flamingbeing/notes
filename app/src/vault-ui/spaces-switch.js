// The space switcher (the left sidebar's space row): the person's own notes and each shared space they are in, a radio
// on the one open; "Manage spaces..." opens the members sheet of the open shared space (spaces/spaces-sheet.js), and
// New space its New space sheet, for those who may make one. Switching sends every unsent save first (cloud.js).
import { bottomSheet } from './sheet.js';

/** @param {{ app: import('../cloud.js').Started, list: ReturnType<typeof import('../screens/list.js').listScreen>, toast: (m: string) => unknown }} o */
export function spacesSwitch({ app, list, toast }) {
  /** @param {string} id */
  const go = async id => {
    const why = await app.switchTo(id);
    if (why) toast(why);
  };
  /** a button of the spaces sheet, there on the page (hidden in this layout) @param {string} sel */
  const press = sel => /** @type {HTMLElement | null} */ (document.querySelector(sel))?.click();
  const sheet = bottomSheet({ id: 'vl-spaces-sheet', label: 'Spaces', cards: () => {
    const here = app.space().id;
    const mine = app.vault();
    const shared = app.space().id !== mine;
    const make = list.role() === 'admin' || list.role() === 'member';
    return [
      { title: 'Spaces', rows: [
        { id: 'vl-space-mine', icon: 'folder', label: 'My notes', radio: here === mine, run: () => void go(mine) },
        ...app.spaces().map(s => ({ id: `vl-space-${s.id}`, icon: 'folder', label: s.role === 'view' ? `${s.name} (view only)` : s.name, radio: s.id === here, run: () => void go(s.id) })),
      ] },
      { rows: [
        { id: 'vl-space-manage', icon: 'settings', label: 'Manage spaces...', disabled: !shared, hint: shared ? undefined : 'Open a shared space first', run: () => press('#space-open') },
        ...(make ? [{ id: 'vl-space-new', icon: 'plus', label: 'New space', run: () => press('#space-new') }] : []),
      ] },
    ];
  } });
  return { open: () => sheet.open() };
}
