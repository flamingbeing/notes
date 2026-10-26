# Status

## Now

- S1 data core: notes in a per-person vault, links, tags, backlinks, rename, daily note, line merge with conflict
  copies, search, rules for vaults and shared spaces.
- S2 editor: CodeMirror live preview, `[[` autocomplete, paste as Markdown, read view, quick switcher and palette,
  editor settings, autosave; loaded only when a note opens (decision 0011).
- S3 shared spaces: switcher, members sheet, invites (pending until first sign-in), roles, move, delete; only the
  Worker writes space docs (decision 0010).

## Waiting on the owner

- Nothing.

## Next

- S4 attachments, import and export.

## Decisions (dated)

- 2026-10-26: shared space docs are written only by the Worker; invites by Google email (decision 0010).
- 2026-10-26: the editor is vendored CodeMirror 6, marked and DOMPurify, loaded on first note open (0011).
- 2026-10-26: attachments wait for S4; the files module stays but has no screen.
- 2026-10-26: a same-line clash keeps the other device's text and saves this device's as a conflict copy note.
