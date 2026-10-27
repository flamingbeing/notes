// Vite check for the pieces (shaking): a page that imports settings carries the module, a page that imports only readFile
// carries the file code but not the module, a page that imports only parseQuery from @core/search carries no MiniSearch,
// and a page that imports none of it carries nothing. Builds small pages into a temp folder; nothing is kept.
//   node tools/vite-pieces.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.mkdtempSync(path.join(os.tmpdir(), 'pieces-src-'));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pieces-out-'));
const MODULE = 'sign in first (account options belong to an account)';   // module.js only
const FILE = 'not JSON';                                                // file.js only
const DRIVE = 'googleapis.com/drive/v3/files';                          // @core/drive remote.js only
const PAGES = {
  full: "import { settings } from '@core/settings'; console.log(settings({ options: {} }));",
  file: "import { readFile } from '@core/settings'; console.log(readFile);",
  none: "console.log('no settings here');",
  query: "import { parseQuery } from '@core/search'; console.log(parseQuery('a'));",
  drive: "import { driveRemote } from '@core/drive'; console.log(driveRemote);",
  print: "import { fingerprint } from '@core/drive'; console.log(fingerprint('a'));",
  index: "import { createSearch } from '@core/search'; console.log(createSearch({ fields: ['a'] }));",
};
for (const [name, code] of Object.entries(PAGES)) {
  fs.writeFileSync(path.join(SRC, `${name}.js`), code);
  fs.writeFileSync(path.join(SRC, `${name}.html`), `<!doctype html><script type="module" src="./${name}.js"></script>`);
}

await build({
  configFile: false, root: SRC, base: './', logLevel: 'warn',
  resolve: { alias: { '@core/settings': path.join(ROOT, 'node_modules/app-ui/settings/index.js'), '@core/search': path.join(ROOT, 'app/public/search/index.js'), '@core/drive': path.join(ROOT, 'app/public/drive/index.js') } },
  build: { outDir: OUT, emptyOutDir: true, target: 'es2022', rollupOptions: { output: { experimentalMinChunkSize: 0 }, input: Object.fromEntries(Object.keys(PAGES).map(n => [n, path.join(SRC, `${n}.html`)])) } },
});

// every script a built page loads: its module scripts and, from each, the chunks it imports
function carried(page) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*["'](\.[^"']+\.js)["']/g)) visit(path.resolve(path.dirname(file), m[1]));
  };
  for (const m of fs.readFileSync(path.join(OUT, `${page}.html`), 'utf8').matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) visit(path.join(OUT, m[1]));
  return [...seen].map(f => fs.readFileSync(f, 'utf8')).join('\n');
}
const full = carried('full'), file = carried('file'), none = carried('none'), query = carried('query'), index = carried('index'), drive = carried('drive'), print = carried('print');
const problems = [];
if (!full.includes(MODULE) || !full.includes(FILE)) problems.push('the page that uses settings does not carry it');
if (file.includes(MODULE)) problems.push('a page that imports only readFile carries module.js');
if (!file.includes(FILE)) problems.push('a page that imports readFile does not carry it');
if (none.includes(MODULE) || none.includes(FILE)) problems.push('a page that uses none of it carries it');
if (!index.includes('removeAll') || !index.includes('discard')) problems.push('the page that uses createSearch does not carry MiniSearch');
if (query.includes('removeAll') || query.includes('discard')) problems.push('a page that imports only parseQuery carries MiniSearch');
if (none.includes('removeAll') || none.includes('discard') || none.includes('editDistance')) problems.push('a page that uses none of search carries it');
if (!drive.includes(DRIVE)) problems.push('the page that uses driveRemote does not carry it');
if (print.includes(DRIVE) || print.includes('reauthenticateWithPopup')) problems.push('a page that imports only fingerprint from @core/drive carries the Drive calls or the permission code');
if (none.includes(DRIVE)) problems.push('a page that uses none of @core/drive carries it');
fs.rmSync(SRC, { recursive: true, force: true }); fs.rmSync(OUT, { recursive: true, force: true });
if (problems.length) { console.error(`vite-pieces: ${problems.join('; ')}`); process.exit(1); }
console.log('vite-pieces: @core/settings, @core/search and @core/drive shake: a page carries only what it imports');
