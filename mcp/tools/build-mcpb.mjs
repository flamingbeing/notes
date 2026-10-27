#!/usr/bin/env node
// Stages the Claude Desktop extension (.mcpb) for the Notes MCP server; the release workflow
// (.github/workflows/notes-mcpb.yml) then packs it with the official mcpb CLI.
//   node mcp/tools/build-mcpb.mjs [stage dir]   (default mcp/dist/stage)
// The stage holds manifest.json, the icon, and only the files server.mjs imports (followed from it, so a new import is
// never left out), laid out as in the repo (mcp/…, app/src/…) with the server's production node_modules. The manifest's
// tool list comes from lib/tools.mjs itself, so it can't fall out of step.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.dirname(MCP);
const stage = path.resolve(process.argv[2] || path.join(MCP, 'dist', 'stage'));
const pkg = JSON.parse(fs.readFileSync(path.join(MCP, 'package.json'), 'utf8'));

// relative imports, static and dynamic, from one module
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
export function importGraph(entry) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT)) todo.push(path.resolve(path.dirname(f), m[1]));
  }
  return [...seen].sort();
}

async function main() {
  fs.rmSync(stage, { recursive: true, force: true });
  const files = importGraph(path.join(MCP, 'server.mjs'));
  for (const f of files) if (!f.startsWith(ROOT + path.sep)) throw new Error(`server.mjs imports ${f}, outside the repo`);
  for (const f of [...files, path.join(MCP, 'package.json'), path.join(MCP, 'package-lock.json')]) {
    const to = path.join(stage, path.relative(ROOT, f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
  }
  fs.copyFileSync(path.join(MCP, 'icon.png'), path.join(stage, 'icon.png'));
  // the app files the server imports are ES modules because the repo's package.json says so; the bundle needs the same
  fs.writeFileSync(path.join(stage, 'package.json'), '{ "type": "module" }\n');
  execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: path.join(stage, 'mcp'), stdio: 'inherit' });

  const { defineTools } = await import(path.join(MCP, 'lib', 'tools.mjs'));
  const noop = async () => {};
  const tools = defineTools(noop)
    .map(t => ({ name: t.name, description: t.description }));
  const manifest = {
    manifest_version: '0.2',
    name: 'notes',
    display_name: 'Notes',
    version: pkg.version,
    description: 'Your own Notes in Claude: list, search and read notes; create, add to, overwrite and delete (to the bin) notes in your own notes and shared spaces.',
    long_description: 'Signs in as you with Google (a browser window opens the first time you use it) and uses the same Firestore rules as the web app, so it sees and changes only your own notes and the shared spaces you are in. Overwriting and deleting are shown to you first and done only once you agree; a deleted note goes to the app\'s bin and can be restored there. What it reads or writes goes through Claude: keep patient details out of your notes. Your sign-in stays on this computer (~/.config/notes-mcp/token.json).',
    author: { name: 'Notes', url: 'https://notes.flamingbeing.com/' },
    homepage: 'https://github.com/flamingbeing/notes/tree/main/mcp#readme',
    documentation: 'https://github.com/flamingbeing/notes/tree/main/mcp#readme',
    support: 'https://github.com/flamingbeing/notes/issues',
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'mcp/server.mjs',
      mcp_config: { command: 'node', args: ['${__dirname}/mcp/server.mjs'] },
    },
    tools,
    keywords: ['notes', 'markdown', 'obsidian'],
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: pkg.engines.node } },
  };
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stderr.write(`Staged ${files.length} source files and ${tools.length} tools in ${stage}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write(`build-mcpb: ${e.message}\n`); process.exit(1); });
}
