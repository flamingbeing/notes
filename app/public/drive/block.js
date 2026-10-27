// The app's block in a Markdown file in Drive (ported from the logbook's sync-md.js, same owner). The app owns only the
// marked block: whatever the person writes around it is kept; when they edit inside it too, the app's changes are
// merged line by line. Pure (no DOM, no network), so it is unit-tested in app/test/drive.unit.test.mjs.

export const START = '<!-- notes:start -->';
export const END = '<!-- notes:end -->';
// the start mark carries the fingerprint of the app's text written there, so any device can tell an untouched block
// from one the person edited
const START_RE = /<!-- notes:start(?: fp=([\w.]{1,40}))? -->/;

/** @typedef {(base: string, mine: string, theirs: string) => { text: string, conflicts: number }} Merge3 */
/** @typedef {{ text: string, write: boolean, conflicts: number, merged: boolean }} DayPlan */

/** @param {unknown} t */
const lf = t => String(t ?? '').replace(/\r\n?/g, '\n');
/** @param {string} s */
const lines = s => (s === '' ? [] : lf(s).split('\n'));

/** a short fingerprint of the text (not the text itself), so "changed since sent" needs no copy of every note @param {unknown} text */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + s.length.toString(36);
}

const ZW = '\u200b';
/** a mark written inside a note is broken with a zero-width space, so it cannot end or start the block @param {string} t */
const hide = t => t.replace(/<!-- notes:(start|end)/g, `<!-- notes:${ZW}$1`);
/** @param {string} t */
const show = t => t.replace(new RegExp(`<!-- notes:${ZW}(start|end)`, 'g'), '<!-- notes:$1');
/** @param {string} text @param {string} [fp] */
export const wrapBlock = (text, fp = '') => `${fp ? START.replace(' -->', ` fp=${fp} -->`) : START}\n${hide(lf(text).replace(/\n+$/, ''))}\n${END}`;

/**
 * { before, inner, after, fp } around the first block, or null when the file has none. A start mark whose end mark was
 * deleted runs to the end of the file (so what follows is merged as the person's, never dropped).
 * @param {unknown} fileText
 */
export function extractBlock(fileText) {
  const t = String(fileText ?? '');
  const sm = START_RE.exec(t);
  if (!sm) return null;
  const s = sm.index;
  let from = s + sm[0].length;
  if (t.startsWith('\r\n', from)) from += 2; else if (t[from] === '\n') from += 1;
  const e = t.indexOf(END, from);
  const to = e < 0 ? t.length : e;
  return { before: t.slice(0, s), inner: show(lf(t.slice(from, to))).replace(/\n$/, ''), after: e < 0 ? '' : t.slice(e + END.length), fp: sm[1] || '' };
}

/**
 * The file with its block replaced by newBlock (added at the end when it has none); the person's text outside the block
 * is left exactly as it was, and the block takes the file's line endings.
 * @param {unknown} fileText @param {string} newBlock
 */
export function replaceBlock(fileText, newBlock) {
  const t = String(fileText ?? '');
  const crlf = /\r\n/.test(t), nl = crlf ? '\r\n' : '\n';
  const block = crlf ? lf(newBlock).replace(/\n/g, '\r\n') : lf(newBlock);
  if (!t.trim()) return block + nl;
  const b = extractBlock(t);
  if (b) return b.before + block + (b.after || nl);
  return t.replace(/(\r?\n)*$/, '') + nl + nl + block + nl;
}

/** every line of x, in order, is in y (y only adds lines to x) @param {string[]} x @param {string[]} y */
function within(x, y) {
  let j = 0;
  for (const l of y) if (j < x.length && x[j] === l) j++;
  return j === x.length;
}

/**
 * What to write for one note. remoteText: the file as it is now (null = no file); inner: the note's text from the app;
 * last: { fp, base } from this device's last sync of this note (fp of the app's text then; base = that text, kept on this
 * device, may be missing); merge: the 3-way line merge.
 * @param {{ remoteText?: string | null, inner: string, last?: { fp: string, base?: string } | null, merge: Merge3 }} p
 * @returns {DayPlan}
 */
export function planFile({ remoteText = null, inner, last = null, merge }) {
  const mine = lf(inner).replace(/\n+$/, ''), fp = fingerprint(mine);
  const block = wrapBlock(mine, fp);
  if (remoteText == null) return { text: block + '\n', write: true, conflicts: 0, merged: false };
  const ext = extractBlock(remoteText);
  const keep = { text: remoteText, write: false, conflicts: 0, merged: false };
  if (ext && (ext.inner === mine || ext.fp === fp)) return keep;   // already there (ext.fp: with the person's edits merged in)
  if (!ext) return planned(remoteText, replaceBlock(remoteText, block), 0, false);
  // untouched since the app wrote it (the mark's fingerprint, or this device's ledger, matches what is there)
  if ((ext.fp && ext.fp === fingerprint(ext.inner)) || (last && last.fp === fingerprint(ext.inner))) return planned(remoteText, replaceBlock(remoteText, block), 0, false);
  // Edited inside the block: apply the app's changes since last time onto the person's version. With no base on this
  // device: if the app's text has every line of the file's block (the person only deleted), the app's text goes in;
  // otherwise both versions are kept, marked. A base counts only while the mark still has this device's last text:
  // once another device has written the block, the base would count its changes as the person's edits.
  const own = last && typeof last.base === 'string' && (!ext.fp || ext.fp === last.fp);
  const m = own ? merge(/** @type {string} */ (last?.base), mine, ext.inner)
    : !ext.inner.trim() || within(lines(ext.inner), lines(mine)) ? { text: mine, conflicts: 0 }
    : merge('', mine, ext.inner);
  // the mark keeps the app's fingerprint, never the merged text's: so the block reads as edited by the person
  return planned(remoteText, replaceBlock(remoteText, wrapBlock(m.text, fp)), m.conflicts, m.text !== mine);
}

/** @param {string} was @param {string} text @param {number} conflicts @param {boolean} merged @returns {DayPlan} */
const planned = (was, text, conflicts, merged) => ({ text, write: text !== was, conflicts, merged });
