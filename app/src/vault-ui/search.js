// The Search view's results (pure: the unit tests read it in Node). The app's own search (@core/search: words, "phrases",
// -leave-outs, OR, tag: and path:) finds the notes; here the searched words are found in each note's text as written
// (anywhere in a word, as the reference app does; with Match case, only in the same case), the notes grouped with how
// many matches each has and the lines that hold them (a line around each, or the lines either side with "Show more
// context"), notes whose title has a searched word listed first, and the order asked: relevance, file name, or modified time.

/** @typedef {{ id: string, title?: string, body?: string, path?: string, tags?: string[], updatedAt?: unknown }} NoteLike */
/** @typedef {{ text: string, mark: boolean }} Part */
/** @typedef {{ id: string, title: string, path: string, count: number, snippets: Part[][] }} Group */
/** @typedef {{ titles: { id: string, title: string, path: string, parts: Part[] }[], groups: Group[], total: number, terms: Term[] }} Results */
/** @typedef {{ text: string, phrase: boolean }} Term */

export const SEARCH_SORTS = /** @type {const} */ (['relevance', 'name-asc', 'name-desc', 'mtime-desc', 'mtime-asc']);
export const SORT_LABELS = /** @type {Record<string, string>} */ ({
  relevance: 'Relevance', 'name-asc': 'File name (A to Z)', 'name-desc': 'File name (Z to A)',
  'mtime-desc': 'Modified time (new to old)', 'mtime-asc': 'Modified time (old to new)',
});
export const RECENT_MAX = 10;
const MAX_SNIPPETS = 20;

const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** @param {unknown} v */
const time = v => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) || 0 : 0);

/**
 * The words to find in the text, as typed (their case kept): plain words and "phrases" (not leave-outs or other fields);
 * a tag: filter is found as its #tag.
 * @param {string} q @returns {Term[]}
 */
export function textTerms(q) {
  /** @type {Term[]} */
  const out = [];
  const re = /(-?)(?:([A-Za-z]+):)?(?:"([^"]*)"?|(\S+))/g;
  let m;
  while ((m = re.exec(String(q || '')))) {
    if (!m[0]) { re.lastIndex++; continue; }
    const [, neg, field, phrase, word] = m;
    const f = (field || '').toLowerCase();
    let text = (phrase != null ? phrase : word || '').trim();
    if (!text) continue;
    // a leave-out finds nothing to mark; a lone "-" before a sign is just the character
    if (neg) { if (field || phrase != null || /^[\p{L}\p{N}]/u.test(text)) continue; text = '-' + text; }
    if (!f && (text === 'OR' || text === '|' || text === 'AND' || text === '&')) continue;
    if (f === 'tag') { out.push({ text: '#' + text.replace(/^#+/, ''), phrase: true }); continue; }
    if (f === 'path') continue;
    out.push({ text: field && !['title', 'body', 'tags'].includes(f) ? `${field}:${text}` : text, phrase: phrase != null });
  }
  // (longest first, so "garden" is marked whole where "gar" is searched too)
  return [...new Map(out.map(t => [t.text, t])).values()].sort((a, b) => b.text.length - a.text.length);
}

/** @param {string} s */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where the words are in a text: [start, end) ranges, in order, not overlapping.
 * @param {string} text @param {Term[]} terms @param {boolean} matchCase @returns {[number, number][]}
 */
export function matchesIn(text, terms, matchCase) {
  if (!terms.length || !text) return [];
  const re = new RegExp(terms.map(t => esc(t.text)).join('|'), matchCase ? 'gu' : 'giu');
  /** @type {[number, number][]} */
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** a text cut into plain and marked parts @param {string} text @param {[number, number][]} ranges @returns {Part[]} */
export function marked(text, ranges) {
  /** @type {Part[]} */
  const parts = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) parts.push({ text: text.slice(at, a), mark: false });
    parts.push({ text: text.slice(a, b), mark: true });
    at = b;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

/**
 * One line, cut down around its first match when long (about `room` characters).
 * @param {string} line @param {[number, number][]} ranges @param {number} room @returns {Part[]}
 */
const around = (line, ranges, room) => {
  if (line.length <= room || !ranges.length) return marked(line, ranges);
  const first = ranges[0][0];
  let from = Math.max(0, first - Math.round(room / 3));
  if (from > 0) { const sp = line.indexOf(' ', from); if (sp >= 0 && sp < first) from = sp + 1; }
  let to = Math.min(line.length, from + room);
  if (to < line.length) { const sp = line.lastIndexOf(' ', to); if (sp > first) to = sp; }
  const cut = ranges.filter(([a, b]) => a >= from && b <= to).map(([a, b]) => /** @type {[number, number]} */ ([a - from, b - from]));
  const parts = marked(line.slice(from, to), cut);
  if (from > 0) parts.unshift({ text: '…', mark: false });
  if (to < line.length) parts.push({ text: '…', mark: false });
  return parts;
};

/**
 * The snippets of one note: each line with a match (with the lines either side when `context`), at most 20.
 * @param {string} body @param {Term[]} terms @param {boolean} matchCase @param {boolean} context
 * @returns {{ count: number, snippets: Part[][] }}
 */
export function snippetsOf(body, terms, matchCase, context) {
  const lines = String(body || '').split('\n');
  let count = 0;
  /** @type {Part[][]} */
  const snippets = [];
  const room = context ? 220 : 140;
  lines.forEach((line, i) => {
    const r = matchesIn(line, terms, matchCase);
    if (!r.length) return;
    count += r.length;
    if (snippets.length >= MAX_SNIPPETS) return;
    const text = line.trim();
    const shift = line.indexOf(text);
    /** @type {[number, number][]} */
    const ranges = r.map(([a, b]) => [a - shift, b - shift]);
    const parts = around(text, ranges, room);
    if (context) {
      const before = lines.slice(0, i).reverse().find(l => l.trim())?.trim();
      const after = lines.slice(i + 1).find(l => l.trim())?.trim();
      if (before) parts.unshift({ text: before.slice(0, room) + '\n', mark: false });
      if (after) parts.push({ text: '\n' + after.slice(0, room), mark: false });
    }
    snippets.push(parts);
  });
  return { count, snippets };
}

/**
 * The Search view's results.
 * @param {{ notes: NoteLike[], hits: { id: string }[], q: string, matchCase?: boolean, sort?: string, context?: boolean }} o
 *   hits: what the app's search found, best first (the order for "Relevance")
 * @returns {Results}
 */
export function searchResults({ notes, hits, q, matchCase = false, sort = 'relevance', context = false }) {
  const terms = textTerms(q);
  const byId = new Map(notes.map(n => [n.id, n]));
  const rank = new Map(hits.map((h, i) => [h.id, i]));
  /** @type {NoteLike[]} */
  let found = hits.map(h => byId.get(h.id)).filter(/** @returns {n is NoteLike} */ n => !!n);
  // (words searched: notes with them written in (anywhere in a word) also count, as the app's search finds word starts)
  const plain = terms.length && !/(^|\s)-|\b[A-Za-z]+:/.test(q) && !/\s(OR|\|)\s/.test(q);
  if (plain) {
    const groups = String(q).trim().split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(w => textTerms(w)).filter(g => g.length);
    const seen = new Set(found.map(n => n.id));
    for (const n of notes) {
      if (seen.has(n.id)) continue;
      const text = `${n.title || ''}\n${n.body || ''}`;
      if (groups.every(g => matchesIn(text, g, matchCase).length)) found.push(n);
    }
  }
  /** @type {Results['titles']} */
  const titles = [];
  /** @type {Group[]} */
  const groups = [];
  for (const n of found) {
    const title = String(n.title || '') || 'Untitled';
    const inTitle = matchesIn(title, terms, matchCase);
    const { count, snippets } = terms.length ? snippetsOf(String(n.body || ''), terms, matchCase, context) : { count: 0, snippets: [] };
    if (terms.length && !inTitle.length && !count) continue;   // found by a near spelling only, or not in this case
    if (inTitle.length) titles.push({ id: n.id, title, path: String(n.path || ''), parts: marked(title, inTitle) });
    if (count || !terms.length) groups.push({ id: n.id, title, path: String(n.path || ''), count, snippets });
  }
  const mtime = new Map(found.map(n => [n.id, time(n.updatedAt)]));
  /** @param {{ id: string, title: string }} a @param {{ id: string, title: string }} b */
  const order = (a, b) => {
    if (sort === 'name-asc') return coll.compare(a.title, b.title);
    if (sort === 'name-desc') return coll.compare(b.title, a.title);
    if (sort === 'mtime-desc') return (mtime.get(b.id) || 0) - (mtime.get(a.id) || 0);
    if (sort === 'mtime-asc') return (mtime.get(a.id) || 0) - (mtime.get(b.id) || 0);
    return (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || (mtime.get(b.id) || 0) - (mtime.get(a.id) || 0);
  };
  titles.sort(order);
  groups.sort(order);
  const total = new Set([...titles.map(t => t.id), ...groups.map(g => g.id)]).size;
  return { titles, groups, total, terms };
}

/** a search kept at the top of the recent ones (no repeats, at most 10) @param {string[]} list @param {string} q */
export function addRecent(list, q) {
  const t = String(q || '').trim();
  if (!t) return list.slice(0, RECENT_MAX);
  return [t, ...list.filter(x => x !== t)].slice(0, RECENT_MAX);
}
