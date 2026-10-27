# 0011: The editor is vendored CodeMirror 6, marked and DOMPurify, loaded only when a note opens

Status: accepted (2026-10-26)

Decision: the note editor is CodeMirror 6 with a live preview (Markdown marks hidden off the cursor's line), the read
view is marked plus DOMPurify. All three are vendored into `app/public/vendor/` by `tools/vendor-editor.mjs` from the
exact versions `package.json` pins, and the page reaches them through its import map (`@vendor/codemirror`, `marked`,
`dompurify`), the same pattern as vendored Firebase (decision 0007).

- **Loaded on open:** `note-sheet.js` (now `screens/note-page.js`) imports `app/src/editor/` the first time a note opens; the list screen loads
  none of it (the Vite check asserts the entry's static graph has no editor libraries and a lazy chunk does).
- **The textarea stays the source of truth:** CodeMirror mirrors into `#edit-body`, and the plain textarea shows if
  the editor fails to load, so a note can always be edited and saved.
- **No inline styles:** the vendor tool patches CodeMirror's style-mod to use a constructed sheet
  (`adoptedStyleSheets`), and the read view drops `style=` from rendered HTML, so the page's CSP needs no
  `unsafe-inline` (decision 0003). The tool fails if style-mod's source changes, so a bump cannot silently undo this.
- **Saves:** 3 s after typing stops, on blur and on `pagehide`, as the logbook app does; the sheet's Cancel became
  Close and saves.
- **Licences:** CodeMirror and marked MIT; DOMPurify taken under Apache-2.0 (it is MPL-2.0 OR Apache-2.0). Each
  vendored folder carries its licence file.

Why: CodeMirror 6 is the one browser editor with both a real Markdown parse tree (needed for live preview, wikilinks
and tags) and good phone input; vendoring keeps the app free of a CDN and a bundler at runtime, and lazy loading keeps
the list screen as light as it was (the editor is about 150 KiB gzipped).

Cost: three more vendored libraries to bump by hand (`npm i -D -E`, the tool, `node tools/sw-files.mjs app`); CI runs
`node tools/vendor-editor.mjs --check`.
