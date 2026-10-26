// Which note a [[link]] means, the backlinks of each note, and the edits a rename makes. Pure, no DOM (tested in
// app/test/notes.unit.test.mjs). Links resolve within one space (one list of notes); [[Space/Note]] is S3's.
import { keyOf, linksIn, parts } from './parse.js';
import { withDerived } from './model.js';

/** @typedef {import('./model.js').Note} Note */

/**
 * An index over one space's notes, rebuilt from the list the engine hands over (cheap: a map per call).
 * - resolve(target): the note a link means: a title first, then an alias, then a path + title ("folder/Title");
 *   two notes with one title: the shortest path wins, then the oldest id. null = no such note (a click creates it).
 * - backlinks(id): the notes that link to it (by title, alias or path), sorted by title.
 * @param {Note[]} notes
 */
export function linkIndex(notes) {
  /** @type {Map<string, Note[]>} */
  const byKey = new Map();
  const add = (/** @type {string} */ k, /** @type {Note} */ n) => { if (k) byKey.set(k, [...(byKey.get(k) || []), n]); };
  const live = notes.filter(n => !n._deleted);
  for (const n of live) {
    add(keyOf(n.title), n);
    if (n.path) add(keyOf(`${n.path}/${n.title}`), n);
  }
  /** @type {Map<string, Note[]>} */
  const byAlias = new Map();
  for (const n of live) for (const a of n.aliases || []) { const k = keyOf(a); if (k) byAlias.set(k, [...(byAlias.get(k) || []), n]); }
  const pick = (/** @type {Note[] | undefined} */ list) => !list?.length ? null
    : [...list].sort((a, b) => (a.path || '').length - (b.path || '').length || (a.id < b.id ? -1 : 1))[0];
  /** @param {string} target @returns {Note | null} */
  const resolve = target => { const k = keyOf(target); return pick(byKey.get(k)) || pick(byAlias.get(k)); };
  /** @type {Map<string, Note[]>} */
  const back = new Map();
  for (const n of live) for (const k of n.links || []) {
    const to = resolve(k);
    if (to && to.id !== n.id && !back.get(to.id)?.includes(n)) back.set(to.id, [...(back.get(to.id) || []), n]);
  }
  return {
    resolve,
    /** @param {string} id @returns {Note[]} */
    backlinks: id => [...(back.get(id) || [])].sort((a, b) => a.title.localeCompare(b.title)),
  };
}

// The body with every link to `from` (a title, compared as a key) pointed at `to`; heading and alias kept, code left
// alone. Unchanged text comes back as is.
/** @param {string} body @param {string} from @param {string} to */
export function relink(body, from, to) {
  const k = keyOf(from);
  const code = parts(body).filter(p => p.code);
  const hits = linksIn(body).filter(l => keyOf(l.target) === k && !code.some(c => l.start >= c.start && l.start < c.end));
  let out = body;
  for (const l of hits.reverse()) {
    const inner = to + (l.heading ? '#' + l.heading : '') + (l.alias ? '|' + l.alias : '');
    out = out.slice(0, l.start) + (l.embed ? '!' : '') + '[[' + inner + ']]' + out.slice(l.end);
  }
  return out;
}

/**
 * A rename's saves: the note under its new title (the old one kept as an alias), and each note of the same space
 * that links to it by the old title or its folder and old title, with those links rewritten. Each entry: { record, base } for saveMany.
 * @param {Note[]} notes  the space's notes @param {Note} note @param {string} title  the new title
 * @returns {{ record: Note, base: Note }[]}
 */
export function renamePlan(notes, note, title) {
  const to = title.trim(), from = note.title;
  if (!to || to === from) return [];
  const aliases = [...new Set([...(note.aliases || []).filter(a => keyOf(a) !== keyOf(to)), from])];
  const self = withDerived({ ...note, title: to, aliases });
  // [[Old]] counts only if it meant this note before the rename (another note may share the title); a path link
  // [[folder/Old]] always means it, and becomes [[folder/New]]
  const meant = linkIndex(notes).resolve(from)?.id === note.id;
  const qual = note.path ? `${note.path}/${from}` : '';
  const keys = [meant ? keyOf(from) : '', keyOf(qual)].filter(Boolean);
  const rewrite = (/** @type {string} */ body) => {
    let out = meant ? relink(body, from, to) : body;
    return qual ? relink(out, qual, `${note.path}/${to}`) : out;
  };
  /** @type {{ record: Note, base: Note }[]} */
  const out = [{ record: self, base: note }];
  for (const n of notes) {
    if (n._deleted || !(n.links || []).some(l => keys.includes(l))) continue;
    const body = rewrite(n.id === note.id ? self.body : n.body);
    if (n.id === note.id) { if (body !== self.body) out[0] = { record: withDerived({ ...self, body }), base: note }; continue; }
    if (body !== n.body) out.push({ record: withDerived({ ...n, body }), base: n });
  }
  return out;
}
