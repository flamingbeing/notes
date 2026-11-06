// A note's headings, for the right sidebar's Outline (pure: the unit tests read it in Node). "# Title" to "###### Title"
// (and a line underlined with === or ---), never inside a fenced code block or the front matter. Each heading has its
// level (1 to 6), its words as they read (links by their words, no ** or `), its line (0 is the first) and its depth in
// the tree: how many headings above it are bigger and still open (an outline of only ## headings starts at depth 0).

/** @typedef {{ level: number, text: string, line: number, depth: number }} Heading */

/** a heading's words as they read: [[target|words]] -> words, [words](url) -> words, no emphasis marks @param {string} s */
export const plainHeading = s => s
  .replace(/!?\[\[([^\[\]|#]*)(#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]/g, (_, t, h, a) => (a || t || (h || '').slice(1)).trim())
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/(\*\*|__|~~|==|`)/g, '')
  .replace(/(^|[^\p{L}\p{N}])[*_]+|[*_]+(?=$|[^\p{L}\p{N}])/gu, '$1')
  .replace(/\s+/g, ' ')
  .trim();

/** @param {string} body @returns {Heading[]} */
export function headingsOf(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  /** @type {Heading[]} */
  const out = [];
  let i = 0;
  // (the front matter: --- lines at the very start)
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    const dots = lines.indexOf('...', 1);
    const close = end > 0 ? (dots > 0 ? Math.min(end, dots) : end) : dots;
    if (close > 0) i = close + 1;
  }
  /** @type {string | null} the fence that opened a code block (``` or ~~~, at least 3) */
  let fence = null;
  let para = false;   // the line before is a paragraph's (so a === or --- under it makes it a heading)
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      continue;
    }
    if (f) { fence = f[1]; para = false; continue; }
    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (atx) {
      out.push({ level: atx[1].length, text: plainHeading(atx[2] || ''), line: i, depth: 0 });
      para = false;
      continue;
    }
    const under = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (under && para) {
      const prev = out.length && out[out.length - 1].line === i - 1 ? null : lines[i - 1];
      if (prev !== null) out.push({ level: under[1][0] === '=' ? 1 : 2, text: plainHeading(prev), line: i - 1, depth: 0 });
      para = false;
      continue;
    }
    // (a paragraph's line: not blank, not a list item, a quote, a table or an indented block)
    para = !!line.trim() && !/^\s*([-*+]|\d+[.)])\s|^\s*>|^\s*\||^( {4}|\t)/.test(line);
  }
  // the depth: under how many headings bigger than it (and not closed by one as big or bigger)
  /** @type {number[]} */
  const open = [];
  for (const h of out) {
    while (open.length && open[open.length - 1] >= h.level) open.pop();
    h.depth = open.length;
    open.push(h.level);
  }
  return out.filter(h => h.text);
}
