# 0020: Ionic trial at /ionic/

Status: trial, 2026-10-29 (nothing replaced; the main page is unchanged)

## Decision

A second page at `/ionic/` (`app/ionic/`) shows the same notes with the same sign-in, sync and data layer
(`app/src/cloud.js`, `@core/sync`), with its screens and shell built on Ionic's web components: `@ionic/core` 9.0.9
from jsDelivr at an exact version, Material ("md") mode, no framework and no build step. It covers the list (search,
pull to refresh, swipe to delete, folder and tag menu, show more), the note (editor, read view, details sheet with
folder, links and delete), settings in a sheet, dark mode and spaces. Everything else stays on the main page, linked
from the menu as "Classic version".

The point is a side-by-side on a real Android phone, not a switch. Screenshots at 390 px: `docs/ionic-trial/`.

## Why

- The main page's kit has rough edges on Android; a mature component set gives a baseline to compare against.
- Same data layer, so the comparison is only about the screens.

## Consequences

- Its own security policy (`worker/headers.js`, `ionic: true`, for `app/ionic/` only): Ionic's components inject
  inline styles, so style-src needs `'unsafe-inline'`, plus the CDN in script, style and connect. The main page's
  policy is unchanged.
- Page weight after opening a note (local and CDN, gzip): about 754 KB over 137 requests, against 779 KB over 184 for
  the main page. The UI layer is heavier (Ionic about 150 KB gzip lazy-loaded in ~56 files, against about 125 KB for
  the kit), offset by fewer of the main page's own files.
- The CDN files are not in the service worker's cache, so the page needs a network for its first load of each component.
- Overlay events: `didDismiss` listeners did not fire for created modals; `onDidDismiss()`/`onWillDismiss()` promises do.
  Listeners go on before `present()` resolves.
- WebKit on phones clones the focused input (scroll assist): test selectors use `input:not(.cloned-input)`.
- Some helpers are duplicated from `app/src/list.js`, which imports the main page's kit.
- Smoke test: `e2e/ionic.smoke.mjs`, Chromium and WebKit at 390 and 1280 px (`playwright.ionic.config.mjs`, CI job `ionic`).
- Removing the trial: delete `app/ionic/`, the `ionic` option in `worker/headers.js` and `worker/sites.js`, the smoke
  test, its config and CI job, then regenerate `app/public/sw.js`.
