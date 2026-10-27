# Status

## Now

- S1 data core: notes in a per-person vault, links, tags, backlinks, rename, daily note, line merge with conflict
  copies, search, rules for vaults and shared spaces.
- S2 editor: CodeMirror live preview, `[[` autocomplete, paste as Markdown, read view, quick switcher and palette,
  editor settings, autosave; loaded only when a note opens (decision 0011).
- S3 shared spaces: switcher, members sheet, invites (pending until first sign-in), roles, move, delete; only the
  Worker writes space docs (decision 0010).
- S4 attachments (button, paste, drop, read view), a note moves with its files, vault import (folder, zip, dry run,
  never overwrites) and zip export (decision 0012). Live smoke test on notes.flamingbeing.com: note + picture,
  export, import back, clean up, as the test user (app-devkit 1.10.3 sends the Referer the web key needs).
- Reorganised for daily use (decision 0014): slim top bar + list, folders and tags in a drawer, a note is a
  full-screen page with an address and Back, Details panel, + opens a draft in the folder for new notes; code grouped
  by feature under `app/src/`.

- Backup and spreadsheets (decision 0016): More → Import or export → Backup: `.json.gz`, CSV, Excel; restore only adds.

## Waiting on the owner

- The live smoke test after deploy needs the owner's sign-in click.
- Settings on each device: "Folder for new notes" = `Inbox`, "Folder for today's notes" = `Daily`.

## Next

- Live smoke test of S4; then restore from the bin.

## Decisions (dated)

- 2026-10-27: a note is a full-screen page at `#/note/<id>`; folders and tags in a drawer; + is a draft (0014).
- 2026-10-26: shared space docs are written only by the Worker; invites by Google email (decision 0010).
- 2026-10-26: the editor is vendored CodeMirror 6, marked and DOMPurify, loaded on first note open (0011).
- 2026-10-26: attachments are file records named by `![[name]]`; import never overwrites; moves keep files (0012).
- 2026-10-26: a same-line clash keeps the other device's text and saves this device's as a conflict copy note.
