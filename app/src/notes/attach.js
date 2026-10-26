// Attachments in a note: a photo or file is a record in the space's `files` collection (`item` = the note it was added
// to, `path` = its folder when it came from a vault), and the note's text names it the way Obsidian does: `![[name]]`
// or `![alt](folder/name)`. Pure, no DOM (tested in app/test/attach.unit.test.mjs).

/** @typedef {{ id: string, name: string, type: string, path?: string, item?: string, state?: string, _deleted?: boolean }} Att */

export const IMAGE = /^image\/(png|jpeg|webp|gif|avif)$/;

/** @param {{ type: string }} a */
export const isImage = a => IMAGE.test(a.type);

/** @param {Att} a -> the attachment's path in a vault: `folder/name` */
export const fullPath = a => (a.path ? `${a.path}/${a.name}` : a.name);

/** @param {string} s */
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };

/** a reference as written (`a%20b.png`, `./img/a.png#x`, `a.png|200`) -> 'img/a.png' @param {string} ref */
export function cleanRef(ref) {
  return decode(String(ref)).split('|')[0].replace(/#.*$/, '').trim().replace(/\\/g, '/').replace(/^(?:\.{1,2}\/|\/)+/, '').replace(/\/{2,}/g, '/');
}

/**
 * The attachment a reference means: the full path, else a path ending in it, else the name alone; of several, the
 * shortest path (then the name). Case doesn't matter. null if none.
 * @template {Att} T @param {T[]} atts @param {string} ref @returns {T | null}
 */
export function resolveAttachment(atts, ref) {
  const want = cleanRef(ref).toLowerCase();
  if (!want) return null;
  const live = atts.filter(a => !a._deleted);
  const order = (/** @type {T[]} */ list) => list.sort((a, b) => fullPath(a).length - fullPath(b).length || fullPath(a).localeCompare(fullPath(b)))[0] || null;
  const exact = live.filter(a => fullPath(a).toLowerCase() === want);
  if (exact.length) return order(exact);
  const tail = live.filter(a => fullPath(a).toLowerCase().endsWith('/' + want));
  if (tail.length) return order(tail);
  const base = want.split('/').at(-1);
  return order(live.filter(a => a.name.toLowerCase() === base));
}

/** a name no attachment in the space has (`photo.png` -> `photo 2.png`) @param {Att[]} atts @param {string} name */
export function uniqueName(atts, name) {
  const taken = new Set(atts.filter(a => !a._deleted && !a.path).map(a => a.name.toLowerCase()));
  const clean = name.replace(/[\\/]/g, '-').trim().slice(0, 200) || 'file';
  if (!taken.has(clean.toLowerCase())) return clean;
  const dot = clean.lastIndexOf('.'), stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : '';
  for (let n = 2; ; n++) if (!taken.has(`${stem} ${n}${ext}`.toLowerCase())) return `${stem} ${n}${ext}`;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
/** the name a pasted picture gets (Obsidian's: `Pasted image 20261026-214800.png`) @param {string} type @param {Date} [d] */
export function pastedName(type, d = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `Pasted image ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${EXT[/** @type {keyof typeof EXT} */ (type)] || 'bin'}`;
}

/** the text a note gets for an attachment @param {Att} a */
export const embedFor = a => `![[${fullPath(a)}]]`;
