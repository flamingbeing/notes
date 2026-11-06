# Status

## Now

- Vault layout, slice 1 of 5 (6 Nov): a second layout, the default on every device, where the
  note page is home: header (sidebar button, title, Reading view and More), a navigation pill (Back, Forward, quick
  switcher, new tab, tabs, menu), the "No file is open" page, bottom sheets, and a Settings dialog with Layout and Core
  plugins. The Classic layout (Settings > This device > Layout) is unchanged; each Classic feature is a "Notes extra"
  on the Core plugins page, off in Vault until turned on. Settings, picker, spaces and Haiku now load lazily (startup
  319 KiB / 55 requests, was 327 / 59). Still to come: left sidebar (slice 2), note page (3), right sidebar and
  navigation sheets (4), full Settings (5). No reference frame for the ribbon or tabs sheets yet: check against an
  owner recording.
- Vault layout, slice 2 of 5 (6 Nov): the left sidebar, a drawer that pushes the page (sidebar button, an edge swipe, or
  mid-screen with the Swipe back extra on). A view picker (Files, Search, Tags, Bookmarks, and Notes with the note list
  extra on; the choice kept on the device); the space name and counts open the spaces switcher; the gear opens Settings.
  Files: a folder tree with new note, new folder, sort, collapse all and show the open note; a long-press or right-click
  menu (open in new tab, rename, move, bookmark, copy path, delete with Undo). Search: the app's search with each
  note's matching lines, Match case, sort, collapse and more-context options, recent searches. Tags: nested or flat,
  by name or count, a filter; a tap searches the tag. Each view follows its Core plugin switch. Gaps: bookmarks are kept
  per device (syncing them needs a rules change, owner's call); folders start open (the reference starts them shut);
  no bookmark groups yet; long-press menus inside the drawer are this app's own (app-ui's hold menus do not work
  inside a dialog: worth an option there).
- Vault layout, slice 3 of 5 (6 Nov): the note page. Source mode by default (Markdown shown: faint list marks, `#`
  and brackets, link words in the link colour, headings 1.6/1.4/1.2em); the view button and Ctrl+E go to the read view
  (underlined links, faint dot bullets, purple task boxes, a light rule). A mobile toolbar sits on the keyboard while
  editing (undo, redo, link, tag, attach, heading, bold, italic, strike, highlight, bullet, to-do, indent, outdent,
  hide keyboard; line spacing with that extra), following the toolbar setting. Under the note, Linked mentions: groups
  per linking note with each line as a card (tap opens it at that line), fold, more context, sort, a filter, and
  Unlinked mentions on demand. The note menu (Backlinks in document, Reading view, Source mode, Rename, Move with New
  folder, Bookmark, Find, Copy path, Share, Details, Delete with Undo; viewers get the views, Copy path, Share). A tap
  on the header title renames in place. Fixed: the drawer's Undo after Delete never found the bin entry. Classic note
  screenshots are pixel-identical to before. Gaps: Live Preview in Vault is still the Classic live preview; Find is a
  small bar of its own (the vendored CodeMirror has no search panel); no reference frame of the toolbar itself.
- Vault layout, slice 4 of 5 (6 Nov): the right sidebar (a swipe left on the note, or the palette): Backlinks (the
  Linked mentions with their tools), Outgoing links ("Links N", a faint link makes its note), Outline (the headings as
  a tree; a tap scrolls the editor or read view there) and Calendar (a month, a dot on days with a daily note; a tap
  opens or makes that day's note), each following its Core plugin; a footer with the note's name, its words and
  characters (Word count) and the sync state (a tap syncs now). The quick switcher (the pill's search, Go to file,
  Ctrl+O; the box at the bottom, matched letters bold, Enter on a new name makes the note) and the command palette
  (Ctrl+P, the ribbon, a pull down on the note; recent commands first) share one sheet. The ribbon menu (switcher,
  today's note, palette, new note, random note, Search, Bookmarks, the extras that are on, Settings) and the tabs
  sheet ("N tabs", each tab's folder, close one or all) are their own sheets; palette commands for previous and next
  daily notes. Classic screenshots are pixel-identical to before. Gaps: no Unlinked mentions under Outgoing links and
  no Outline tools (search, collapse) yet; no reference frame for the ribbon menu, the command palette, the tab
  switcher or the pull-down: check against an owner recording.
- Haiku tab (29 Oct, decision 0021): owner and admins pick a prompt (notes in `Prompts/`), paste, Run, and Claude
  Haiku's reply replaces the text; Undo, Copy. The text is never stored. Live once the `ANTHROPIC_API_KEY` Worker secret is set.
- S1 data core: notes in a per-person vault, links, tags, backlinks, rename, daily note, line merge with conflict
  copies, search, rules for vaults and shared spaces.
- S2 editor: CodeMirror live preview, `[[` autocomplete, paste as Markdown, read view, quick switcher and palette,
  editor settings, autosave; loaded only when a note opens (decision 0011).
- S3 shared spaces: switcher, members sheet, invites (pending until first sign-in), roles, move, delete; only the
  Worker writes space docs (decision 0010).
- S4 attachments (button, paste, drop, read view), a note moves with its files, vault import (folder, zip, dry run,
  never overwrites) and zip export (decision 0012). Live smoke test on notes.flamingbeing.com: note + picture,
  export, import back, clean up, as the test user (app-devkit 1.10.3 sends the Referer the web key needs).
- Select mode (29 Oct): Back (Android's button or gesture) ends select mode instead of leaving the app (one history
  step, taken back by Done too); a bin button in the select bar sends the picked notes to the bin after one confirm.
- Notes polish S1 (29 Oct, app-ui 1.0.0-rc.36): swipe feel changed. A swipe on the empty space under a short page now
  changes tab; a swipe right on a note (not from the screen's edge, mostly sideways, no text selected) takes it back to
  the list, following the finger, saved; a finger's hold on a note starts select mode (right-click still gives the
  menu, which had never started before); the tinted bar no longer flashes on a tab change. A tap on a note's blank
  space types at the end; line spacing Tight/Normal/Roomy on the formatting bar; search results show the matched
  passage, marked.
- app-ui 1.0.0-rc.34 (29 Oct): swipe feel changed. The pages follow the finger 1:1 (also with Android's Remove
  animations, which made rc.30 switch with no slide), quick flicks all count, a finger catches a glide; a right swipe on
  Notes pulls the side bar out as a drawer with the finger (swipe left or tap the shade to close; it used to jump to
  Folders). The screen edges stay Android's Back.
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

- 2026-10-29: Haiku tab: the pasted text is never stored; prompts are notes in `Prompts/` (0021).
- 2026-10-28: tab swipe follows app-ui's iOS-style paging (rc.30); Notes adds no motion of its own.
- 2026-10-29: a right swipe on the first tab opens the side bar as a drawer (the kit's `drawer` option), not Folders.
- 2026-10-27: MCP sign-in by code from Settings (0019); the Google client is optional.
- 2026-10-27: the MCP connector signs in as the user and gets roles from `/api/claims` (0016).
- 2026-10-27: a note is a full-screen page at `#/note/<id>`; folders and tags in a drawer; + is a draft (0014).
- 2026-10-26: shared space docs are written only by the Worker; invites by Google email (decision 0010).
- 2026-10-26: the editor is vendored CodeMirror 6, marked and DOMPurify, loaded on first note open (0011).
- 2026-10-26: attachments are file records named by `![[name]]`; import never overwrites; moves keep files (0012).
- 2026-10-26: a same-line clash keeps the other device's text and saves this device's as a conflict copy note.
