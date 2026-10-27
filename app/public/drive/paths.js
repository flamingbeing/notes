// Where a note goes in Drive: Notes/<space>/<its folder>/<title>.md. Each part is made safe for Drive; two notes that would
// share a file get the start of the second one's id in the name, in a stable order, so a note keeps its name between runs.
// A note renamed or moved gets a new file; the old one is left as it is (sync never deletes a file).

/** @typedef {{ id: string, title: string, path?: string }} NoteRef */

/** @param {unknown} s */
const part = s => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '').replace(/^\.+$/, '').trim().slice(0, 100);

/**
 * @param {NoteRef[]} notes @param {string} space  the space's name ('' for the person's own notes)
 * @returns {Map<string, string>}  note id -> path under the app's folder
 */
export function notePaths(notes, space) {
  const root = part(space) || 'My notes';
  /** @type {Map<string, string>} */ const out = new Map();
  const taken = new Set();
  for (const n of [...notes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const dir = String(n.path || '').split('/').map(part).filter(Boolean).join('/');
    const base = `${root}/${dir ? dir + '/' : ''}`;
    const title = part(n.title) || 'Untitled';
    let name = `${title}.md`;
    if (taken.has((base + name).toLowerCase())) name = `${title} (${n.id.slice(0, 6)}).md`;
    taken.add((base + name).toLowerCase());
    out.set(n.id, base + name);
  }
  return out;
}
