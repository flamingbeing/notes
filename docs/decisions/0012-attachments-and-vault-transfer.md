# 0012: Attachments are `@core/files` records named by the note's text; vaults import and export as folders and zips

Status: accepted (2026-10-26)

Decision:

- **Attachments:** a picture or file added to a note (button, paste or drop) becomes a record in the space's `files`
  collection (`item` = the note, `path` = the vault folder it came from), bytes in R2 through the Worker (decision
  0009). The note's text names it the way Obsidian does, `![[name]]` or `![alt](folder/name)`; the read view resolves
  the name (full path, else a path ending in it, else the file name; shortest first) and shows pictures, with other
  files as links. The record's `name` is the original file name (a picture is re-encoded to WebP or JPEG with its EXIF
  dropped, so `type` is the real stored type).
- **Moving a note moves its attachments:** the Worker copies the bytes, then commits note, file records and bin
  entries in one write. The source note is deleted with an `updateTime` precondition, so a save that lands during the
  move makes it fail with 409 (nothing moved, copies removed) instead of being lost. A note with files still
  uploading, or more than 40, does not move.
- **Import:** a folder or zip of an Obsidian vault. `.md` files become notes (folder = `path`, file name = title),
  everything else an attachment at its folder. A dry-run line comes first (notes, files, skipped and why). **Import
  never overwrites:** a note or file whose folder and name already exist is skipped and listed; paths that climb out
  of the vault, app folders (`.obsidian`, `.git`, `.trash`) and hidden files are skipped; one shared top folder is
  dropped. Planning is pure (`app/src/notes/vault.js`).
- **Export:** the open space as a zip: notes as `Title.md` in their folders, attachments at their paths; two things at
  one path get " (2)".
- **fflate** (0.8.2, MIT) is vendored like the editor libraries and loaded only when a zip is read or written.

Why: Obsidian's own conventions keep the notes usable as plain files both ways; a file record per attachment reuses
the files module's offline queue and thumbnails; the precondition closes the S3 gap where a racing save could be lost.

Cost: `path` is a new allowed field on file records (rules and Worker); export fetches each file's bytes; an orphaned
attachment (its note deleted) stays until removed from the sheet or the space is deleted.
