// The Vault layout's navigation, as plain data (pure: the unit tests read it in Node).
// history(): a mirror of the browser's note steps (#/note/<id>, each with n = its place from the first note), so the
// navigation pill knows when Back and Forward have somewhere to go. tabs(): the notes open as tabs (at most 12), one
// of them showing; '' is a tab with no note (the "No file is open" page).

export const MAX_TABS = 12;

/** the note steps as the browser has them */
export function history() {
  /** @type {string[]} */
  let stack = [];
  let at = -1;
  return {
    /**
     * a note shown at step n (1 is the first)
     * @param {string} id @param {number} n @param {boolean} pushed  a new step (the steps after it are gone), not Back or Forward
     */
    visit(id, n, pushed) {
      const i = Math.max(0, Math.floor(Number(n) || 1) - 1);
      if (pushed) stack = stack.slice(0, i);
      while (stack.length < i) stack.push('');
      stack[i] = id;
      at = i;
    },
    /** the open note left the steps (a new tab, Close): no step is current */
    clear() { stack = []; at = -1; },
    canBack: () => at > 0,
    canFwd: () => at >= 0 && at < stack.length - 1,
    /** the note one step back or forward ('' if none) @param {-1 | 1} d */
    peek: d => stack[at + d] ?? '',
    get at() { return at; },
    get ids() { return [...stack]; },
  };
}

/** @param {{ tabs?: string[], active?: number }} [start] */
export function tabs(start = {}) {
  let list = Array.isArray(start.tabs) ? start.tabs.filter(x => typeof x === 'string').slice(0, MAX_TABS) : [];
  if (!list.length) list = [''];
  let active = Math.min(Math.max(0, Math.floor(Number(start.active) || 0)), list.length - 1);
  return {
    get list() { return [...list]; },
    get active() { return active; },
    /** the note in the tab showing ('' : none) */
    current: () => list[active] ?? '',
    /** the tab showing now shows this note @param {string} id */
    show(id) { list[active] = id; },
    /** a new tab (the empty page; the oldest other tab goes past the cap) -> its index */
    newTab(id = '') {
      if (list.length >= MAX_TABS) { const drop = active === 0 ? 1 : 0; list.splice(drop, 1); if (drop < active) active--; }
      list.splice(active + 1, 0, id);
      active++;
      return active;
    },
    /** a note opened in its own tab: the tab it is in already, else a new one @param {string} id */
    open(id) {
      const have = list.indexOf(id);
      if (id && have >= 0) { active = have; return active; }
      return this.newTab(id);
    },
    /** show tab i @param {number} i */
    activate(i) { if (i >= 0 && i < list.length) active = i; return active; },
    /** close tab i (default: the one showing); the last tab left becomes empty -> the note now showing ('' : none) @param {number} [i] */
    close(i = active) {
      if (i < 0 || i >= list.length) return list[active] ?? '';
      list.splice(i, 1);
      if (!list.length) { list = ['']; active = 0; } else if (i < active) active--; else if (active >= list.length) active = list.length - 1;
      return list[active] ?? '';
    },
    /** every tab closed: one empty tab left -> '' */
    closeAll() { list = ['']; active = 0; return ''; },
    /** a note gone (deleted): its tabs show nothing @param {string} id */
    forget(id) { list = list.map(x => (x === id ? '' : x)); },
  };
}
