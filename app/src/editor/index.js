// The note editor: CodeMirror 6 (vendored, "@vendor/codemirror"; loaded only when a note opens, by note-sheet.js) over
// the note's Markdown, with live preview (live-preview.js; off in source mode), [[ autocomplete from the vault's titles,
// HTML pasted in turned into Markdown (paste-clean.js), and optional line numbers. The sheet keeps its textarea as the
// note's text: the editor fills it on each change (onChange), and set() puts text in from outside.
import {
  EditorState, EditorView, Compartment, keymap, placeholder, lineNumbers, drawSelection, Language, syntaxHighlighting,
  HighlightStyle, history, defaultKeymap, historyKeymap, markdownLanguage, markdownKeymap, autocompletion, completionKeymap, tags,
} from '@vendor/codemirror';
import { notesSyntax } from './syntax.js';
import { livePreview } from './live-preview.js';
import { htmlToMarkdown } from '../notes/paste-clean.js';

/** @typedef {{ source: boolean, lineNumbers: boolean }} EditorOptions */

// Markdown with the notes' [[links]] and #tags (same language data, so Markdown's own commands still apply)
const parser = /** @type {import('@lezer/markdown').MarkdownParser} */ (markdownLanguage.parser).configure([notesSyntax]);
const language = new Language(markdownLanguage.data, parser, [], 'markdown');
// the colours come from the theme (app.css: .cm-* classes), so only the classes are set here
const highlight = HighlightStyle.define([
  { tag: tags.heading, class: 'cm-hd' },
  { tag: tags.emphasis, class: 'cm-em' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.strikethrough, class: 'cm-strike' },
  { tag: tags.monospace, class: 'cm-code' },
  { tag: [tags.link, tags.url], class: 'cm-link' },
  { tag: tags.labelName, class: 'cm-tag' },
  { tag: [tags.processingInstruction, tags.meta, tags.quote], class: 'cm-meta' },
]);

// HTML from the clipboard becomes Markdown, unless it is only code shown as is (an editor's copy: plain text is right)
/** @param {string} html */
const isCodeCopy = html => /white-space:\s*pre/i.test(html) && !/<(h[1-6]|li|table|a)\b/i.test(html);

/**
 * @param {{
 *   parent: HTMLElement, text: string, label: string, readOnly: boolean, options: EditorOptions,
 *   titles: () => { title: string, path?: string }[],
 *   onChange: (text: string) => void, onBlur: () => void, onLink: (target: string) => void,
 * }} o
 */
export function createEditor(o) {
  const preview = new Compartment(), numbers = new Compartment(), editable = new Compartment();
  /** @param {EditorOptions} opt */
  const previewOf = opt => (opt.source ? [] : livePreview({ onLink: o.onLink }));
  /** @param {EditorOptions} opt */
  const numbersOf = opt => (opt.lineNumbers ? lineNumbers() : []);
  /** @param {boolean} ro */
  const editableOf = ro => [EditorState.readOnly.of(ro), EditorView.editable.of(!ro)];

  // [[ offers the vault's notes by title; picking one closes the link
  /** @param {import('@codemirror/autocomplete').CompletionContext} cx */
  const linkCompletions = cx => {
    const m = cx.matchBefore(/\[\[[^\][|#\n]*$/);
    if (!m) return null;
    const closed = cx.state.sliceDoc(cx.pos, cx.pos + 2) === ']]';
    return {
      from: m.from + 2,
      options: o.titles().map(n => ({ label: n.title, detail: n.path ? `${n.path}/` : undefined, apply: closed ? n.title : `${n.title}]]` })),
      validFor: /^[^\][|#\n]*$/,
    };
  };

  /** @type {string} what the editor holds, as last told (a change from set() isn't sent back) */
  let quiet = '';
  const view = new EditorView({
    parent: o.parent,
    state: EditorState.create({
      doc: o.text,
      extensions: [
        history(), drawSelection(), EditorView.lineWrapping,
        keymap.of([...markdownKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
        language, syntaxHighlighting(highlight),
        autocompletion({ override: [linkCompletions], icons: false }),
        placeholder('Write here. [[ links to a note, # adds a tag.'),
        preview.of(previewOf(o.options)), numbers.of(numbersOf(o.options)), editable.of(editableOf(o.readOnly)),
        EditorView.contentAttributes.of({ 'aria-label': o.label, 'aria-multiline': 'true', spellcheck: 'true', autocapitalize: 'sentences' }),
        EditorView.domEventHandlers({
          paste(e, v) {
            const html = e.clipboardData?.getData('text/html');
            if (!html || isCodeCopy(html) || v.state.readOnly) return false;
            const md = htmlToMarkdown(html);
            if (!md) return false;
            e.preventDefault();
            v.dispatch(v.state.replaceSelection(md), { userEvent: 'input.paste', scrollIntoView: true });
            return true;
          },
          blur() { o.onBlur(); return false; },
        }),
        EditorView.updateListener.of(u => {
          if (!u.docChanged) return;
          const text = u.state.doc.toString();
          if (text !== quiet) o.onChange(text);
          quiet = '';
        }),
      ],
    }),
  });
  return {
    view,
    value: () => view.state.doc.toString(),
    /** the text put in from outside (the sheet's textarea, a note opened): no onChange; the history starts again @param {string} text */
    set(text) {
      if (text === view.state.doc.toString()) return;
      quiet = text;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: Math.min(view.state.selection.main.head, text.length) } });
    },
    /** @param {boolean} ro */
    setReadOnly: ro => view.dispatch({ effects: editable.reconfigure(editableOf(ro)) }),
    /** @param {EditorOptions} opt */
    setOptions: opt => view.dispatch({ effects: [preview.reconfigure(previewOf(opt)), numbers.reconfigure(numbersOf(opt))] }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
/** @typedef {ReturnType<typeof createEditor>} Editor */
