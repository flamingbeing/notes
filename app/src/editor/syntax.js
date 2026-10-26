// What the notes add to Markdown, as nodes in the editor's syntax tree: [[links]] (and ![[embeds]]) and #tags, by the
// same rules as notes/parse.js (a link is [[target#heading|alias]]; a tag is not inside a word and not all digits).
// The Markdown parser leaves code spans and blocks alone, so neither is found there, as in parse.js.
import { tags } from '@vendor/codemirror';

const LINK = /^(!?)\[\[([^[\]\n|#]*)(#[^[\]\n|]*)?(?:\|([^[\]\n]*))?\]\]/;
const TAG = /^#([\p{L}\p{N}_\-/]+)/u;
const NOT_BEFORE_TAG = /[\p{L}\p{N}_&/#]/u;
const OPEN = 91, BANG = 33, HASH = 35;   // [ ! #

/** @type {import('@lezer/markdown').MarkdownConfig} */
export const notesSyntax = {
  defineNodes: [
    { name: 'WikiLink', style: tags.link },
    { name: 'WikiLinkMark', style: tags.processingInstruction },
    { name: 'WikiLinkTarget' },
    { name: 'WikiLinkAlias' },
    { name: 'Hashtag', style: tags.labelName },
  ],
  parseInline: [{
    name: 'WikiLink',
    before: 'Link',
    parse(cx, next, pos) {
      if (next !== OPEN && next !== BANG) return -1;
      if (next === BANG && cx.char(pos + 1) !== OPEN) return -1;
      const m = LINK.exec(cx.slice(pos, cx.end));
      if (!m) return -1;
      const open = pos + m[1].length + 2, end = pos + m[0].length;
      const targetEnd = open + m[2].length + (m[3] || '').length;
      const children = [cx.elt('WikiLinkMark', pos, open), cx.elt('WikiLinkTarget', open, targetEnd)];
      if (m[4] !== undefined) children.push(cx.elt('WikiLinkMark', targetEnd, targetEnd + 1), cx.elt('WikiLinkAlias', targetEnd + 1, end - 2));
      children.push(cx.elt('WikiLinkMark', end - 2, end));
      return cx.addElement(cx.elt('WikiLink', pos, end, children));
    },
  }, {
    name: 'Hashtag',
    parse(cx, next, pos) {
      if (next !== HASH) return -1;
      const before = pos > cx.offset ? cx.slice(pos - 1, pos) : '';
      if (before && NOT_BEFORE_TAG.test(before)) return -1;
      const m = TAG.exec(cx.slice(pos, cx.end));
      if (!m || /^\d+$/.test(m[1])) return -1;
      return cx.addElement(cx.elt('Hashtag', pos, pos + m[0].length));
    },
  }],
};
