// A search result's passage: the first place the note's text has one of the searched words, about two lines of it,
// split so the row can mark the word. Pure (no DOM), so it is unit tested.

/** the body as plain lines: Markdown marks, link targets and blank lines left out @param {string} body */
export function plainLines(body) {
  return String(body || '').split('\n').map(l => l.replace(/^\s*(?:#{1,6}|[-*+>]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '').replace(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim()).filter(Boolean);
}

const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} body  the note's text
 * @param {{ text: string, phrase: boolean }[]} terms  the searched words (lower case; a word matches the start of a word)
 * @param {number} [room]  about how many characters show (two lines of a phone's row)
 * @returns {{ before: string, match: string, after: string } | null}  null: no searched word is in the text
 */
export function snippetOf(body, terms, room = 110) {
  const words = terms.map(t => t.text.trim()).filter(Boolean);
  if (!words.length) return null;
  const text = plainLines(body).join(' ');
  // the first place any searched word starts a word (a phrase: anywhere)
  let at = -1, len = 0;
  for (const t of terms) {
    const w = t.text.trim();
    if (!w) continue;
    const m = new RegExp(t.phrase ? esc(w) : `(?<![\\p{L}\\p{N}])${esc(w)}[\\p{L}\\p{N}]*`, 'iu').exec(text);
    if (m && (at < 0 || m.index < at)) { at = m.index; len = m[0].length; }
  }
  if (at < 0) return null;
  // a little before the word (from a word's start), the rest after it
  let from = Math.max(0, at - Math.round(room / 3));
  if (from > 0) { const sp = text.indexOf(' ', from); from = sp >= 0 && sp < at ? sp + 1 : at; }
  let to = Math.min(text.length, from + Math.max(room, len + 10));
  if (to < text.length) { const sp = text.lastIndexOf(' ', to); if (sp > at + len) to = sp; }
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    match: text.slice(at, at + len),
    after: text.slice(at + len, to) + (to < text.length ? '…' : ''),
  };
}
