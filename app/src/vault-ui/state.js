// The Vault layout's own state on this device, one per space (localStorage 'notes:vl:<space>'): the last note open,
// the tabs, recent notes, bookmarks, new folders not yet holding a note, the folders opened (every other one starts folded), the sidebars' views, sorts and
// recent searches, the Search and Tags views' choices. Ids, paths and searches only, never a note's text. Cleaned on every read (unknown keys dropped,
// lists capped), and dropped with the kept list on sign-out (dropAll). Pure: the storage is handed in.

export const PREFIX = 'notes:vl:';
const SORTS = ['name-asc', 'name-desc', 'mtime-desc', 'mtime-asc'];

/** @typedef {{ last: string, tabs: string[], active: number, recent: string[], bookmarks: string[], folders: string[],
 *   opened: string[], leftView: string, rightView: string, fileSort: string, searchSort: string, matchCase: boolean,
 *   searchRecent: string[], cmdRecent: string[], searchCollapse: boolean, searchContext: boolean, tagSort: string,
 *   tagNested: boolean, tagShut: string[], mentionsOff: string[], mentionSort: string, mentionFold: boolean,
 *   mentionContext: boolean }} VaultState
 * mentionsOff: the notes with "Backlinks in document" turned off (on for every other note); mentionSort, mentionFold,
 * mentionContext: the Linked mentions block's sort, folded snippets, more context */

/** @returns {VaultState} */
export const blank = () => ({
  last: '', tabs: [], active: 0, recent: [], bookmarks: [], folders: [], opened: [], leftView: 'files', rightView: 'backlinks',
  fileSort: 'name-asc', searchSort: 'relevance', matchCase: false, searchRecent: [], cmdRecent: [],
  searchCollapse: false, searchContext: false, tagSort: 'name', tagNested: true, tagShut: [],
  mentionsOff: [], mentionSort: 'name-asc', mentionFold: false, mentionContext: false,
});

/** strings only, no repeats, each at most `len` long, at most `max` of them @param {unknown} v @param {number} max @param {number} [len] */
const strings = (v, max, len = 400) => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x.length <= len))].slice(0, max) : []);
/** @param {unknown} v @param {string[]} allowed @param {string} dflt */
const oneOf = (v, allowed, dflt) => (typeof v === 'string' && allowed.includes(v) ? v : dflt);

/** a state as stored (anything) -> a clean one @param {unknown} raw @returns {VaultState} */
export function clean(raw) {
  const o = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
  const d = blank();
  // (tabs may repeat a note's id only as empty tabs: '' is the "No file is open" page)
  const tabs = Array.isArray(o.tabs) ? o.tabs.filter(x => typeof x === 'string' && x.length <= 400).slice(0, 12) : [];
  const active = Math.floor(Number(o.active));
  return {
    last: typeof o.last === 'string' && o.last.length <= 400 ? o.last : d.last,
    tabs,
    active: Number.isFinite(active) && active >= 0 && active < Math.max(1, tabs.length) ? active : 0,
    recent: strings(o.recent, 20),
    bookmarks: strings(o.bookmarks, 200),
    folders: strings(o.folders, 200, 200),
    opened: strings(o.opened, 500, 200),
    leftView: oneOf(o.leftView, ['files', 'search', 'tags', 'bookmarks', 'notes'], d.leftView),
    rightView: oneOf(o.rightView, ['backlinks', 'outgoing', 'outline', 'calendar'], d.rightView),
    fileSort: oneOf(o.fileSort, SORTS, d.fileSort),
    searchSort: oneOf(o.searchSort, [...SORTS, 'relevance'], d.searchSort),
    matchCase: o.matchCase === true,
    searchRecent: strings(o.searchRecent, 10, 200),
    cmdRecent: strings(o.cmdRecent, 10, 80),
    searchCollapse: o.searchCollapse === true,
    searchContext: o.searchContext === true,
    tagSort: oneOf(o.tagSort, ['name', 'count'], d.tagSort),
    tagNested: o.tagNested !== false,
    tagShut: strings(o.tagShut, 500, 200),
    mentionsOff: strings(o.mentionsOff, 200),
    mentionSort: oneOf(o.mentionSort, SORTS, d.mentionSort),
    mentionFold: o.mentionFold === true,
    mentionContext: o.mentionContext === true,
  };
}

/** @typedef {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void, length?: number, key?: (i: number) => string | null }} Store */

/**
 * one space's state, kept in the given storage
 * @param {Store} store @param {string} space  the space's id (the person's own notes: their uid)
 */
export function vaultState(store, space) {
  const key = PREFIX + (space || '_');
  /** @returns {VaultState} */
  const load = () => { try { return clean(JSON.parse(store.getItem(key) || 'null')); } catch { return blank(); } };
  let now = load();
  return {
    get: () => now,
    /** change some of it and keep it @param {Partial<VaultState>} part */
    set(part) {
      now = clean({ ...now, ...part });
      try { store.setItem(key, JSON.stringify(now)); } catch { /* storage full or off: kept for now only */ }
      return now;
    },
    reload() { now = load(); return now; },
  };
}

/** every space's state gone (sign-out) @param {Store} store */
export function dropAll(store) {
  try {
    /** @type {string[]} */
    const keys = [];
    for (let i = 0; i < (store.length || 0); i++) { const k = store.key?.(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    for (const k of keys) store.removeItem(k);
  } catch { /* storage off */ }
}
