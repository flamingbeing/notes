// What the editor uses from CodeMirror 6, bundled into one file by tools/vendor-editor.mjs
// (app/public/vendor/codemirror/<version>/codemirror.js; the page imports it as "@vendor/codemirror"). One bundle, so
// every part shares one copy of @codemirror/state. Only the names below ship: markdown() is left out on purpose, since
// it pulls in the HTML, CSS and JavaScript languages (about 100 KB more); the editor builds its language from
// markdownLanguage instead. Add a name here, then run the tool again.
export { EditorState, EditorSelection, StateField, StateEffect, Compartment, Prec, RangeSetBuilder } from '@codemirror/state';
export { EditorView, Decoration, WidgetType, keymap, placeholder, lineNumbers, drawSelection } from '@codemirror/view';
export { Language, LanguageSupport, syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
export { history, defaultKeymap, historyKeymap, undo } from '@codemirror/commands';
export { markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
export { autocompletion, completionKeymap, startCompletion } from '@codemirror/autocomplete';
export { tags } from '@lezer/highlight';
