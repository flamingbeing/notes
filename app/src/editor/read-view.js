// The read view: a note's Markdown as a page (marked, GitHub-flavoured, with the notes' [[links]] as links), cleaned by
// DOMPurify before it reaches the page (a note can hold any HTML; scripts, event handlers and style attributes go).
// A click on a [[link]] calls onLink with its target; other links open in a new tab.
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const WIKILINK = /^(!?)\[\[([^[\]\n|#]*)(#[^[\]\n|]*)?(?:\|([^[\]\n]*))?\]\]/;
const escape = (/** @type {string} */ s) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// style="…" in a note's own HTML: DOMPurify drops it anyway, but the page's CSP reports it while DOMPurify parses (the
// parser's document shares the page's policy), so it goes before then
const STYLE_ATTR = /\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const marked = new Marked({
  gfm: true,
  walkTokens: (/** @type {any} */ t) => { if (t.type === 'html' && typeof t.text === 'string') t.text = t.text.replace(STYLE_ATTR, ''); },
  extensions: [{
    name: 'wikilink',
    level: 'inline',
    start: (/** @type {string} */ src) => { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
    tokenizer(/** @type {string} */ src) {
      const m = WIKILINK.exec(src);
      if (!m) return undefined;
      const target = m[2].trim();
      return { type: 'wikilink', raw: m[0], target, text: (m[4] ?? '').trim() || (target + (m[3] || '')) || m[0] };
    },
    renderer: (/** @type {any} */ t) => (t.target
      ? `<a href="#" class="wikilink" data-note="${escape(t.target)}">${escape(t.text)}</a>`
      : escape(t.raw)),
  }],
});

// links out open in a new tab, without the page knowing where they came from; a to-do's box says what it is
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') node.setAttribute('aria-label', node.hasAttribute('checked') ? 'Done' : 'To do');
  if (node.tagName === 'A' && !node.classList.contains('wikilink') && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** a note's Markdown -> safe HTML @param {string} text */
export const toHtml = text => DOMPurify.sanitize(/** @type {string} */ (marked.parse(text, { async: false })), {
  FORBID_ATTR: ['style'], FORBID_TAGS: ['style', 'form'], ADD_ATTR: ['target'],
});

/** @param {HTMLElement} box @param {(target: string) => void} onLink */
export function readView(box, onLink) {
  box.addEventListener('click', e => {
    const a = /** @type {HTMLElement} */ (e.target).closest('a.wikilink[data-note]');
    if (!a) return;
    e.preventDefault();
    onLink(/** @type {HTMLElement} */ (a).dataset.note || '');
  });
  return { show: (/** @type {string} */ text) => { box.innerHTML = toHtml(text); } };
}
