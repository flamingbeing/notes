// Vendors the editor's libraries into app/public/vendor/ from the exact versions package.json pins (devDependencies;
// nothing from npm runs at runtime, decision 0010):
//   - CodeMirror 6: the names tools/codemirror-entry.js lists, bundled and minified into one ES module,
//     vendor/codemirror/<@codemirror/view version>/codemirror.js, with LICENSES.txt (every bundled package's licence);
//     its styles go in a constructed sheet, not a <style> element (adoptedStyles below), for the page's CSP
//   - marked: vendor/marked/<version>/marked.esm.js + LICENSE.md, as published
//   - DOMPurify: vendor/dompurify/<version>/purify.es.js + LICENSE, as published (purify.es.mjs renamed, so it is served
//     as JavaScript)
// The page loads them through its import map ("@vendor/codemirror", "marked", "dompurify"), only from the note sheet.
//   node tools/vendor-editor.mjs            write them (and remove other versions of them)
//   node tools/vendor-editor.mjs --check    fail if the vendored files or the import map differ from what this writes (CI)
// After a bump: npm i -D -E <package>@<version>, run this, then node tools/sw-files.mjs app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformWithEsbuild } from 'vite';
import { importMap } from './sw-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'app/public/vendor');
const MODULES = path.join(ROOT, 'node_modules');
const pkg = (/** @type {string} */ name) => JSON.parse(fs.readFileSync(path.join(MODULES, name, 'package.json'), 'utf8'));
const licenceOf = (/** @type {string} */ name) => {
  const f = fs.readdirSync(path.join(MODULES, name)).find(x => /^licen[cs]e(\.(md|txt))?$/i.test(x));
  if (!f) throw new Error(`${name} has no LICENSE file`);
  return { file: f, text: fs.readFileSync(path.join(MODULES, name, f), 'utf8') };
};
const stripMap = (/** @type {string} */ code) => code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');

// every pinned package must be installed at its pin (npm ci)
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies;
for (const [name, want] of Object.entries(pins)) {
  if (!/^(@codemirror|@lezer)\/|^(marked|dompurify)$/.test(name)) continue;
  if (pkg(name).version !== want) throw new Error(`${name} is ${pkg(name).version} in node_modules, ${want} in package.json: run npm ci`);
}

// CodeMirror's styles (style-mod) go into a <style> element on a page, which the page's CSP (no inline styles) refuses;
// they are put in a constructed sheet (document.adoptedStyleSheets) instead, as style-mod already does in a shadow root.
// The one change made to the bundled code.
const adoptedStyles = {
  name: 'adopted-styles',
  /** @param {string} code @param {string} id */
  transform(code, id) {
    if (!/[\\/]style-mod[\\/]/.test(id)) return null;
    const out = code.replace('if (!root.head && root.adoptedStyleSheets && win.CSSStyleSheet)', 'if (root.adoptedStyleSheets && win.CSSStyleSheet)');
    if (out === code) throw new Error('style-mod changed: check how it adds its styles (tools/vendor-editor.mjs, adoptedStyles)');
    return out;
  },
};

/** -> { [path under vendor/]: contents } and the import map entries */
async function files() {
  /** @type {Record<string, string>} */
  const out = {};
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-'));
  /** @type {Set<string>} */
  const used = new Set();
  const result = await build({
    configFile: false, logLevel: 'warn', root: ROOT, plugins: [adoptedStyles],
    build: { outDir: OUT, emptyOutDir: true, target: 'es2022', minify: false, write: false,
      lib: { entry: path.join(ROOT, 'tools/codemirror-entry.js'), formats: ['es'], fileName: () => 'codemirror.js' } },
  });
  const chunk = /** @type {any} */ (Array.isArray(result) ? result[0] : result).output[0];
  for (const id of Object.keys(chunk.modules)) {
    const m = id.split(path.sep).join('/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (m) used.add(m[1]);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  const { code } = await transformWithEsbuild(chunk.code, 'codemirror.js', { minify: true, format: 'esm', target: 'es2022', legalComments: 'none' });
  const cm = pkg('@codemirror/view').version;
  const names = [...used].sort();
  out[`codemirror/${cm}/codemirror.js`] = `/* CodeMirror 6 (MIT), bundled by tools/vendor-editor.mjs from: ${names.map(n => `${n}@${pkg(n).version}`).join(', ')}. Licences: LICENSES.txt */\n${code}`;
  out[`codemirror/${cm}/LICENSES.txt`] = names.map(n => `${n}@${pkg(n).version}\n\n${licenceOf(n).text.trim()}\n`).join('\n----\n\n');

  const mk = pkg('marked').version;
  out[`marked/${mk}/marked.esm.js`] = stripMap(fs.readFileSync(path.join(MODULES, 'marked/lib/marked.esm.js'), 'utf8'));
  out[`marked/${mk}/${licenceOf('marked').file}`] = licenceOf('marked').text;
  const dp = pkg('dompurify').version;
  out[`dompurify/${dp}/purify.es.js`] = stripMap(fs.readFileSync(path.join(MODULES, 'dompurify/dist/purify.es.mjs'), 'utf8'));
  out[`dompurify/${dp}/${licenceOf('dompurify').file}`] = licenceOf('dompurify').text;
  const map = {
    '@vendor/codemirror': `./vendor/codemirror/${cm}/codemirror.js`,
    marked: `./vendor/marked/${mk}/marked.esm.js`,
    dompurify: `./vendor/dompurify/${dp}/purify.es.js`,
  };
  return { out, map };
}

const { out, map } = await files();
const LIBS = ['codemirror', 'marked', 'dompurify'];
const onDisk = () => LIBS.flatMap(lib => {
  const dir = path.join(VENDOR, lib);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(v => fs.readdirSync(path.join(dir, v)).map(f => `${lib}/${v}/${f}`));
});
const page = importMap(fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8'));

if (process.argv.includes('--check')) {
  const problems = [];
  const have = onDisk();
  for (const [rel, text] of Object.entries(out)) {
    if (!have.includes(rel)) problems.push(`${rel} is missing`);
    else if (fs.readFileSync(path.join(VENDOR, rel), 'utf8') !== text) problems.push(`${rel} differs from the pinned package`);
  }
  for (const rel of have) if (!(rel in out)) problems.push(`${rel} is not from the pinned version`);
  for (const [name, url] of Object.entries(map)) if (page[name] !== url) problems.push(`the import map's "${name}" is not ${url}`);
  if (problems.length) { console.error(`vendor-editor: ${problems.join('; ')} (run node tools/vendor-editor.mjs)`); process.exit(1); }
  console.log('vendor-editor: ok');
} else {
  for (const lib of LIBS) fs.rmSync(path.join(VENDOR, lib), { recursive: true, force: true });
  for (const [rel, text] of Object.entries(out)) {
    fs.mkdirSync(path.dirname(path.join(VENDOR, rel)), { recursive: true });
    fs.writeFileSync(path.join(VENDOR, rel), text);
  }
  for (const [name, url] of Object.entries(map)) if (page[name] !== url) console.log(`set the import map's "${name}" to ${url} (app/index.html), then the IMPORT_MAP hash (worker/headers.js)`);
  const gz = (await import('node:zlib')).gzipSync(Object.entries(out).filter(([k]) => k.endsWith('.js')).map(([, v]) => v).join('')).length;
  console.log(`vendor-editor: wrote ${Object.keys(out).length} files, ${(gz / 1024).toFixed(0)} KiB gzipped JavaScript`);
}
