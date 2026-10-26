# Notes

Lasting decisions and how to test. Shaping decisions have their own records in [docs/decisions/](docs/decisions/).

## How to test

`bash tools/dev-setup.sh` once, then README, "Tests". Each browser test signs in its own made-up accounts, so each
person has their own vault (`spaces/<uid>/notes`); tests run side by side and check only their own notes.

Test list (what each part is proved by):

- Parser, links, tags, aliases, daily ids, rename plan, backlink index, `merge3`: `app/test/*.unit.test.mjs`.
- Rules, every role × collection, own vault vs another person's, shared-space roles, space docs, settings, bin:
  `app/test/rules.test.mjs` (a non-member is denied there).
- Screens: add, edit text and folder, delete to the bin, filter by tag and folder, today's note, viewer read-only
  (`e2e/list.spec.mjs`); search operators and hints (`e2e/search.spec.mjs`).
- Sync: offline save sent later, two phones, different lines merge, same line gives a conflict copy, rename rewrites
  links and a link to no note makes it (`e2e/sync.spec.mjs`).
- Spaces: the Worker's routes × roles, pending invites, move, delete in rounds (`worker/test/spaces.test.mjs`); in the
  browser with two or three accounts: invite and edit, a viewer only reads, someone not invited sees nothing, removed
  or leaving loses the space and its notes on the device, a pending invite taken up at first sign-in, move, and a
  `[[Space/Note]]` link (`e2e/spaces.spec.mjs`).

## Later

- Attachments in notes (S4); the files module stays in `app/public/files/` but has no screen or e2e until then.
- Restore from the bin (the bin entries keep the deleted version in `data`).
- Multi-group, email-link and passcode sign-in (app-devkit `custom-token.js`).
- Enforce the Content-Security-Policy (decision 0003).

## Notes data (S1)

- A person's vault is the space `spaces/<uid>`; a shared space has an id `s-<8-40 letters/digits>` and a `members`
  map (role per uid) plus `memberIds` for the list query. Rules: `app/firestore.app.rules` (build with
  `node .devkit/tools/build-rules.mjs app/firestore.app.rules`).
- A note: `path` (folder), `title` (1-300), `body` (up to 1 MiB), `links`, `tags`, `aliases`, `daily`, `updatedAt`,
  `serverAt`, `_edits`; nothing else passes the rules. A daily note's id is `day-<yyyy-mm-dd>`.
- `cloud.js` sets `backend.merge.notes` to a line merge (`merge3`, base = the version the device last saw). Edits of
  different lines merge; a clash on the same line keeps the other device's text and saves this device's as a new note
  titled "<title> (conflict, <device>, <d Mon HH:MM>)", with a toast.
- A rename writes the new title, keeps the old one in `aliases` and rewrites `[[old]]` links in the vault.

## Spaces (S3, decision 0010)

- The switcher above the list opens "My notes" or a space (kept per account on this device, `notes:open:<uid>`);
  New space, and the Members sheet (owner: rename, invite by Google email as edit or view, change a role, remove,
  take back an invite, delete the space; others: leave). Only the Worker writes space docs (`/api/spaces`).
- Writing in a space needs an app role that writes (admin, member) and owner or edit in the space.
- A note moves with "Move" in its sheet (to "My notes" or a space the person can edit); links to it from the old
  space don't follow (the sheet warns). `[[Space name/Note]]` links to a note in another space the person is in.
- Account options stay in the vault (`spaces/<uid>/settings/<uid>`) whatever space is open.

## Files formats (`@core/files` v0, decision 0009)

Kept on the device, so a change needs a new version and a test that the old one reads as empty (`files.unit.test.mjs`).

- Upload queue, `ctx.storage()` key `<name>:files/queue`: `{ v: 1, uid, jobs: Job[] }`, Job `{ id, scope, op: 'put' |
  'delete', parts: ['file', 'thumb'?], tries, at, stuck?, rec? }` (`app/public/files/queue.js`). Another `v` reads as
  empty; an empty queue removes the key.
- Device cache, IndexedDB database `<name>-files`, store `blobs`: one Blob per key `<scope>/<id>` and
  `<scope>/<id>.thumb` (`app/public/files/cache.js`). Sign-out keeps both; a switch to another account wipes both.
- Worker: R2 bucket `<name>-files` bound as `FILES`, object key `<scope>/<id>[.thumb]` (`worker/files.js`).

## Settings (`@core/settings`)

`app/src/options.js` lists every option the app allows (scope `device` or `account`; new ones are off); nothing else can
be saved. Where values live (change these only with a migration; `settings.unit.test.mjs` checks the shapes):

- Device values: `ctx.storage('settings')` key `device` = `{ v: 1, values: { <key>: value } }` (stored as
  `settings:settings/device` in localStorage). Kept at sign-out, wiped on an account switch or forget.
- Account values: one sync record per person in the `settings` collection (`spaces/_/settings/<uid>`): one field per
  account option plus `profile`; `null` forgets a value. The local copy is `settings/account` = `{ uid, rec }`, used
  only while `uid` is the signed-in account.
- Rules: only the person writes their own doc (field list in `firestore.app.rules`: add each new account option there
  and in `options.js`); the group can read it, because a list listen cannot be proven to ask for one doc. Keep secrets
  out of options.
- The settings file (`kind: core-settings`, `version`) carries account options only.
- Decision: `@core/theme`'s per-device choice can later move onto settings (device scope, same storage shape); today it
  keeps its own storage, so adopting settings changes no theme file.

## Search (`@core/search`)

`createSearch({ fields, boost, store, operators, newest })` (`app/public/search/`) is an in-memory index over vendored
MiniSearch 7.2.0 (`app/public/vendor/minisearch/7.2.0/`, ESM build, types and LICENSE; its `package.json` only says
`"sideEffects": false` so a page that imports `parseQuery` alone carries none of MiniSearch). It holds no storage and
no module: build it at start, `feed` the list, and keep it current from the list watch (the sample list feeds only records whose
text changed). Nothing is saved, so there is no format to migrate.

- Query syntax (`query.js`, ported from a working parser): words (all must match, prefix + fuzzy 0.2), `field:value`,
  `"phrase"`, `-word` / `-field:value`, `a OR b` / `a | b`. Operators the app names (`is:`, `has:`, `after:`) are
  callbacks on the record and run as filters; a near miss of a field or operator name is searched as text and returned
  in `unknown` for a "did you mean" line. A query with no words (only filters, phrases or leave-outs) lists matches
  newest first (`newest(record)`, default `updatedAt`).
- Later: a `toJSON`/`loadJSON` cache of the index (rebuild at start is cheap below ~10k records).
