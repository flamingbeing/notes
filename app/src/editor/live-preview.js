// Live preview: the note's Markdown drawn as it will read (headings sized, **bold** bold, [[links]] as links, to-do boxes
// as boxes), with the marks themselves hidden, except on the lines the cursor or selection is on, which show the raw
// Markdown to edit. Decorations from a state field over the syntax tree (rebuilt when the text, selection or tree
// changes; bold, italics, code and links get their look from the editor's highlighting, in source mode too).
// Clicking a [[link]] off the cursor's line opens its note (onLink); clicking a box ticks it.
import { StateField, EditorView, Decoration, WidgetType, syntaxTree } from '@vendor/codemirror';

/** @typedef {import('@codemirror/state').EditorState} EditorState */
/** @typedef {import('@codemirror/state').Range<import('@codemirror/view').Decoration>} Range */
/** @typedef {import('@lezer/common').SyntaxNodeRef} NodeRef */

const hide = Decoration.replace({});

class Box extends WidgetType {
  /** @param {boolean} done */
  constructor(done) { super(); this.done = done; }
  /** @param {Box} other */
  eq(other) { return other.done === this.done; }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox'; box.className = 'cm-task'; box.checked = this.done;
    box.setAttribute('aria-label', this.done ? 'Done' : 'To do');
    return box;
  }
  ignoreEvent() { return false; }
}
class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { return Object.assign(document.createElement('span'), { className: 'cm-bullet', textContent: '•' }); }
}
const bullet = Decoration.replace({ widget: new Bullet() });
const boxes = [false, true].map(done => Decoration.replace({ widget: new Box(done) }));

/** @param {EditorState} state */
function build(state) {
  const { doc } = state;
  /** @type {Set<number>} the lines shown raw */
  const raw = new Set();
  for (const r of state.selection.ranges) for (let l = doc.lineAt(r.from).number; l <= doc.lineAt(r.to).number; l++) raw.add(l);
  /** @param {number} from @param {number} to  true: no line of [from, to] is shown raw */
  const off = (from, to) => { for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) if (raw.has(l)) return false; return true; };
  /** @param {number} from @param {number} to  hide [from, to) and one space after it */
  const hideMark = (from, to) => out.push(hide.range(from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to));
  /** @param {number} from @param {number} to @param {string} cls  a class on every line of [from, to] */
  const lines = (from, to, cls) => { for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) out.push(Decoration.line({ class: cls }).range(doc.line(l).from)); };
  /** @type {Range[]} */
  const out = [];
  syntaxTree(state).iterate({
    enter(n) {
      const name = n.name;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) { lines(n.from, n.from, `cm-h cm-h${heading[1]}`); return; }
      switch (name) {
        case 'HeaderMark':
          if (/^ATXHeading/.test(n.node.parent?.name || '') && off(n.from, n.to)) hideMark(n.from, n.to);
          break;
        case 'EmphasisMark': case 'StrikethroughMark':
          if (off(n.from, n.to)) out.push(hide.range(n.from, n.to));
          break;
        case 'CodeMark':
          if (n.node.parent?.name === 'InlineCode' && off(n.from, n.to)) out.push(hide.range(n.from, n.to));
          break;
        case 'Link':
          // [text](address "title"): the text stays
          if (off(n.from, n.to)) for (let c = n.node.firstChild; c; c = c.nextSibling) if (/^(LinkMark|URL|LinkTitle)$/.test(c.name)) out.push(hide.range(c.from, c.to));
          return false;
        case 'WikiLink': {
          const target = n.node.getChild('WikiLinkTarget');
          const alias = n.node.getChild('WikiLinkAlias');
          const to = target ? doc.sliceString(target.from, target.to).split('#')[0].trim() : '';
          out.push(Decoration.mark({ class: 'cm-wikilink', attributes: to ? { 'data-note': to } : {} }).range(n.from, n.to));
          if (off(n.from, n.to)) {
            // [[target]] shows target; [[target|alias]] shows alias
            for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'WikiLinkMark' || (alias && c.name === 'WikiLinkTarget')) out.push(hide.range(c.from, c.to));
          }
          return false;
        }
        case 'TaskMarker':
          if (off(n.from, n.to)) out.push(boxes[/x/i.test(doc.sliceString(n.from, n.to)) ? 1 : 0].range(n.from, n.to));
          break;
        case 'ListMark': {
          // "- " becomes a bullet; before a to-do box it goes (the box is enough); numbers stay
          const task = n.node.nextSibling?.name === 'Task';
          if (!off(n.from, n.to) || !/^[-*+]$/.test(doc.sliceString(n.from, n.to))) break;
          if (task) hideMark(n.from, n.to); else out.push(bullet.range(n.from, n.to));
          break;
        }
        case 'QuoteMark':
          if (off(n.from, n.to)) hideMark(n.from, n.to);
          break;
        case 'Blockquote': lines(n.from, n.to, 'cm-quote'); break;
        case 'FencedCode': case 'CodeBlock': lines(n.from, n.to, 'cm-codeblock'); break;
        case 'HorizontalRule':
          lines(n.from, n.from, 'cm-hr');
          if (off(n.from, n.to)) out.push(hide.range(n.from, n.to));
          break;
      }
      return undefined;
    },
  });
  return Decoration.set(out, true);
}

/**
 * @param {{ onLink: (target: string) => void, tickToBottom?: boolean }} o
 * @returns {import('@codemirror/state').Extension}
 */
export function livePreview({ onLink, tickToBottom }) {
  const field = StateField.define({
    create: build,
    update(deco, tr) {
      return tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? build(tr.state) : deco;
    },
    provide: f => EditorView.decorations.from(f),
  });
  const clicks = EditorView.domEventHandlers({
    mousedown(e, view) {
      const el = /** @type {HTMLElement} */ (e.target);
      if (e.button !== 0 || e.shiftKey || e.altKey) return false;
      if (el instanceof HTMLInputElement && el.classList.contains('cm-task')) {
        e.preventDefault();
        if (view.state.readOnly) return true;
        const at = view.posAtDOM(el);
        const now = view.state.sliceDoc(at, at + 3);
        if (/^\[[ xX]\]$/.test(now)) {
          const tick = { from: at + 1, to: at + 2, insert: now[1] === ' ' ? 'x' : ' ' };
          view.dispatch({ changes: tick.insert === 'x' && tickToBottom ? ticked(view.state, at, tick) : tick, userEvent: 'input.check' });
        }
        return true;
      }
      const link = /** @type {HTMLElement | null} */ (el.closest('.cm-wikilink[data-note]'));
      // a link drawn as a link (its marks hidden) opens; on a raw line, the click places the cursor as usual
      if (!link || !link.closest('.cm-line') || isRaw(view, view.posAtDOM(link))) return false;
      e.preventDefault();
      onLink(link.dataset.note || '');
      return true;
    },
  });
  return [field, clicks];
}

// ticking a box with "ticked to the bottom" on: the line moves below the open and ticked to-dos next to it (same
// indent, no gap), so the open ones stay together at the top. -> the changes
/** @param {import('@codemirror/state').EditorState} state @param {number} at @param {{ from: number, to: number, insert: string }} tick */
function ticked(state, at, tick) {
  const doc = state.doc, line = doc.lineAt(at);
  const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
  const sibling = (/** @type {string} */ t) => /^\s*[-*+] \[[ xX]\] /.test(t) && (/^\s*/.exec(t)?.[0].length ?? 0) === indent;
  const nested = (/** @type {string} */ t) => t.trim() !== '' && (/^\s*/.exec(t)?.[0].length ?? 0) > indent;
  // the item takes its nested lines with it; the block ends at the last sibling (and its nested lines)
  let last = line.number;
  while (last < doc.lines && nested(doc.line(last + 1).text)) last++;
  let end = last;
  for (let n = last + 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (sibling(t)) end = n; else if (!nested(t)) break;
  }
  if (end === last) return tick;
  const item = doc.sliceString(line.from, doc.line(last).to).replace(/^(\s*[-*+] \[)[ xX]/, '$1x');
  return [{ from: line.from, to: doc.line(last).to + 1, insert: '' }, { from: doc.line(end).to, insert: '\n' + item }];
}

// is the line at pos shown raw (a cursor or selection on it)?
/** @param {EditorView} view @param {number} pos */
const isRaw = (view, pos) => {
  const line = view.state.doc.lineAt(pos).number;
  return view.state.selection.ranges.some(r => view.state.doc.lineAt(r.from).number <= line && line <= view.state.doc.lineAt(r.to).number);
};
