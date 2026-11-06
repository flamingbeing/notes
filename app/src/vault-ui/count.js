// A note's words and characters, as the right sidebar's footer shows them ("79 words, 697 characters"; pure: the unit
// tests read it in Node). Counted on the text as it reads: no front matter, no Markdown marks (#, **, list marks, task
// boxes, fences), a link by its words ([[target|words]], [words](url)), an embed (![[file]]) not at all. A word is a
// run of letters or digits (with ' - _ inside it); each Chinese, Japanese or Korean character is a word of its own.
// Characters are the text's letters, digits, marks and spaces, line breaks not counted.

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** the text as it reads (pure) @param {string} body */
export function readable(body) {
  let s = String(body ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/, '');
  return s
    .replace(/%%[\s\S]*?%%/g, '')                              // comments
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[\[[^\[\]\n]*\]\]/g, '')                       // embeds
    .replace(/\[\[([^\[\]\n|#]*)(#[^\[\]\n|]*)?(?:\|([^\[\]\n]*))?\]\]/g, (_, t, h, a) => a ?? (t || (h || '').slice(1)))
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')               // images: their words
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')                // links: their words
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, '')                 // fences
    .replace(/^ {0,3}([-*_])( *\1){2,} *$/gm, '')             // rules
    .replace(/^ {0,3}#{1,6}(?=\s|$) ?/gm, '')                  // heading marks
    .replace(/^\s*(>\s?)+/gm, '')                              // quotes
    .replace(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX\-/]\]\s+)?/gm, '$1') // list marks, task boxes
    .replace(/(\*\*|~~|==|`)/g, '')                            // emphasis, code marks
    .replace(/(^|[^\p{L}\p{N}])[*_]+|[*_]+(?=$|[^\p{L}\p{N}])/gmu, '$1');
}

/** @param {string} body @returns {{ words: number, characters: number }} */
export function counts(body) {
  const text = readable(body);
  // (CJK: a word per character; the rest in runs)
  const cjk = (text.match(new RegExp(CJK.source, 'gu')) || []).length;
  const rest = text.replace(new RegExp(CJK.source, 'gu'), ' ').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’_\-.]*/gu) || [];
  const words = cjk + rest.length;
  const characters = [...text.replace(/\n/g, '')].length;
  return { words, characters };
}

/** "79 words, 697 characters" (one word, 1 character) @param {string} body */
export function countText(body) {
  const { words, characters } = counts(body);
  return `${words.toLocaleString('en')} ${words === 1 ? 'word' : 'words'}, ${characters.toLocaleString('en')} ${characters === 1 ? 'character' : 'characters'}`;
}
