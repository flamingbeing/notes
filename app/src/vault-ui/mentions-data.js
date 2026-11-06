// The Vault layout's "Backlinks in document": the notes that link to a note (linked mentions), each with the lines
// that hold the links, and the notes that name it without a link (unlinked mentions, worked out only when asked).
// Pure (no DOM): the notes and the link index come in, groups go out (tested in app/test/vault-mentions.unit.test.mjs).
import { linksIn, parts, keyOf } from '../notes/parse.js';
import { linkIndex } from '../notes/links.js';

/** @typedef {import('../notes/model.js').Note} Note */
/**
 * @typedef {{ line: number, text: string, ranges: [number, number][], before: string[], after: string[] }} Snippet
 *   line: its number in the note (0 first); text: the line as written; ranges: where each mention is in it (start,
 *   end, in the line); before/after: up to two lines around it (more context)
 * @typedef {{ note: Note, count: number, snippets: Snippet[] }} Group  one note's mentions
 */

/** the line holding each of these offsets, with the mentions in it @param {string} body @param {[number, number][]} spans @param {number} room */
function snippetsOf(body, spans, room) {
  const lines = body.split('\n');
  /** @type {number[]} the offset each line starts at */
  const starts = [];
  let at = 0;
  for (const l of lines) { starts.push(at); at += l.length + 1; }
  const lineAt = (/** @type {number} */ pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo; };
  /** @type {Map<number, Snippet>} */
  const byLine = new Map();
  for (const [a, b] of spans) {
    const n = lineAt(a);
    const s = byLine.get(n) || { line: n, text: lines[n], ranges: [], before: lines.slice(Math.max(0, n - room), n), after: lines.slice(n + 1, n + 1 + room) };
    s.ranges.push([a - starts[n], Math.min(b, starts[n] + lines[n].length) - starts[n]]);
    byLine.set(n, s);
  }
  return [...byLine.values()].sort((x, y) => x.line - y.line);
}

/** @param {Group[]} groups @param {string} sort  'name-asc' | 'name-desc' | 'mtime-desc' | 'mtime-asc' */
export function sortGroups(groups, sort = 'name-asc') {
  const t = (/** @type {Group} */ g) => Number(g.note.updatedAt) || 0;
  const name = (/** @type {Group} */ a, /** @type {Group} */ b) => a.note.title.localeCompare(b.note.title, undefined, { sensitivity: 'base', numeric: true });
  const by = {
    'name-asc': name,
    'name-desc': (/** @type {Group} */ a, /** @type {Group} */ b) => name(b, a),
    'mtime-desc': (/** @type {Group} */ a, /** @type {Group} */ b) => t(b) - t(a) || name(a, b),
    'mtime-asc': (/** @type {Group} */ a, /** @type {Group} */ b) => t(a) - t(b) || name(a, b),
  }[sort] || name;
  return [...groups].sort(by);
}

/**
 * The notes linking to `target` ([[Title]], [[Title|alias]], [[Title#heading]], [[folder/Title]] or one of its
 * aliases), one group per note with its count and the lines that hold the links; the note's own links to itself left
 * out, as are links inside code.
 * @param {Note[]} notes  the space's notes @param {Note} target
 * @param {{ index?: ReturnType<typeof linkIndex>, sort?: string, room?: number }} [o]  index: the space's link index
 *   (made here if not given); room: lines of context kept on each side (default 2)
 * @returns {{ count: number, groups: Group[] }}
 */
export function linkedMentions(notes, target, { index, sort = 'name-asc', room = 2 } = {}) {
  const idx = index || linkIndex(notes);
  /** @type {Group[]} */
  const groups = [];
  for (const n of notes) {
    if (n._deleted || n.id === target.id || !n.body) continue;
    const spans = /** @type {[number, number][]} */ (linksIn(n.body).filter(l => l.target && idx.resolve(l.target)?.id === target.id).map(l => [l.start, l.end]));
    if (!spans.length) continue;
    groups.push({ note: n, count: spans.length, snippets: snippetsOf(n.body, spans, room) });
  }
  return { count: groups.reduce((s, g) => s + g.count, 0), groups: sortGroups(groups, sort) };
}

const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The notes naming `target` (its title, or an alias, as a whole word, any case) outside a [[link]] and outside code:
 * the mentions a link could be made from. One group per note, as linkedMentions.
 * @param {Note[]} notes @param {Note} target @param {{ sort?: string, room?: number }} [o]
 * @returns {{ count: number, groups: Group[] }}
 */
export function unlinkedMentions(notes, target, { sort = 'name-asc', room = 2 } = {}) {
  const names = [...new Set([target.title, ...(target.aliases || [])].map(s => String(s || '').trim()).filter(s => keyOf(s)))];
  if (!names.length) return { count: 0, groups: [] };
  // the longest name first, so "Garden plan" wins over "Garden"
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  /** @type {Group[]} */
  const groups = [];
  for (const n of notes) {
    if (n._deleted || n.id === target.id || !n.body) continue;
    const body = n.body;
    // (inside a link or code: not a mention to link)
    const skip = [...linksIn(body).map(l => [l.start, l.end]), ...parts(body).filter(p => p.code).map(p => [p.start, p.end])];
    /** @type {[number, number][]} */
    const spans = [];
    for (const m of body.matchAll(re)) {
      const a = m.index ?? 0, b = a + m[0].length;
      if (!skip.some(([s, e]) => a < e && b > s)) spans.push([a, b]);
    }
    if (spans.length) groups.push({ note: n, count: spans.length, snippets: snippetsOf(body, spans, room) });
  }
  return { count: groups.reduce((s, g) => s + g.count, 0), groups: sortGroups(groups, sort) };
}

/**
 * Groups whose note title or snippet text has `q` (any case); a group keeps only its matching snippets unless its
 * title matched. @param {Group[]} groups @param {string} q
 */
export function filterGroups(groups, q) {
  const k = q.trim().toLowerCase();
  if (!k) return groups;
  return groups.flatMap(g => {
    if (g.note.title.toLowerCase().includes(k)) return [g];
    const snippets = g.snippets.filter(s => s.text.toLowerCase().includes(k));
    return snippets.length ? [{ ...g, snippets, count: snippets.reduce((c, s) => c + s.ranges.length, 0) }] : [];
  });
}
