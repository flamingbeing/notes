# 0014: A note opens as a full-screen page with its own address; folders and tags live in a drawer

Status: accepted (2026-10-27)

Decision:

- The list screen is a slim top bar (space, Today, +, search) and the list. Folders and tags move to a drawer (☰),
  where picking one shows only those notes; a chip says what is shown and clears it.
- A note opens as a full-screen page: the existing `#edit` dialog styled full screen, so the focus trap and Escape stay.
  Each open pushes a history entry `#/note/<id>` with `n` = steps from the list; the phone's Back closes it (or goes to
  the note before), Close goes back `n` steps, and a reload or shared address opens the note once the list has it.
- Folder, links, backlinks, files and Move sit in a collapsible "Details" panel; Delete, Attach and Save stay in view.
- + opens an empty draft in the device's "folder for new notes" (`newFolder`, like `dailyFolder`). The first save makes
  the note; no title gives "Untitled", "Untitled 2" …; nothing typed leaves nothing.
- Code in `app/src/` is grouped by feature: `shell/`, `screens/`, `editor/`, `settings/`, `spaces/`, `transfer/`. The
  entry files (`app.js`, `boot.js`, `cloud.js`, `config.js`) stay at the root so `index.html` does not change.

Why: the owner uses the app daily on a phone; the old list had the add form, filter and space controls stacked above
the notes, and a note in a sheet had no address and no Back. A draft rather than an "Untitled" note made up front
keeps empty notes and "Untitled" aliases (a rename keeps the old title) out of the vault.

Cost: history handling in `note-page.js` (an unwind flag so Close's `history.go(-n)` and a note opened meanwhile do not
race); `newFolder` is per device, so each device sets it once.
