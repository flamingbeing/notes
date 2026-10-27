// What the tools do with notes: find, filter, search and show them. Pure (no network), so the tests need none.
// A note: { id, path (the folder), title, body, links, tags, aliases, daily?, updatedAt (ms) }; see app/src/notes/model.js.

import { keyOf } from '../../app/src/notes/parse.js';

export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;
const SNIPPET = 160;

/** @param {unknown} ms @returns {string} 'YYYY-MM-DD HH:MM' in the computer's time zone, '' if unknown */
export function stamp(ms) {
  const n = Number(ms);
  if (!n) return '';
  const d = new Date(n), p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const newest = (a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
const place = n => (n.path ? `${n.path}/` : '') + n.title;

/** @param {any} n */
export const noteLine = n => `- ${place(n)} (id ${n.id}${n.updatedAt ? `, ${stamp(n.updatedAt)}` : ''})`;

/** @param {any[]} notes @param {{ folder?: string, tag?: string, limit?: number }} f */
export function filterNotes(notes, { folder, tag, limit = DEFAULT_LIMIT } = {}) {
  const dir = folder === undefined ? null : folder.replace(/^\/+|\/+$/g, '').toLowerCase();
  const want = tag === undefined ? null : tag.replace(/^#/, '').toLowerCase();
  const rows = notes
    .filter(n => dir === null || (n.path || '').toLowerCase() === dir || (n.path || '').toLowerCase().startsWith(dir + '/'))
    .filter(n => want === null || (n.tags || []).some(t => String(t).toLowerCase() === want))
    .sort(newest);
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** @param {{ rows: any[], total: number }} r @param {string} what */
export function formatNoteList({ rows, total }, what) {
  if (!rows.length) return `No ${what}.`;
  const more = total > rows.length ? `\n\n${total - rows.length} more; narrow it or raise the limit.` : '';
  return `${total} ${what}, newest first:\n${rows.map(noteLine).join('\n')}${more}`;
}

// words (a "quoted phrase" stays whole) -> lower-case needles
export const words = text => [...String(text).matchAll(/"([^"]+)"|(\S+)/g)].map(m => (m[1] ?? m[2]).toLowerCase());

/** @param {any[]} notes @param {string} text @param {number} [limit] */
export function searchNotes(notes, text, limit = DEFAULT_LIMIT) {
  const needles = words(text);
  const hits = notes.map(n => {
    const hay = [n.title, ...(n.aliases || []), ...(n.tags || []).map(t => `#${t}`), n.path || ''].join('\n').toLowerCase();
    const body = String(n.body || '').toLowerCase();
    return needles.every(w => hay.includes(w) || body.includes(w)) ? { n, inTitle: needles.every(w => hay.includes(w)) } : null;
  }).filter(Boolean);
  hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || newest(a.n, b.n));
  return { rows: hits.slice(0, limit).map(h => h.n), total: hits.length, needles };
}

// the first line of the body that holds a needle, trimmed around it
export function snippet(body, needles) {
  const line = String(body || '').split('\n').find(l => needles.some(w => l.toLowerCase().includes(w)));
  if (!line) return '';
  const at = Math.max(0, line.toLowerCase().indexOf(needles.find(w => line.toLowerCase().includes(w))) - 40);
  return (at ? '…' : '') + line.slice(at, at + SNIPPET).trim();
}

/** @param {{ rows: any[], total: number, needles: string[] }} r @param {string} text */
export function formatSearch({ rows, total, needles }, text) {
  if (!rows.length) return `No notes match "${text}".`;
  const body = rows.map(n => {
    const s = snippet(n.body, needles);
    return noteLine(n) + (s ? `\n  ${s}` : '');
  }).join('\n');
  return `${total} note${total === 1 ? '' : 's'} match "${text}":\n${body}${total > rows.length ? `\n\n${total - rows.length} more.` : ''}`;
}

// A note named by id, or by title / alias (case, spacing and a trailing .md ignored; "folder/Title" works too).
// -> { note } | { error } (none, or several: the error lists them with their ids)
export function findNote(notes, ref) {
  const byId = notes.find(n => n.id === ref);
  if (byId) return { note: byId };
  const want = keyOf(ref);
  const slash = want.lastIndexOf('/');
  const [dir, name] = slash < 0 ? [null, want] : [want.slice(0, slash), want.slice(slash + 1)];
  const hits = notes.filter(n => (keyOf(n.title) === name || (n.aliases || []).some(a => keyOf(a) === name))
    && (dir === null || (n.path || '').toLowerCase() === dir));
  if (hits.length === 1) return { note: hits[0] };
  if (!hits.length) return { error: `No note with id or title "${ref}". Use list_notes or search_notes to find it.` };
  return { error: `Several notes are called "${ref}"; use the id of one:\n${hits.sort(newest).map(noteLine).join('\n')}` };
}

/** @param {any} n @param {{ space?: string }} [where] */
export function formatNote(n, { space = '' } = {}) {
  const head = [
    `# ${n.title}`,
    `id ${n.id}${space ? ` · space ${space}` : ''}${n.path ? ` · folder ${n.path}` : ''}${n.updatedAt ? ` · changed ${stamp(n.updatedAt)}` : ''}`,
    (n.tags || []).length ? `tags: ${n.tags.map(t => `#${t}`).join(' ')}` : '',
  ].filter(Boolean).join('\n');
  return `${head}\n\n${n.body || '(empty)'}`;
}
