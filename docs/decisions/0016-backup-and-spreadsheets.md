# 0016: Backup is a module that only adds; spreadsheets carry a Data column; Excel is SheetJS, loaded on demand

Status: accepted (2026-10-27)

Decision:

- **`@core/backup`** (`app/public/backup/`, local like `@core/files` and `@core/search` until a second kind of app wants
  it) turns the open space's notes, its file list and the account's settings into one object, and reads it back. The
  sheet is `app/src/transfer/backup-sheet.js`; the module is pure.
- **Formats:** `.json.gz` (the browser's own gzip, no library), CSV, and Excel. The two spreadsheets share rows:
  readable columns (folder, title, text, tags, updated) and a Data column with each record in full, which a restore
  reads, so the round trip loses nothing. Files are listed (name, folder), never included: their bytes stay in R2.
- **Restore only adds.** It waits for the server's copy first (`sync.facts().confirmed`), plans again from what is
  there then, and writes only notes whose id is not here. Nothing is overwritten or deleted. Settings come back only
  where the person has not changed the option (still at its default). A dry-run line comes first.
- **Excel is SheetJS 0.20.3** (Apache-2.0, from cdn.sheetjs.com: the npm `xlsx` is stuck at 0.18.5), vendored as
  `vendor/xlsx/0.20.3/xlsx.mjs` with its LICENSE and a small `xlsx.d.ts` for the calls we make, and loaded by
  `import('xlsx')` only when an Excel file is made or read. A cell holds 32767 characters, so a long Data cell continues in
  "Data 2", "Data 3" and the readable Text column is cut.
- **`recipes/backup.json`** is the recipe `tools/add.mjs` (app-starter) applies to add the module to another app.

Why: the logbook app has run this design for months (one file, add-only restore); ExcelJS is a global script the CSP
would not allow, SheetJS's ESM build is one file behind the import map.

Cost: the import map changed (new hash in `worker/headers.js`), and the service worker list grew by about 1 MB
(`xlsx.mjs`) that is cached on first load.
