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
      return { type: 'wikilink', raw: m[0], target, embed: m[1] === '!', text: (m[4] ?? '').trim() || (target + (m[3] || '')) || m[0] };
    },
    renderer: (/** @type {any} */ t) => (!t.target ? escape(t.raw)
      // ![[x]]: a picture or file of the space (readView fills it in); a note by that name, a link as before
      : t.embed ? `<span class="embed" data-embed="${escape(t.target)}" data-alt="${escape(t.text)}"></span>`
        : `<a href="#" class="wikilink" data-note="${escape(t.target)}">${escape(t.text)}</a>`),
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

// a relative picture path ![](img/a.png) is kept in data-src, so the browser doesn't ask the server for it; readView
// shows the space's attachment of that name, if there is one
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!/^(https?:|data:image\/|blob:)/i.test(src)) { node.removeAttribute('src'); node.setAttribute('data-src', src); }
  }
});

/** a note's Markdown -> safe HTML @param {string} text */
export const toHtml = text => DOMPurify.sanitize(/** @type {string} */ (marked.parse(text, { async: false })), {
  FORBID_ATTR: ['style'], FORBID_TAGS: ['style', 'form'], ADD_ATTR: ['target'],
});

/**
 * @typedef {{ id: string, name: string, type: string }} Att
 * @typedef {object} Files  the space's attachments
 * @property {(target: string) => Att | null} resolve  the attachment a reference means
 * @property {(a: Att) => Promise<string>} url  a URL to show it
 * @property {(target: string) => void} open  open a file that isn't a picture
 */

/** pictures and files named in the page: ![[x]] and ![](x) @param {HTMLElement} box @param {Files} files */
function fillEmbeds(box, files) {
  const done = (/** @type {Element} */ el, /** @type {Att | null} */ a, /** @type {string} */ target, /** @type {string} */ alt) => {
    if (!a) {
      const gone = document.createElement('span');
      gone.className = 'missing-file'; gone.textContent = alt || target;
      el.replaceWith(gone);
      return;
    }
    if (/^image\/(png|jpeg|webp|gif|avif)$/.test(a.type)) {
      const img = document.createElement('img');
      img.alt = alt || a.name;
      el.replaceWith(img);
      void files.url(a).then(u => { img.src = u; }, () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'missing-file', textContent: alt || a.name })));
    } else {
      const link = document.createElement('a');
      link.href = '#'; link.className = 'file'; link.dataset.file = target; link.textContent = alt || a.name;
      el.replaceWith(link);
    }
  };
  for (const el of box.querySelectorAll('[data-embed]')) {
    const target = /** @type {HTMLElement} */ (el).dataset.embed || '';
    if (!files.resolve(target)) {   // no such file: a note's embed stays a link to the note (embeds of notes come later)
      const a = document.createElement('a');
      a.href = '#'; a.className = 'wikilink'; a.dataset.note = target; a.textContent = /** @type {HTMLElement} */ (el).dataset.alt || target;
      el.replaceWith(a);
      continue;
    }
    done(el, files.resolve(target), target, /** @type {HTMLElement} */ (el).dataset.alt === target ? '' : /** @type {HTMLElement} */ (el).dataset.alt || '');
  }
  for (const el of box.querySelectorAll('img[data-src]')) {
    const target = /** @type {HTMLElement} */ (el).dataset.src || '', alt = el.getAttribute('alt') || '';
    done(el, files.resolve(target), target, alt);
  }
}

/** @param {HTMLElement} box @param {(target: string) => void} onLink @param {Files} [files] */
export function readView(box, onLink, files) {
  box.addEventListener('click', e => {
    const f = /** @type {HTMLElement} */ (e.target).closest('a.file[data-file]');
    if (f) { e.preventDefault(); files?.open(/** @type {HTMLElement} */ (f).dataset.file || ''); return; }
    const a = /** @type {HTMLElement} */ (e.target).closest('a.wikilink[data-note]');
    if (!a) return;
    e.preventDefault();
    onLink(/** @type {HTMLElement} */ (a).dataset.note || '');
  });
  return { show: (/** @type {string} */ text) => { box.innerHTML = toHtml(text); if (files) fillEmbeds(box, files); } };
}
