#!/usr/bin/env bash
# Sets up a fresh checkout to run every check locally: packages, and .devkit/ at the app-devkit tag CI pins
# (.github/workflows/checks.yml). Then prints what to export for the browser tests.
#   bash tools/dev-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
tag=$(grep -o 'app-devkit/setup-tools@v[0-9.]*' .github/workflows/checks.yml | head -1 | cut -d@ -f2)
if [ ! -d .devkit ]; then
  git clone --quiet --depth 1 --branch "$tag" https://github.com/flamingbeing/app-devkit .devkit
elif [ "$(git -C .devkit describe --tags 2>/dev/null)" != "$tag" ]; then
  echo ".devkit/ is not at $tag: remove it and run this again" >&2; exit 1
fi
npm ci --no-audit --no-fund
cat <<MSG
Ready (.devkit at $tag). Checks: node .devkit/tools/check.mjs; npm test; npm run typecheck; npm run rules;
npm run e2e; npm run vite && APP_DIR=dist npm run e2e.
If Playwright has no browser of its own here, point it at one first, e.g.
  export PW_CHROMIUM=/opt/pw-browsers/chromium METADATA_SERVER_DETECTION=none
MSG
