// The formatting bar over the editor (ported from the logbook's full bar): **bold**, *italic*, # heading, "- " bullets,
// "1. " numbers, "- [ ] " to-dos, indent and outdent, [links](…), the clipboard's address as a link, Undo and Redo. Each writes a little Markdown into the CodeMirror view, as one
// change, so Undo (and Ctrl+Z) takes it back. The buttons don't take the focus, so the selection stays.
import { ICONS, iconOf } from '../icons.js';
import { EditorSelection, undo, redo, undoDepth, redoDepth } from '@vendor/codemirror';
import { linkFor } from '../notes/paste-link.js';

/** @typedef {import('@codemirror/view').EditorView} View */

/** @param {View} view @param {number} a @param {number} b @param {string} text @param {number} [sa] @param {number} [sb] */
function replaceRange(view, a, b, text, sa = a + text.length, sb = sa) {
  view.dispatch({ changes: { from: a, to: b, insert: text }, selection: EditorSelection.range(sa, sb), userEvent: 'input.format', scrollIntoView: true });
  view.focus();
}

/** @param {() => View | null} viewOf  the editor (null until it has loaded) @returns {HTMLElement & { refresh: (view: View) => void }} */
export function fmtBar(viewOf) {
  /** @param {View} view */
  const sel = view => {
    const { from: a, to: b } = view.state.selection.main, v = view.state.doc.toString();
    const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b) < 0 ? v.length : v.indexOf('\n', b);
    return { a, b, v, ls, le };
  };
  /** @param {View} view @param {string} mark */
  const wrap = (view, mark) => {
    const { a, b, v } = sel(view), n = mark.length;
    if (a === b) return replaceRange(view, a, b, mark + mark, a + n);
    // already wrapped: take the marks off
    if (v.slice(a - n, a) === mark && v.slice(b, b + n) === mark && (n > 1 || (v[a - 2] !== '*' && v[b + 1] !== '*'))) return replaceRange(view, a - n, b + n, v.slice(a, b), a - n, b - n);
    return replaceRange(view, a, b, mark + v.slice(a, b) + mark, a + n, b + n);
  };
  // every line of the selection gets the prefix, or loses it when all have it already
  /** @param {View} view @param {RegExp} has @param {(i: number) => string} add */
  const prefix = (view, has, add) => {
    const { v, ls, le } = sel(view);
    const block = v.slice(ls, le).split('\n');
    const done = block.every(l => has.test(l));
    const out = block.map((l, i) => (done ? l.replace(has, '') : add(i) + l.replace(/^(\d+\.|[-*+](\s\[[ xX]\])?|#{1,3})\s/, ''))).join('\n');
    replaceRange(view, ls, le, out, ls, ls + out.length);
  };
  /** @param {View} view */
  const link = view => {
    const { a, b, v } = sel(view), t = v.slice(a, b);
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return replaceRange(view, a, b, `[link](${t})`, a + 1, a + 5);
    const label = t || 'link', text = `[${label}](https://)`;
    return replaceRange(view, a, b, text, a + label.length + 3, a + text.length - 1);   // the address part, ready to paste over
  };
  // every line of the selection moves two spaces in, or out (a nested list item)
  /** @param {View} view @param {boolean} out */
  const shift = (view, out) => {
    const { v, ls, le } = sel(view);
    const numbered = (/** @type {string} */ l) => /^\s*\d+\.\s/.test(l);   // "1. " nests under 3 spaces, "- " under 2
    const text = v.slice(ls, le).split('\n').map(l => (out ? l.replace(numbered(l) ? /^(\t| {1,3})/ : /^(\t| {1,2})/, '') : l.trim() ? (numbered(l) ? '   ' : '  ') + l : l)).join('\n');
    if (text !== v.slice(ls, le)) replaceRange(view, ls, le, text, ls, ls + text.length);
  };
  // the address on the clipboard, as a titled link (the selected text, if any, is its title)
  /** @param {View} view */
  const pasteLink = async view => {
    let clip = '';
    try { clip = await navigator.clipboard.readText(); } catch { /* refused or no clipboard: the Link button still works */ }
    const { a, b, v } = sel(view), md = linkFor(clip, v.slice(a, b));
    if (md) replaceRange(view, a, b, md);
  };
  /** @param {string} label @param {string} aria @param {(view: View) => void} fn @param {string} [tag] */
  const btn = (label, aria, fn, tag = '') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'small'; b.title = aria; b.setAttribute('aria-label', aria);
    if (Object.hasOwn(ICONS, label)) b.append(iconOf(label)); else if (tag) b.append(Object.assign(document.createElement(tag), { textContent: label })); else b.textContent = label;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => { const view = viewOf(); if (view && !view.state.readOnly) fn(view); });
    return b;
  };
  const bar = /** @type {HTMLElement & { refresh: (view: View) => void }} */ (/** @type {unknown} */ (document.createElement('div')));
  bar.className = 'fmt-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Formatting');
  bar.append(
    btn('B', 'Bold', v => wrap(v, '**'), 'b'), btn('I', 'Italic', v => wrap(v, '*'), 'i'),
    btn('H', 'Heading', v => prefix(v, /^#{1,3}\s/, () => '# ')),
    btn('•', 'Bullet list', v => prefix(v, /^[-*+]\s(?!\[[ xX]\])/, () => '- ')),
    btn('1.', '1. Numbered list', v => prefix(v, /^\d+\.\s/, i => `${i + 1}. `)),
    btn('squareCheck', 'To-do', v => prefix(v, /^[-*+]\s\[[ xX]\]\s/, () => '- [ ] ')),
    btn('⇤', 'Outdent', v => shift(v, true)), btn('⇥', 'Indent', v => shift(v, false)),
    btn('Link', 'Link', link), btn('Paste', 'Paste the copied address as a link', v => void pasteLink(v)),
    btn('undo', 'Undo', v => { undo(v); v.focus(); }), btn('redo', 'Redo', v => { redo(v); v.focus(); }),
  );
  const [undoBtn, redoBtn] = /** @type {HTMLButtonElement[]} */ ([...bar.querySelectorAll('[aria-label="Undo"], [aria-label="Redo"]')]);
  /** greys Undo and Redo when there is nothing to undo or redo; called on each editor update @param {View} view */
  bar.refresh = view => {
    undoBtn.disabled = undoDepth(view.state) === 0;
    redoBtn.disabled = redoDepth(view.state) === 0;
  };
  return bar;
}
