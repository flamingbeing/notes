// Links and tags in a note's Markdown. Pure, no DOM (tested in app/test/notes.unit.test.mjs).
//
// [[target]], [[target|alias]], [[target#heading]], [[target#heading|alias]] and ![[embed]] are links; #tag and
// #nested/tag are tags (not a "# heading", not inside a word, not all digits), and so are the front matter's tags
// (`tags: [a, b]`, `tags: a, b` or a "- a" list under `tags:`). Code spans and fenced code blocks hold neither.

/** @typedef {{ start: number, end: number, code: boolean }} Part */

// the body cut into code (fenced blocks, `spans`) and prose, in order; the parts cover the whole text
/** @param {string} text @returns {Part[]} */
export function parts(text) {
  /** @type {Part[]} */
  const out = [];
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))|(`+)(?!`)[\s\S]*?[^`]\2(?!`)/gm;
  let at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push({ start: at, end: m.index, code: false });
    out.push({ start: m.index, end: m.index + m[0].length, code: true });
    at = m.index + m[0].length;
    if (!m[0].length) re.lastIndex++;
  }
  if (at < text.length) out.push({ start: at, end: text.length, code: false });
  return out;
}

export const LINK = /(!?)\[\[([^\[\]\n|#]*)(#[^\[\]\n|]*)?(?:\|([^\[\]\n]*))?\]\]/g;

/** @typedef {{ target: string, heading: string, alias: string, embed: boolean, start: number, end: number }} Link */

// every link outside code, in order (target trimmed; '' for [[#heading]], a link inside this note)
/** @param {string} text @returns {Link[]} */
export function linksIn(text) {
  /** @type {Link[]} */
  const out = [];
  for (const p of parts(text)) {
    if (p.code) continue;
    const seg = text.slice(p.start, p.end);
    for (const m of seg.matchAll(LINK)) {
      const start = p.start + (m.index ?? 0);
      out.push({ embed: m[1] === '!', target: m[2].trim(), heading: (m[3] || '').slice(1).trim(), alias: (m[4] || '').trim(), start, end: start + m[0].length });
    }
  }
  return out;
}

// a title or link target as compared: case and spacing don't matter, nor a trailing .md
/** @param {string} s */
export const keyOf = s => String(s ?? '').trim().replace(/\.md$/i, '').replace(/\s+/g, ' ').toLowerCase();

/** @param {string} text -> the front matter's body (between the --- lines at the very start), or '' */
const frontMatter = text => /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] || '';

/** @param {string} text @returns {string[]} */
function frontTags(text) {
  const fm = frontMatter(text);
  const m = /^tags?:[ \t]*(.*)$/m.exec(fm);
  if (!m) return [];
  if (m[1].trim()) return m[1].replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^["']|["']$/g, '').replace(/^#/, ''));
  const after = fm.slice((m.index || 0) + m[0].length).split(/\r?\n/).slice(1);
  /** @type {string[]} */
  const list = [];
  for (const line of after) {
    const item = /^\s*-\s+(.+)$/.exec(line);
    if (!item) break;
    list.push(item[1].trim().replace(/^["']|["']$/g, '').replace(/^#/, ''));
  }
  return list;
}

const TAG = /(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_\-/]+)/gu;

// tags (without the #, lower case, each once): front matter first, then the body's, in order
/** @param {string} text @returns {string[]} */
export function tagsIn(text) {
  const fm = frontMatter(text);
  /** @type {string[]} */
  const found = frontTags(text);
  const bodyStart = fm ? text.indexOf('---', 3) + 3 : 0;
  for (const p of parts(text)) {
    if (p.code || p.end <= bodyStart) continue;
    const seg = text.slice(Math.max(p.start, bodyStart), p.end).replace(LINK, ' ');
    for (const m of seg.matchAll(TAG)) if (!/^\d+$/.test(m[2])) found.push(m[2].replace(/\/+$/, ''));
  }
  return [...new Set(found.filter(Boolean).map(t => t.toLowerCase()))];
}

// the targets the body links to (as keys, each once): what `links[]` holds on the record
/** @param {string} text @returns {string[]} */
export const linkKeys = text => [...new Set(linksIn(text).map(l => keyOf(l.target)).filter(Boolean))];
