// The left sidebar's trees (pure: the unit tests read it in Node). buildTree: the notes as folders and files, folders
// first, in the order asked (file name A to Z or Z to A, modified time new to old or old to new), with folders made on
// this device that hold no note yet; how many files and folders there are. tagTree: every tag and how many notes have
// it, nested by "/" (a/b sits under a), one entry per tag whatever its case.

/** @typedef {{ id: string, title?: string, path?: string, tags?: string[], updatedAt?: unknown }} NoteLike */
/** @typedef {{ kind: 'folder', name: string, path: string, depth: number, kids: TreeNode[] }} FolderNode */
/** @typedef {{ kind: 'note', id: string, name: string, path: string, depth: number, mtime: number }} NoteNode */
/** @typedef {FolderNode | NoteNode} TreeNode */
/** @typedef {{ name: string, full: string, count: number, depth: number, kids: TagNode[] }} TagNode */

export const SORTS = /** @type {const} */ (['name-asc', 'name-desc', 'mtime-desc', 'mtime-asc']);

const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** @param {unknown} v */
const time = v => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);
/** a folder path tidied: no slashes at the ends, no empty parts @param {unknown} p */
export const cleanPath = p => String(p ?? '').split('/').map(s => s.trim()).filter(Boolean).join('/');

/**
 * @param {NoteLike[]} notes
 * @param {string[]} [extra]  folders made on this device that may hold no note yet
 * @param {string} [sort]  one of SORTS
 * @returns {{ root: FolderNode, files: number, folders: number, paths: string[] }}  paths: every folder, sorted by path
 */
export function buildTree(notes, extra = [], sort = 'name-asc') {
  const root = /** @type {FolderNode} */ ({ kind: 'folder', name: '', path: '', depth: -1, kids: [] });
  /** @type {Map<string, FolderNode>} */
  const byPath = new Map([['', root]]);
  /** the folder at a path, made with the folders above it @param {string} path @returns {FolderNode} */
  const folder = path => {
    const have = byPath.get(path);
    if (have) return have;
    const cut = path.lastIndexOf('/');
    const up = folder(cut < 0 ? '' : path.slice(0, cut));
    const f = /** @type {FolderNode} */ ({ kind: 'folder', name: path.slice(cut + 1), path, depth: up.depth + 1, kids: [] });
    up.kids.push(f);
    byPath.set(path, f);
    return f;
  };
  for (const p of extra) { const c = cleanPath(p); if (c) folder(c); }
  for (const n of notes) {
    const f = folder(cleanPath(n.path));
    f.kids.push({ kind: 'note', id: n.id, name: String(n.title || '') || 'Untitled', path: f.path, depth: f.depth + 1, mtime: time(n.updatedAt) });
  }
  const desc = sort === 'name-desc';
  /** @param {TreeNode} a @param {TreeNode} b */
  const order = (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    // (folders have no time of their own: by name, Z to A only when files are)
    if (a.kind === 'note' && b.kind === 'note' && sort.startsWith('mtime')) {
      const d = sort === 'mtime-desc' ? b.mtime - a.mtime : a.mtime - b.mtime;
      if (d) return d;
    }
    const n = coll.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return desc ? -n : n;
  };
  /** @param {FolderNode} f */
  const sortIn = f => { f.kids.sort(order); for (const k of f.kids) if (k.kind === 'folder') sortIn(k); };
  sortIn(root);
  const paths = [...byPath.keys()].filter(Boolean).sort();
  return { root, files: notes.length, folders: paths.length, paths };
}

/**
 * The rows to show: the tree in order, depth first, without what is inside a shut folder.
 * @param {FolderNode} root @param {(path: string) => boolean} isShut
 * @returns {TreeNode[]}
 */
export function visibleRows(root, isShut) {
  /** @type {TreeNode[]} */
  const out = [];
  /** @param {FolderNode} f */
  const walk = f => {
    for (const k of f.kids) {
      out.push(k);
      if (k.kind === 'folder' && !isShut(k.path)) walk(k);
    }
  };
  walk(root);
  return out;
}

/** the folders above a path, nearest last ('a/b/c' -> ['a', 'a/b']) @param {string} path */
export const foldersAbove = path => {
  const parts = cleanPath(path).split('/').filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
};

/**
 * Folders made on this device that now hold a note (or sit above one) are no longer needed: the notes show them.
 * @param {string[]} extra @param {NoteLike[]} notes @returns {string[]}  the ones still empty
 */
export function stillEmpty(extra, notes) {
  const used = new Set(notes.flatMap(n => foldersAbove(String(n.path || ''))));
  return extra.map(cleanPath).filter(p => p && !used.has(p));
}

/**
 * A folder renamed: the new path of a path in or under it (others as they are).
 * @param {string} path @param {string} from @param {string} to
 */
export function movedPath(path, from, to) {
  const p = cleanPath(path);
  if (p === from) return to;
  return p.startsWith(from + '/') ? to + p.slice(from.length) : p;
}

/**
 * Every tag and how many notes have it, nested by "/": a parent counts each note with it or a tag under it once. One
 * entry per tag whatever its case (shown as first met). Sorted by name, or by count (most first, then name).
 * @param {NoteLike[]} notes @param {{ sort?: 'name' | 'count', nested?: boolean }} [o]
 * @returns {TagNode[]}
 */
export function tagTree(notes, { sort = 'name', nested = true } = {}) {
  /** @type {Map<string, { name: string, ids: Set<string>, own: Set<string> }>} lower-case full tag -> it (own: notes with it itself) */
  const tags = new Map();
  for (const n of notes) {
    for (const raw of n.tags || []) {
      const full = String(raw || '').replace(/^#+/, '').replace(/\/+$/, '');
      if (!full) continue;
      const parts = full.split('/');
      parts.forEach((_, i) => {
        const t = parts.slice(0, i + 1).join('/');
        const k = t.toLowerCase();
        const own = i === parts.length - 1;
        const have = tags.get(k);
        const t2 = have || { name: t, ids: new Set(), own: new Set() };
        t2.ids.add(n.id);
        if (own) t2.own.add(n.id);
        if (!have) tags.set(k, t2);
      });
    }
  }
  /** @param {TagNode} a @param {TagNode} b */
  const order = (a, b) => (sort === 'count' ? b.count - a.count : 0) || coll.compare(a.name, b.name);
  if (!nested) {
    // flat: each tag a note has, by its whole name, counting the notes with it itself
    return [...tags.values()].filter(t => t.own.size).map(t => ({ name: t.name, full: t.name, count: t.own.size, depth: 0, kids: [] })).sort(order);
  }
  /** @type {TagNode[]} */
  const top = [];
  /** @type {Map<string, TagNode>} */
  const nodes = new Map();
  for (const [k, t] of [...tags].sort(([a], [b]) => a.split('/').length - b.split('/').length)) {
    const cut = k.lastIndexOf('/');
    const node = { name: t.name.slice(t.name.lastIndexOf('/') + 1), full: t.name, count: t.ids.size, depth: cut < 0 ? 0 : k.split('/').length - 1, kids: [] };
    nodes.set(k, node);
    (cut < 0 ? top : /** @type {TagNode} */ (nodes.get(k.slice(0, cut))).kids).push(node);
  }
  /** @param {TagNode[]} list */
  const sortAll = list => { list.sort(order); for (const n of list) sortAll(n.kids); };
  sortAll(top);
  return top;
}
