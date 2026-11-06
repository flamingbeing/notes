# 0022: Vault layout: a second layout, the default, with Classic kept as it was

Status: accepted, 2026-11-06

## Decision

Notes has two layouts, chosen per device (Settings > Appearance > Layout in Vault; Settings > This device > Layout in
Classic). Changing it reloads the app.

- **Vault layout** (the default on every device): the note page is home. A header (sidebar button, the note's title,
  Reading view, More), a navigation pill at the bottom (Back, Forward, quick switcher, new tab, tabs, ribbon menu),
  a left sidebar drawer (Files, Search, Tags, Bookmarks), a right sidebar (Backlinks, Outgoing links, Outline,
  Calendar), bottom sheets for menus, and full-height Settings. Code: `app/src/vault-ui/`, styles:
  `app/public/vault.css` (scoped to `html[data-layout=vault]`), loaded after the list is up.
- **Classic layout**: the tab bar, list and note screens as before this decision. Its screenshots match the commit
  before the Vault layout (9b1db67) pixel for pixel, except the Layout row added to This device.
- **Nothing is deleted.** Each Classic feature the Vault layout leaves out is a "Notes extra" (`x*` options: tab bar,
  note list, swipe between tabs, swipe back, select mode, details, line spacing, day buttons, sync button, Haiku,
  More, Advanced), off in Vault until turned on, always on in Classic. The Vault layout's own parts are "Core plugins"
  (`p*` options: Backlinks, Bookmarks, Command palette, Daily notes, Files, Outgoing links, Outline, Quick switcher,
  Random note, Search, Tags view, Word count), on by default. All are device options.
- **Settings in Vault** are drawn from one pure map, `vault-ui/settings-map.js`: the pages, their rows and the option
  each row changes. Every option except `driveOn` (set by the Google Drive copy sheet) has a page; a unit test
  (`app/test/vault-settings-map.unit.test.mjs`) fails otherwise. Each control keeps the Classic id `#opt-<key>`, so
  only one of the two Settings screens is made on a device.
- UI only: the data model, sync, Firestore paths and rules are unchanged; every save goes through the write queue.
- Motion only by transform and opacity, on app-ui's `drag` and `glide`; with reduced motion, things move at once.
- Own name and icons (Lucide), made-up sample notes; no other app's name, logo, icons or styles.

## Why

- The owner wanted the look and flow of a desktop-class notes app on his phone, without losing anything the app
  already does: a toggle per feature keeps every feature one switch away, and the Classic layout stays for anyone who
  prefers it.
- A per-device choice means a phone can try Vault while a laptop stays on Classic.
- One map for Settings keeps every option reachable and makes "an option with no row" a failing test, not a support
  question.

## Consequences

- Two layouts to keep working: Classic browser tests run in Classic (the e2e `phone` fixture sets `layout` to
  `classic` unless a test passes `{ layout: 'vault' }`); the Vault specs are `e2e/vault-*.spec.mjs`.
- A new option needs a row in `settings-map.js` (the unit test says so) and, for Classic, a row in its settings sheet.
- The startup budget holds (330 KiB, 60 requests): Settings, the picker, spaces and Haiku load lazily, and each Vault
  part loads when first opened; every lazy file is in `sw.js`'s SHELL, so the app works offline.
- Bookmarks are kept per device: syncing them needs a rules change (an owner decision).
