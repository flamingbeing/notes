# 0015: The UI kit, theme and settings are app-ui, served at an exact version

Status: accepted (2026-10-27). Replaces the copy of the kit under `app/public/` (ui, theme, settings); the rest of
0008 still holds. Same change as app-starter's decision 0011.

Decision: `@core/ui`, `@core/theme` and `@core/settings` load from [app-ui](https://github.com/flamingbeing/app-ui)
at `https://core.anawj.com/ui/<version>/`, with app-sync moving to `1.4.0-rc.1` in the same change. Notes is the
owner's own trial of the release candidates (app-ui `1.0.0-rc.8` now); final tags follow base 1. The version is named
in `app/index.html` (import map entries, the `<link>`ed sheets, `theme/early.js`), the `app-ui` devDependency tag
(`npm run typecheck`, `tools/sw-files.mjs`) and `worker/headers.js`'s import map hash.

What follows: the kit's own unit tests (theme, settings, ui-parts) run in app-ui. Notes keeps the browser tests that
check the app through its import map. The generated SHELL lists every app-ui file the page loads, and `style-src`
allows `core.anawj.com`.
