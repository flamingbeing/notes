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
- app-ui 1.0.0-rc.30 (28 Oct): swiping between Notes, Folders and Settings moves like iOS paging (spring glide at the
  finger's speed, rubber band at the ends, bar title cross-fades); Today, Select and New are `data-swipe-fade`.
- app-ui 1.0.0-rc.11 (28 Oct): on a phone Folders and Settings are swipeable tab pages (the Folders sheet is gone); the version
  and Check for updates are in Settings > About (no version header); look D (Slim) is the default look.
- Reorganised for daily use (decision 0014): slim top bar + list, folders and tags in a drawer, a note is a
  full-screen page with an address and Back, Details panel, + opens a draft in the folder for new notes; code grouped
  by feature under `app/src/`.

- Backup and spreadsheets (decision 0017): More → Import or export → Backup: `.json.gz`, CSV, Excel; restore only adds.
- Google Drive copy (decision 0017): Settings → Google Drive; tested against a fake Drive, live check pending.
- Data modules (decision 0018): Bin screen, bulk edit, share-in, feedback inbox, sync forget, paste cleaner recipe; each off until a device turns it on in Settings.
- MCP connector (`mcp/`, decisions 0016, 0019): 8 tools, `.mcpb` build and workflow, offline tests. Sign-in by code:
  Settings → Advanced → Connect MCP (off by default); Disconnect ends all the account's sign-ins. Live check pending.
- On the app-ui kit (N1): the kit's adaptive shell and parts (docs/ui-kit.md in app-ui): a phone gets the bar, tab bar
  and Folders sheet; from 600 px a side bar, the list and the open note beside it (the note page is not modal there).
  Looks and density in Settings (default look A); Settings is a sheet, a side panel from 840 px, so the theme switch
  and Sign out are reached after sign-in. Notes data and sync unchanged.

## Waiting on the owner

- Live check of Connect MCP: Settings → Connect MCP, paste the code into Claude Desktop.
- The live smoke test after deploy needs the owner's sign-in click.
- Settings on each device: "Folder for new notes" = `Inbox`, "Folder for today's notes" = `Daily`.

## Next

- Live smoke test of S4; then restore from the bin.

## Decisions (dated)

- 2026-10-28: tab swipe follows app-ui's iOS-style paging (rc.30); Notes adds no motion of its own.
- 2026-10-27: MCP sign-in by code from Settings (0019); the Google client is optional.
- 2026-10-27: the MCP connector signs in as the user and gets roles from `/api/claims` (0016).
- 2026-10-27: a note is a full-screen page at `#/note/<id>`; folders and tags in a drawer; + is a draft (0014).
- 2026-10-26: shared space docs are written only by the Worker; invites by Google email (decision 0010).
- 2026-10-26: the editor is vendored CodeMirror 6, marked and DOMPurify, loaded on first note open (0011).
- 2026-10-26: attachments are file records named by `![[name]]`; import never overwrites; moves keep files (0012).
- 2026-10-26: a same-line clash keeps the other device's text and saves this device's as a conflict copy note.
