// `node mcp/server.mjs login` with a bad code on stdin (what Windows runs): a clean exit 1, a message, and no
// assertion / abort (libuv "Assertion failed ... async.c" killed it with an abort before notes#32). HOME is a temp dir.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeCode } from '../app/src/mcp/code.js';
import { PROJECT_ID } from '../mcp/config.mjs';
const server = path.resolve(import.meta.dirname, '../mcp/server.mjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-login-'));
const env = { ...process.env, HOME: home, USERPROFILE: home };
let fails = 0;
const run = (label, input, want) => {
  const r = spawnSync(process.execPath, [server, 'login'], { input, env, encoding: 'utf8', timeout: 60_000 });
  const out = `${r.stdout}${r.stderr}`;
  const bad = r.status !== 1 || /Assertion|abort|UV_HANDLE/i.test(out) || r.signal || !want.test(out);
  if (bad) fails++;
  console.log(`login ${label}: exit=${r.status} signal=${r.signal || '-'} ${bad ? 'FAIL ' + out.replace(/\s+/g, ' ').slice(0, 200) : 'ok'}`);
};
run('junk code', 'junk\n', /not a Notes code/);
run('empty', '\n', /No code given/);
run('bogus refresh', encodeCode({ projectId: PROJECT_ID, refreshToken: `bogus-${Date.now()}` }) + '\n', /no longer works/);
run('wrong project', encodeCode({ projectId: 'other-app', refreshToken: 'x' }) + '\n', /another app/);
if (fs.existsSync(path.join(home, '.config', 'notes-mcp', 'token.json'))) { fails++; console.log('login FAIL: a token file was saved'); }
fs.rmSync(home, { recursive: true, force: true });
console.log(fails ? `login FAIL ${fails}` : 'login PASS');
process.exit(fails ? 1 : 0);
