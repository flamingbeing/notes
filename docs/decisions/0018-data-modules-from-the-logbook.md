# 0018: Bin screen, bulk edit, share-in, paste cleaner, feedback and sync forget are modules, each off until a device turns it on

Status: accepted (2026-10-27)

Decision:

- **Six modules, ported from the owner's logbook app** (read only) and recorded as `recipes/<module>.json`: `bin`,
  `bulk-edit`, `share-in`, `paste-clean` (already built into the editor; now a recipe), `feedback`, `sync-forget`. They
  live here until a second kind of app wants one (then app-starter or core takes the recipe); the bin and bulk edit are
  the likely next.
- **Every new option is off and per device** (`binScreen`, `bulkEdit`, `shareIn`, `feedbackOn`): no button, no
  listener, no cost until the Settings switch is on.
- **Bin:** the delete already writes the note's last version to `spaces/<space>/bin` (`cloud.js onCommit`). The screen
  reads those entries, restores a note under its own id (a normal save, newer than the delete, so other devices keep it),
  then deletes the entry; entries past 30 days are purged when the list first draws and when the bin opens. The rules
  gained `allow delete: if mayWrite(s)` on bin entries (the Worker is not needed: only the person's own space).
- **Bulk edit:** select mode in the list, one popup: add a tag (a `#tag` line at the end of the body, because tags come
  from the body), move to a folder, merge into one note (originals go to the bin), delete.
- **Share-in:** the manifest's `share_target` POSTs to `./share-in`; `sw.js` keeps the parts in a cache and redirects to
  `./?share=1`; the page offers "new note" or "add to a note" and attaches shared files. Installed Android app only.
- **Feedback:** plain documents in `feedback/{id}` (not synced): any member creates one (own uid, 1-2000 characters,
  not done); only admins read, mark done or delete. "Copy as task" puts a to-do line on the clipboard.
- **Sync forget:** `forgetDrive()` wipes the Drive ledger database and last-sync times in the forget-lists step
  (account switch, Forget this device).
