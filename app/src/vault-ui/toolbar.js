// The Vault layout's mobile toolbar: a white band flush on the keyboard while a note is edited (the keyboard up, the
// editor focused), in place of the Classic formatting bar (editor/fmt-bar.js, left as it is). Undo, Redo, a [[link]],
// a #tag, a file, a heading (# to ### and off), **bold**, *italic*, ~~strike~~, ==highlight==, a bullet, a to-do,
// indent, unindent, and Hide keyboard; with the Line spacing extra on, its button too. It scrolls sideways when it is
// wider than the screen. Bold, italic, strike, highlight and heading look pressed where the cursor is in one. Each
// button writes a little Markdown as one change (Undo takes it back) and keeps the focus in the editor, so the
// keyboard stays; the change reaches the page's autosave like typing (the write queue).
import { EditorSelection, undo, redo, undoDepth, redoDepth, syntaxTree } from '@vendor/codemirror';
import { glyph } from './icons.js';
import { TOOLBAR } from './settings-map.js';

/** @typedef {import('@codemirror/view').EditorView} View */

/** @param {View} view @param {number} a @param {number} b @param {string} text @param {number} [sa] @param {number} [sb] */
function put(view, a, b, text, sa = a + text.length, sb = sa) {
  view.dispatch({ changes: { from: a, to: b, insert: text }, selection: EditorSelection.range(sa, sb), userEvent: 'input.format', scrollIntoView: true });
}
/** @param {View} view */
const sel = view => {
  const { from: a, to: b } = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(a), toLine = view.state.doc.lineAt(b);
  return { a, b, ls: fromLine.from, le: toLine.to, text: view.state.sliceDoc(a, b) };
};

/** the selection wrapped in a mark (**), or the mark taken off when it has it @param {View} view @param {string} mark */
export function wrap(view, mark) {
  const { a, b, text } = sel(view), n = mark.length;
  if (a === b) return put(view, a, b, mark + mark, a + n);
  const around = view.state.sliceDoc(a - n, a) === mark && view.state.sliceDoc(b, b + n) === mark;
  // (* around **bold**: not italic marks)
  const single = n > 1 || (view.state.sliceDoc(a - 2, a - 1) !== '*' && view.state.sliceDoc(b + 1, b + 2) !== '*');
  if (around && single) return put(view, a - n, b + n, text, a - n, b - n);
  if (text.length > 2 * n && text.startsWith(mark) && text.endsWith(mark)) return put(view, a, b, text.slice(n, -n), a, b - 2 * n);
  return put(view, a, b, mark + text + mark, a + n, b + n);
}

/** every line of the selection given a prefix, or losing it when all have it @param {View} view @param {RegExp} has @param {string} add */
export function prefix(view, has, add) {
  const { ls, le } = sel(view);
  const block = view.state.sliceDoc(ls, le).split('\n');
  const done = block.every(l => has.test(l.trimStart()));
  const out = block.map(l => {
    const indent = /^\s*/.exec(l)?.[0] || '';
    const rest = l.slice(indent.length);
    return done ? indent + rest.replace(has, '') : indent + add + rest.replace(/^([-*+]\s\[[ xX]\]|[-*+]|\d+\.|#{1,6})\s/, '');
  }).join('\n');
  put(view, ls, le, out, ls + out.length);
}
// (the tests read the line after its indent)
const BULLET = /^[-*+]\s(?!\[[ xX]\]\s)/, TASK = /^[-*+]\s\[[ xX]\]\s/;

/** the heading of the cursor's line one level on: none, #, ##, ###, none @param {View} view */
export function cycleHeading(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /^(#{1,6})\s/.exec(line.text);
  const level = m ? m[1].length : 0;
  const mark = level >= 3 ? '' : '#'.repeat(level + 1) + ' ';
  const cut = m ? m[0].length : 0;
  const head = view.state.selection.main.head - line.from;
  put(view, line.from, line.from + cut, mark, line.from + Math.max(mark.length, head - cut + mark.length));
}

/** every line of the selection two spaces in, or out @param {View} view @param {boolean} out */
export function shift(view, out) {
  const { ls, le, a, b } = sel(view);
  const was = view.state.sliceDoc(ls, le);
  const lines = was.split('\n');
  const text = lines.map(l => (out ? l.replace(/^(\t| {1,2})/, '') : l.trim() ? '  ' + l : l)).join('\n');
  if (text === was) return;
  const first = text.split('\n')[0].length - lines[0].length;
  put(view, ls, le, text, Math.max(ls, a + first), Math.max(ls, b + text.length - was.length));
}

/** [[ ]] round the selection, or empty with the cursor between @param {View} view */
export function internalLink(view) {
  const { a, b, text } = sel(view);
  if (a === b) return put(view, a, b, '[[]]', a + 2);
  return put(view, a, b, `[[${text}]]`, a + text.length + 4);
}

/** a # at the cursor (after a space, so it starts a tag) @param {View} view */
export function addTag(view) {
  const { a, b } = sel(view);
  const before = view.state.sliceDoc(a - 1, a);
  const text = before && !/\s/.test(before) ? ' #' : '#';
  put(view, a, b, text);
}

/** which styles the cursor is in: bold, italic, strike, highlight, heading @param {View} view */
export function activeAt(view) {
  const { state } = view;
  const pos = state.selection.main.head;
  /** @type {Set<string>} */
  const on = new Set();
  for (let n = /** @type {any} */ (syntaxTree(state).resolveInner(pos, -1)); n; n = n.parent) {
    if (n.name === 'StrongEmphasis') on.add('bold');
    else if (n.name === 'Emphasis') on.add('italic');
    else if (n.name === 'Strikethrough') on.add('strike');
  }
  const line = state.doc.lineAt(pos), col = pos - line.from;
  if (/^#{1,6}\s/.test(line.text)) on.add('heading');
  for (const m of line.text.matchAll(/==[^=\n]+==/g)) if ((m.index ?? 0) < col && col < (m.index ?? 0) + m[0].length) on.add('highlight');
  return on;
}

const SPACINGS = ['tight', 'normal', 'roomy'];
const SPACING_LABEL = /** @type {Record<string, string>} */ ({ tight: 'Tight', normal: 'Normal', roomy: 'Roomy' });

/**
 * @param {{
 *   view: () => View | null, reading: () => boolean, writable: () => boolean, settings: { get: (k: string) => unknown, set: (k: string, v: unknown) => unknown, watch: (k: string | null, f: () => void) => unknown },
 *   on: (key: string) => boolean, attach: () => void, host: HTMLElement,
 * }} o  view: the editor (null until it loads); writable: the note can be edited here; attach: the page's file picker
 */
export function mobileToolbar(o) {
  const html = document.documentElement;
  const bar = document.createElement('div');
  bar.id = 'vl-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatting');
  bar.hidden = true;
  /** @type {Map<string, HTMLButtonElement>} */
  const pressable = new Map();
  /** a command of the toolbar (its glyph and name: settings-map.js, which the Mobile toolbar page lists too)
   * @param {string} id @param {(v: View) => void} run @param {string} [state]  the style it shows pressed */
  const btn = (id, run, state = '') => {
    const { icon, label } = TOOLBAR.find(t => t.id === id) || { icon: 'x', label: id };
    const b = document.createElement('button');
    b.type = 'button'; b.id = `vl-tb-${id}`; b.className = 'vl-tb-btn';
    b.setAttribute('aria-label', label);
    b.append(glyph(icon));
    // (the editor keeps the focus, and the keyboard stays up)
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => {
      const v = o.view();
      if (!v || v.state.readOnly) return;
      run(v);
      if (id !== 'hide') v.focus();
      refresh();
    });
    if (state) { b.setAttribute('aria-pressed', 'false'); pressable.set(state, b); }
    return b;
  };
  const undoBtn = btn('undo', v => { undo(v); });
  const redoBtn = btn('redo', v => { redo(v); });
  bar.append(
    undoBtn, redoBtn,
    btn('link', internalLink),
    btn('tag', addTag),
    btn('attach', () => o.attach()),
    btn('heading', cycleHeading, 'heading'),
    btn('bold', v => wrap(v, '**'), 'bold'),
    btn('italic', v => wrap(v, '*'), 'italic'),
    btn('strike', v => wrap(v, '~~'), 'strike'),
    btn('highlight', v => wrap(v, '=='), 'highlight'),
    btn('list', v => prefix(v, BULLET, '- ')),
    btn('task', v => prefix(v, TASK, '- [ ] ')),
    btn('indent', v => shift(v, false)),
    btn('unindent', v => shift(v, true)),
  );
  // the Line spacing extra's button: Tight, Normal, Roomy in turn
  const spacing = document.createElement('button');
  spacing.type = 'button'; spacing.id = 'vl-tb-spacing'; spacing.className = 'vl-tb-btn vl-tb-text';
  spacing.addEventListener('mousedown', e => e.preventDefault());
  spacing.addEventListener('click', () => {
    const now = String(o.settings.get('lineSpacing') || 'normal');
    void o.settings.set('lineSpacing', SPACINGS[(SPACINGS.indexOf(now) + 1) % SPACINGS.length]);
  });
  bar.append(spacing, btn('hide', v => v.contentDOM.blur()));
  o.host.append(bar);

  const refresh = () => {
    const v = o.view();
    const word = SPACING_LABEL[String(o.settings.get('lineSpacing') || 'normal')] || 'Normal';
    spacing.textContent = word;
    spacing.setAttribute('aria-label', `Line spacing: ${word}`);
    spacing.hidden = !o.on('xLineSpacing');
    if (!v || bar.hidden) return;
    undoBtn.toggleAttribute('data-off', undoDepth(v.state) === 0);
    redoBtn.toggleAttribute('data-off', redoDepth(v.state) === 0);
    const on = activeAt(v);
    for (const [k, b] of pressable) b.setAttribute('aria-pressed', String(on.has(k)));
  };
  // shown while the keyboard is up over a focused editor this person can write in, with the toolbar setting on
  const show = () => {
    const v = o.view();
    const want = !!v && v.hasFocus && html.classList.contains('ui-keyboard-open') && !o.reading() && o.writable()
      && !!o.settings.get('fmtBar') && !html.classList.contains('vl-blank');
    if (want !== !bar.hidden) {
      bar.hidden = !want;
      html.classList.toggle('vl-tb-on', want);
      if (want) bar.scrollLeft = 0;
    }
    refresh();
  };
  new MutationObserver(show).observe(html, { attributes: true, attributeFilter: ['class'] });
  // (a focus moving: settled after the event)
  const later = () => requestAnimationFrame(show);
  document.addEventListener('focusin', later);
  document.addEventListener('focusout', later);
  o.settings.watch(null, show);
  show();
  return { el: bar, show, refresh };
}
