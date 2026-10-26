// Ported from the logbook (flamingbeing/apmes logbook/js/merge3.js, same owner), unchanged but for this line: the notes
// app runs it as the notes collection's merge (notes/merge.js); a clash there becomes a conflict copy, so the marks
// below are only used by the tests.

/** @param {unknown} t */
const lf = t => String(t ?? '').replace(/\r\n?/g, '\n');
/** @param {string} s @returns {string[]} */
export const lines = s => (s === '' ? [] : lf(s).split('\n'));
// longest common subsequence of two line lists: for each line of a, the matching line of b (or -1)
/** @param {string[]} a @param {string[]} b @returns {number[]} */
function lcs(a, b) {
  const n = a.length, m = b.length, match = new Array(n).fill(-1);
  // trim the common start and end first (most edits are small), so the table stays small
  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) { match[lo] = lo; lo++; }
  let hiA = n, hiB = m;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) { hiA--; hiB--; match[hiA] = hiB; }
  const rows = hiA - lo, cols = hiB - lo;
  if (!rows || !cols) return match;
  if (rows * cols > 4e6) return match;   // a huge rewrite: no middle matches (it merges as one change)
  const w = cols + 1, t = new Uint32Array((rows + 1) * w);
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--)
      t[i * w + j] = a[lo + i] === b[lo + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  for (let i = 0, j = 0; i < rows && j < cols;) {
    if (a[lo + i] === b[lo + j]) { match[lo + i] = lo + j; i++; j++; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++; else j++;
  }
  return match;
}
/** @typedef {(x: string[], y: string[]) => boolean} Cmp */
/** @type {Cmp} */
const same = (x, y) => x.length === y.length && x.every((l, i) => l === y[i]);
/** @type {Cmp} */
const startsWith = (x, y) => y.length <= x.length && y.every((l, i) => l === x[i]);
/** @type {Cmp} */
const endsWith = (x, y) => y.length <= x.length && y.every((l, i) => l === x[x.length - y.length + i]);
// one changed stretch: the side that changed wins; when both changed, lines one side only added before or after
// the old ones go round the other side's edit (the app adds a case under the line the user annotated); lines both
// added at the very end are both kept, the user's first (they follow the line they were written under; the app's
// are new cases). null = a real clash.
/** @param {string[]} co @param {string[]} ca @param {string[]} cb @param {boolean} atEnd @returns {string[] | null} */
function resolve(co, ca, cb, atEnd) {
  if (same(ca, co)) return cb;
  if (same(cb, co) || same(ca, cb)) return ca;
  if (!co.length) return atEnd ? [...cb, ...ca] : null;
  if (startsWith(ca, co)) return [...cb, ...ca.slice(co.length)];
  if (endsWith(ca, co)) return [...ca.slice(0, ca.length - co.length), ...cb];
  if (startsWith(cb, co)) return [...ca, ...cb.slice(co.length)];
  if (endsWith(cb, co)) return [...cb.slice(0, cb.length - co.length), ...ca];
  return null;
}

export const MINE_MARK = '<<<<<<< logbook';
export const SPLIT_MARK = '=======';
export const THEIRS_MARK = '>>>>>>> your edits';

// merge3(base, mine, theirs) -> { text, conflicts }: changes made on either side since base are both applied;
// where the two changed the same lines differently, both are kept between git-style marks (mine first).
// Line endings come out as \n.
/** @param {string} base @param {string} mine @param {string} theirs @returns {{ text: string, conflicts: number }} */
export function merge3(base, mine, theirs) {
  const o = lines(base), a = lines(mine), b = lines(theirs);
  const ma = lcs(o, a), mb = lcs(o, b);
  /** @type {string[]} */
  const out = [];
  let conflicts = 0, i = 0, ia = 0, ib = 0;
  for (;;) {
    // the next base line that both sides kept
    let j = i;
    while (j < o.length && (ma[j] < 0 || mb[j] < 0)) j++;
    const end = j >= o.length;
    const ja = end ? a.length : ma[j], jb = end ? b.length : mb[j];
    const co = o.slice(i, j), ca = a.slice(ia, ja), cb = b.slice(ib, jb);
    const r = resolve(co, ca, cb, end);
    if (r) out.push(...r);
    else { conflicts++; out.push(MINE_MARK, ...ca, SPLIT_MARK, ...cb, THEIRS_MARK); }
    if (end) break;
    out.push(o[j]);
    i = j + 1; ia = ja + 1; ib = jb + 1;
  }
  return { text: out.join('\n'), conflicts };
}

