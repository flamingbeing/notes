# Notes

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).

A small notes app in the style of Obsidian: plain-text notes with `[[links]]`, tags, backlinks and daily notes, kept
offline-first on each device and synced. For the owner's own notes; no patient details, ever.

## Public here, private elsewhere

Anything merged here is public. Keep only code, docs, general rules and **made-up** sample data. Never commit
secrets, tokens, personal data, real names or patient details. Private notes belong in the owner's private notes
repo; never copy anything from there into this repo, a PR or an issue (neutral pointers like "ask the owner" are fine).

## Rules that bite

- Every save goes through the write queue (`app/src/cloud.js`); never write to Firestore around it, or sign-out can't
  tell what is unsent.
- Roles come from claims, cached from `members/{uid}`. Bump the doc's `v` on every role change. No email in rules.
- Edit `app/firestore.app.rules`, then rebuild `app/firestore.rules` (`node .devkit/tools/build-rules.mjs
  app/firestore.app.rules`); add a case to `app/test/rules.test.mjs` for every new rule.
- `worker/claims.js` and `worker/custom-token.js` are app-devkit's: never edit them here (CI compares them).
- Shared modules (app-sync, app-ui, app-update) and app-devkit blocks are pinned to exact versions; bump on purpose, after the
  tests pass. No moving `@v1` pins.
- app-sync's and app-ui's versions are each named in the import map (`app/index.html`, which also `<link>`s app-ui's
  sheets and `theme/early.js`), the devDependency tag in `package.json` (app-sync's `.d.ts` and app-ui's JS are what
  `npm run typecheck` checks `app/src` against, under `strict`) and `worker/headers.js`'s import map hash; bump together.
- `app/public/sw.js`'s SHELL list is generated: after adding or removing a file the page loads, or bumping app-sync,
  run `node tools/sw-files.mjs app`. Firebase is vendored: bump it with `node tools/vendor-firebase.mjs <version>`
  (never edit `app/public/vendor/`). Both have a `--check` in CI ([decision 0007](docs/decisions/0007-vendored-firebase-generated-sw-list.md)).
- New library, own-host sign-in, live smoke test, template updates: go through
  the app-starter new-app checklist. Files and search are modules (`node tools/add.mjs files|search`). `@core/files` `url()` is a page-local `blob:` URL; hand a
  file on with `files.blob(id)`. App-sync bumps: `node tools/update-from-starter.mjs --sync <x.y.z>`.
- Installable, never prompted: keep `app/src/boot.js` (cancels `beforeinstallprompt`). No install buttons.
- The Content-Security-Policy is Report-Only until a live sign-in, sync and update show no reports
  ([decision 0003](docs/decisions/0003-csp-report-only-first.md)); the browser tests already fail on any report.

## Checks before merging

```
node .devkit/tools/check.mjs
node --test 'worker/test/*.test.mjs' 'app/test/*.unit.test.mjs' 'tools/test/*.test.mjs'
npm run typecheck
```

Locally only these, plus the one spec you are fixing (`npx playwright test e2e/<file>`). Browser and rules tests run on
GitHub: Checks on every PR is the quick set (unit, type check, rules, Chromium phone tests in shards, Vite build and
`@smoke`); merge on its green. Full checks (`full-checks.yml`: the whole suite on the Vite build and any slower runs)
run nightly with the soak and on request (Actions, "Full checks", Run workflow, `ref` = a PR number); set the repo
variable `FULL_CHECKS_ON_PRS=true` to run them on every PR. Tag one to three tests `{ tag: '@smoke' }` (sign-in screen,
the main flow) for the Vite smoke. Never run the full browser suite locally first.

## Working with the owner

- Instructions mostly come from a phone. Work through a request to the end; ask only when a decision is genuinely
  the owner's. When asked to plan, plan and wait.
- Keep each PR small and finished on its own. Start PR titles with the app: "Notes: …".
- Merge your own PRs once the checks pass, then report with the PR link and call `unsubscribe_pr_activity`.
- Keep `NOTES.md` (lasting decisions, how to test) and `STATUS.md` (now, waiting on the owner, next, dated
  decisions) current; a decision that shapes the code gets a record in `docs/decisions/`. Cheap end of session:
  `quick-save`.
- Plain words, short; explain technical terms briefly the first time.
