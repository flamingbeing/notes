// Paste cleaner (ported from the logbook's js/paste-clean.js): rich text copied from a web page, Word, Google Docs,
// OneNote or UpNote arrives as HTML; htmlToMarkdown() turns it into light Markdown (headings, **bold**, *italic*, lists,
// to-dos, links, simple tables), dropping styles, spans and stray spaces. tidyMarkdown() tidies text that is already
// Markdown (the "Clean up" command): stray \ escapes, double spaces, ** around nothing, broken bullets.
// Pure (no DOM), tested in app/test/paste-clean.unit.test.mjs. The HTML is only read as text, never put into the page.

/** @type {Record<string, string>} */
const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–', lsquo: "'", rsquo: "'",
  ldquo: '"', rdquo: '"', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', micro: 'µ', copy: '©', reg: '®', trade: '™',
  frac12: '½', frac14: '¼', frac34: '¾', le: '≤', ge: '≥', rarr: '→', larr: '←', uarr: '↑', darr: '↓', shy: '',
};
/** @param {unknown} s */
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; } catch { return ''; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v == null ? m : v;
  });
}
// curly quotes to straight ones, no-break and odd spaces to plain spaces, invisible characters gone
export const normaliseChars = (/** @type {unknown} */ s) => String(s || '')
  .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
  .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '');

const BLOCK2 = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'hr', 'figure', 'dl']);
const BLOCK1 = new Set(['div', 'li', 'tr', 'section', 'article', 'header', 'footer', 'dt', 'dd', 'caption', 'address']);
const SKIP = /<(script|style|head|title|template|noscript|svg|xml)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** @param {string} attrs @param {string} name */
const attr = (attrs, name) => {
  const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs || '');
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const safeLink = (/** @type {string | null} */ href) => (/^(https?:|mailto:)/i.test(String(href || '').trim()) ? String(href).trim() : '');

// Word writes a list item as <p style="mso-list:l0 level1 lfo1"> with its bullet or number inside
// <![if !supportLists]>…<![endif]> (or the same as <!--[if …]--> comments). The marker becomes a token here (read at the
// end): a number or letter followed by . or ) is a numbered item, anything else a bullet.
const LI_TOKEN = /\u0002(\d+)\|([bo])\|(\d+)\u0003 */g;
/** @param {string} src */
function wordLists(src) {
  src = src.replace(/<!--\[if !supportLists\]-->/gi, '<![if !supportLists]>').replace(/<!--\[endif\]-->/gi, '<![endif]>');
  return src.replace(/(<p\b[^>]*?mso-list:\s*l\d+\s+level(\d+)[^>]*>)((?:(?!<\/p>)[\s\S])*?)<!\[if !supportLists\]>([\s\S]*?)<!\[endif\]>/gi,
    (/** @type {string} */ all, /** @type {string} */ open, /** @type {string} */ level, /** @type {string} */ before, /** @type {string} */ marker) => {
      const m = normaliseChars(decodeEntities(marker.replace(/<[^>]*>/g, ''))).trim();
      const num = /^(\d+|[a-z])[.)]$/i.exec(m);
      const n = !num ? 0 : /^\d+$/.test(num[1]) ? Number(num[1]) : num[1].toLowerCase().charCodeAt(0) - 96;
      return open + before + `\u0002${Number(level) || 1}|${num ? 'o' : 'b'}|${n}\u0003`;
    });
}

const CODE = new Set(['code', 'kbd', 'samp', 'tt']);
// the start of a text: the part a regular expression that always matches matched ("" if none)
const lead0 = (/** @type {RegExp} */ re, /** @type {string} */ s) => (re.exec(s) || [''])[0];

/** @param {unknown} html */
export function htmlToMarkdown(html) {
  let src = String(html || '');
  // what the clipboard wraps around the copied part (Windows), comments and everything that isn't text
  const frag = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(src);
  if (frag) src = frag[1];
  src = wordLists(src).replace(/<!--[\s\S]*?-->/g, '').replace(SKIP, '').replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '');
  let out = '';
  /** @type {{ mark: string, opened: boolean }[]} */
  const marks = [];        // open bold / italic
  /** @type {{ ordered: boolean, n: number }[]} */
  const lists = [];
  /** @type {{ at: number, href: string, marks: number }[]} */
  const links = [];
  /** @typedef {{ rows: number, cells: number, cell: boolean, prev: Table | null }} Table */
  /** @type {Table | null} */
  let table = null;
  let pre = 0, quote = 0, code = 0;
  const tail = () => lead0(/\n*$/, out).length;
  const brk = (/** @type {number} */ n) => {
    if (table && table.cell) { if (!/ $/.test(out)) out += ' '; return; }
    // a list item's own "- " stays on the line its text goes on (<li><p>text</p></li>)
    if (/(^|\n) *(?:- |\d+\. )(?:\[[ x]\] )?$/.test(out)) return;
    out = out.replace(/[ \t]+$/, '');
    if (!out) return;
    const have = tail();
    if (have < n) out += '\n'.repeat(n - have);
  };
  const lineStart = () => !out || /\n$/.test(out);
  // a bold or italic mark is written just before its first visible character, and closed before any trailing
  // spaces, so there is never "** **" or "**word **"
  const openPending = () => { for (const m of marks) if (!m.opened) { out += m.mark; m.opened = true; } };
  const text = (/** @type {string} */ t) => {
    // inline code keeps its spaces (only line breaks become spaces), as pre keeps everything
    if (code && !pre) { t = t.replace(/\r?\n/g, ' ').replace(/`/g, "'"); if (t) { openPending(); out += t; } return; }
    if (!pre) t = t.replace(/[\s\u00a0]+/g, ' ');
    if (!t) return;
    if (!pre && lineStart()) t = t.replace(/^ +/, '');
    if (!pre && / $/.test(out) && /^ /.test(t)) t = t.slice(1);
    if (!t) return;
    const lead = lead0(/^ */, t);
    if (lead.length === t.length) { out += t; return; }
    out += lead; openPending(); out += t.slice(lead.length);
  };
  const closeMark = (/** @type {string} */ mark) => {
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i].mark !== mark) continue;
      const [m] = marks.splice(i, 1);
      if (m.opened) {
        const sp = lead0(/ *$/, out);
        out = out.slice(0, out.length - sp.length) + mark + sp;
      }
      return;
    }
  };
  const styleMarks = (/** @type {string} */ tag, /** @type {string} */ attrs) => {
    const style = (attr(attrs, 'style') || '').toLowerCase();
    const w = /font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(style), normal = /font-weight\s*:\s*(normal|[1-4]00)/.test(style);
    const it = /font-style\s*:\s*italic/.test(style);
    const out = [];
    // Google Docs wraps the whole copy in <b style="font-weight:normal">: not bold
    if (((tag === 'b' || tag === 'strong') && !normal) || w) out.push('**');
    if (tag === 'i' || tag === 'em' || it) out.push('*');
    return out;
  };
  const stack = [];        // per open element: the marks it opened
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
  for (const m of src.matchAll(re)) {
    if (m[4] != null || m[5] != null) { text(decodeEntities(m[4] ?? m[5])); continue; }
    if (m[2].includes(':')) continue;   // Word's own tags (<o:p>, <w:…>)
    const close = !!m[1], tag = m[2].toLowerCase(), attrs = m[3] || '';
    const selfClose = /\/\s*$/.test(attrs);
    if (tag === 'br') { if (table && table.cell) out += ' '; else { out = out.replace(/ +$/, ''); out += '\n'; } continue; }
    if (tag === 'img' || tag === 'meta' || tag === 'link' || tag === 'wbr' || tag === 'col') continue;
    if (tag === 'input') {
      // a to-do box: "- [ ] " (inside a list item it follows the item's "- ")
      if (/type\s*=\s*["']?checkbox/i.test(attrs)) out += (lineStart() ? '- ' : /\s$/.test(out) ? '' : ' ') + (/\bchecked\b/i.test(attrs) ? '[x] ' : '[ ] ');
      continue;
    }
    if (!close) {
      if (/^h[1-6]$/.test(tag)) { brk(2); out += '#'.repeat(Math.min(3, Number(tag[1]))) + ' '; }
      else if (tag === 'ul' || tag === 'ol') { if (!lists.length) brk(2); else brk(1); const st = parseInt(attr(attrs, 'start') || '', 10); lists.push({ ordered: tag === 'ol', n: st > 0 ? st - 1 : 0 }); }
      else if (tag === 'li') {
        brk(1);
        const l = lists[lists.length - 1] || { ordered: false, n: 0 };
        out += '  '.repeat(Math.max(0, lists.length - 1)) + (l.ordered ? `${++l.n}. ` : '- ');
      } else if (tag === 'table') { brk(2); table = { rows: 0, cells: 0, cell: false, prev: table }; }
      else if (tag === 'tr' && table) { brk(1); out += '|'; table.cells = 0; }
      else if ((tag === 'td' || tag === 'th') && table) { out += ' '; table.cell = true; table.cells++; }
      else if (tag === 'pre') { brk(2); if (!pre) out += '```\n'; pre++; }
      else if (tag === 'blockquote') { brk(2); quote++; }
      else if (tag === 'hr') { brk(2); out += '---'; brk(2); }
      else if (BLOCK2.has(tag)) brk(2);
      else if (BLOCK1.has(tag)) brk(1);
      // inline code (not inside a code block): between backticks, so nothing in it is tidied
      if (CODE.has(tag) && !pre && !selfClose) { if (!code) { openPending(); out += '`'; } code++; }
      if (tag === 'a') links.push({ at: out.length, href: safeLink(attr(attrs, 'href')), marks: marks.length });
      const opened = styleMarks(tag, attrs);
      for (const mk of opened) marks.push({ mark: mk, opened: false });
      if (!selfClose) stack.push({ tag, opened });
      continue;
    }
    // closing tag: close what the matching opening tag opened
    let i = stack.length - 1;
    while (i >= 0 && stack[i].tag !== tag) i--;
    if (i < 0) continue;
    const closing = stack.splice(i);
    for (const el of closing.reverse()) {
      for (const mk of [...el.opened].reverse()) closeMark(mk);
      const t = el.tag;
      if (CODE.has(t) && code && !pre) { code--; if (!code) out = /`$/.test(out) ? out.slice(0, -1) : out + '`'; }
      if (t === 'a') {
        const l = links.pop();
        if (l) {
          // a bold or italic run that starts with the link opened its mark inside it: the mark goes in front of the [
          let inner = out.slice(l.at), lead = '';
          const mk = /^(\s*)(\*{1,3})(?=\S)/.exec(inner);
          if (mk && !inner.trimEnd().endsWith(mk[2])) { lead = mk[0]; inner = inner.slice(lead.length); }
          const label = inner.trim();
          // (a function, so a $ in the label is never read as a replacement pattern)
          if (l.href && label && label !== l.href && !/\n/.test(label)) out = out.slice(0, l.at) + lead + inner.replace(label, () => `[${label.replace(/[[\]*]/g, '')}](${l.href})`);
          else if (l.href && !label) out += l.href;
        }
      } else if (t === 'ul' || t === 'ol') { lists.pop(); brk(lists.length ? 1 : 2); }
      else if ((t === 'td' || t === 'th') && table) { out = out.replace(/ +$/, '') + ' |'; table.cell = false; }
      else if (t === 'tr' && table) {
        table.rows++;
        if (table.rows === 1 && table.cells) out += '\n|' + ' --- |'.repeat(table.cells);
        brk(1);
      } else if (t === 'table' && table) { table = table.prev; brk(2); }
      else if (t === 'pre') { pre = Math.max(0, pre - 1); if (!pre) { out = out.replace(/\n*$/, '') + '\n```'; } brk(2); }
      else if (t === 'blockquote') { quote = Math.max(0, quote - 1); brk(2); }
      else if (/^h[1-6]$/.test(t) || BLOCK2.has(t)) brk(2);
      else if (BLOCK1.has(t)) brk(1);
    }
  }
  // Word's list items (wordLists): the bullet or number, indented by level
  out = out.replace(LI_TOKEN, (all, level, kind, n) => '  '.repeat(Number(level) - 1) + (kind === 'o' ? `${Number(n) || 1}. ` : '- '));
  return tidyMarkdown(out);
}

// ** pairs in one line, left to right: ** around nothing go, and spaces just inside a pair move out of it
/** @param {string} l */
function boldSpaces(l) {
  const parts = l.split('**');
  if (parts.length < 3) return l;
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    const inner = parts[i], after = parts[i + 1];
    if (after === undefined) { out += '**' + inner; break; }   // a lone ** (2**3) stays
    if (!inner.trim()) out += inner + after;
    else if (inner.includes('*')) out += '**' + inner + '**' + after;
    else {
      const lead = lead0(/^\s*/, inner), trail = lead0(/\s*$/, inner);
      out += lead + '**' + inner.trim() + '**' + trail + after;
    }
  }
  return out;
}

// Tidy Markdown that is already in the note (or just converted). Changes only what is clearly a leftover; code (```
// fences) is left exactly as it is.
/** @param {unknown} md */
export function tidyMarkdown(md) {
  let s = normaliseChars(String(md || '').replace(/\r\n?/g, '\n'));
  let fence = false;
  s = s.split('\n').map(line => {
    if (/^\s*```/.test(line)) { fence = !fence; return line.replace(/\s+$/, ''); }
    if (fence) return line;
    let l = line.replace(/\s+$/, '');
    // escapes some exports add (UpNote, Notion, OneNote via converters): 1\. \- \* \# \[ … become plain; a real
    // backslash (\\server\share, C:\path) stays, and so does anything inside `code`
    // Only where an export puts them: \* \_ \[ \] \~ \` \# anywhere, and \- \+ \> \| 1\. at the start of a line, so a
    // pasted regex or path (^\d+\.\s, \(x\)) keeps its backslashes
    l = l.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/(^|[^\\])\\([`*_[\]~#])/g, '$1$2'))).join('')
      .replace(/^(\s*)\\([-+>|])/, '$1$2').replace(/^(\s*\d+)\\\./, '$1.');
    // bullets typed or pasted as symbols, and to-do boxes as symbols (☒ is left: it often means "no")
    l = l.replace(/^(\s*)[☐□]\s*/, '$1- [ ] ').replace(/^(\s*)[☑✅✓✔]\s+/, '$1- [x] ')
      .replace(/^(\s*)[•·◦▪▫●○■➢►‣⁃]\s*/, '$1- ')
      .replace(/^(\s*)([-*+])\s*\[\s?\]\s*/, '$1$2 [ ] ').replace(/^(\s*)([-*+])\s*\[[xX]\]\s*/, '$1$2 [x] ');
    // ** or __ around nothing, and marks with the spaces inside them moved out
    // (the ** are paired left to right first, so the end of one bold and the start of the next never pair up)
    l = boldSpaces(l.replace(/__(\s*)__/g, '$1'));
    // double spaces inside the line; the indent of a nested list stays (spaces moved out of a mark don't make one)
    const indent = lead0(/^\s*/, line.trimEnd());
    return indent + l.trimStart().split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/ {2,}/g, ' '))).join('');
  }).join('\n');
  // a list broken up by blank lines (loose lists from some exports) becomes one list; two lists of different kinds
  // (bullets, then numbers) side by side stay apart
  const kind = (/** @type {string} */ l) => (/^\s*[-*+]\s+\S/.test(l) ? 'b' : /^\s*\d+[.)]\s+\S/.test(l) ? 'o' : '');
  const lines = s.split('\n'), keep = [];
  fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fence = !fence;
    // runs of blank lines become one (inside code too, they stay as they are)
    if (!fence && !lines[i].trim() && (!keep.length || !keep[keep.length - 1].trim())) continue;
    const last = keep.length ? kind(keep[keep.length - 1]) : '';
    if (!fence && !lines[i].trim() && last) {
      let j = i; while (j < lines.length && !lines[j].trim()) j++;
      const next = j < lines.length ? kind(lines[j]) : '';
      // (a nested item, indented, belongs to the list above whatever its kind)
      if (next && (next === last || /^\s+/.test(lines[j]))) { i = j - 1; continue; }
    }
    keep.push(lines[i]);
  }
  return keep.join('\n').replace(/\s+$/, '');
}
