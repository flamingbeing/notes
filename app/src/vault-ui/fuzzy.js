// Fuzzy matching for the quick switcher and the command palette (pure: the unit tests read it in Node). The typed
// letters must appear in order (not side by side); case and accents don't matter (é is e), spaces typed are free. A
// match scores higher when its letters run together, start words, or start the name; ranges are where the letters
// matched in the original text (to show them bold).

/** @typedef {{ score: number, ranges: [number, number][] }} Match */

/**
 * the text folded for comparing: lower case, accents off; map[i] is the original index of folded character i
 * @param {string} s @returns {{ text: string, map: number[] }}
 */
export function fold(s) {
  let text = '';
  /** @type {number[]} */
  const map = [];
  const src = String(s ?? '');
  for (let i = 0; i < src.length; i++) {
    const code = src.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(code);
    const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const c of f) { text += c; map.push(i); }
    if (code > 0xffff) i++;
  }
  return { text, map };
}

const WORD = /[\p{L}\p{N}]/u;
/** does folded text start a word at i (the start, after a space or mark, or a capital after a small letter)? @param {string} t @param {number} i */
const starts = (t, i) => i === 0 || !WORD.test(t[i - 1]);

/**
 * the best way the query's letters appear in order in the text, or null
 * @param {string} query @param {string} target @returns {Match | null}
 */
export function fuzzy(query, target) {
  const q = fold(query).text.replace(/\s+/g, '');
  if (!q) return { score: 0, ranges: [] };
  const { text, map } = fold(target);
  if (q.length > text.length) return null;
  /** @param {number} start  where the first letter is @returns {{ score: number, at: number[] } | null} */
  const from = start => {
    /** @type {number[]} */
    const at = [start];
    let j = start + 1;
    for (let k = 1; k < q.length; k++) {
      // (the next letter: side by side if it can be, else the next one that starts a word, else the next one)
      if (text[j] === q[k]) { at.push(j++); continue; }
      let next = -1, word = -1;
      for (let x = j; x < text.length; x++) {
        if (text[x] !== q[k]) continue;
        if (next < 0) next = x;
        if (starts(text, x)) { word = x; break; }
      }
      const pick = word >= 0 ? word : next;
      if (pick < 0) return null;
      at.push(pick);
      j = pick + 1;
    }
    let score = 0;
    for (let k = 0; k < at.length; k++) {
      score += 1;
      if (k && at[k] === at[k - 1] + 1) score += 5;          // side by side
      if (starts(text, at[k])) score += 8;                   // a word's start
      if (k) score -= Math.min(3, (at[k] - at[k - 1] - 1) * 0.5);   // a gap
    }
    if (at[0] === 0) score += 12;                            // the name's start
    score -= text.length * 0.02;                            // (a shorter name first)
    return { score, at };
  };
  /** @type {{ score: number, at: number[] } | null} */
  let best = null;
  for (let s = text.indexOf(q[0]); s >= 0; s = text.indexOf(q[0], s + 1)) {
    const m = from(s);
    if (m && (!best || m.score > best.score)) best = m;
  }
  if (!best) return null;
  // (folded places back to the original's, side by side ones joined)
  /** @type {[number, number][]} */
  const ranges = [];
  const src = String(target);
  for (const i of best.at) {
    const a = map[i];
    let b = a + ((src.codePointAt(a) ?? 0) > 0xffff ? 2 : 1);
    while (b < src.length && /\p{M}/u.test(src[b])) b++;   // (an accent typed after its letter goes with it)
    const last = ranges[ranges.length - 1];
    if (last && last[1] === a) last[1] = b;
    else if (!last || last[1] < b) ranges.push([a, b]);
  }
  return { score: best.score, ranges };
}

/**
 * the items that match, best first (ties: as given)
 * @template T @param {string} query @param {T[]} items @param {(item: T) => string} name
 * @returns {{ item: T, score: number, ranges: [number, number][] }[]}
 */
export function rank(query, items, name) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const m = fuzzy(query, name(items[i]));
    if (m) out.push({ item: items[i], score: m.score, ranges: m.ranges, i });
  }
  out.sort((a, b) => b.score - a.score || a.i - b.i);
  return out.map(({ item, score, ranges }) => ({ item, score, ranges }));
}
