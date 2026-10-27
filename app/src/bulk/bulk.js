// Bulk edit's pure parts: what each action does to the selected notes. Each returns the saves (a note's edits, or one
// new note) and the notes to delete (they go to the bin like any delete).

/** @typedef {import('../cloud.js').Note} Note */

/** a tag as typed -> as kept (#a/b), or '' @param {string} s */
export const cleanTag = s => String(s).trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_/-]+/gu, '').slice(0, 60);

/** the tag added to the end of each note that lacks it (tags come from the body's #tags)
 * @param {Note[]} notes @param {string} tag @returns {{ note: Note, patch: Partial<Note> }[]} */
export function addTag(notes, tag) {
  const t = cleanTag(tag);
  if (!t) return [];
  return notes.filter(n => !(n.tags || []).includes(t)).map(n => ({ note: n, patch: { body: `${n.body.replace(/\s+$/, '')}\n\n#${t}\n` } }));
}
/** the notes whose folder is not yet that one @param {Note[]} notes @param {string} folder */
export function moveTo(notes, folder) {
  const path = String(folder).trim().replace(/^\/+|\/+$/g, '').slice(0, 200);
  return notes.filter(n => (n.path || '') !== path).map(n => ({ note: n, patch: { path } }));
}
/** one note from many (in the order given): each body under its title, the first's folder; the originals are to delete
 * @param {Note[]} notes @param {string} [title] @returns {{ create: { title: string, body: string, path: string }, remove: Note[] } | null} */
export function mergeNotes(notes, title = '') {
  if (notes.length < 2) return null;
  const body = notes.map(n => `## ${n.title || 'Untitled'}\n\n${n.body.trim()}`).join('\n\n');
  return { create: { title: title.trim() || `${notes[0].title || 'Untitled'} and ${notes.length - 1} more`, body: body + '\n', path: notes[0].path || '' }, remove: notes };
}
