// Soak for the MCP code sign-in (target 3 of the starter soak). Made-up data only; the Auth emulator and one bogus
// refresh call against the live identity endpoint, nothing else live.
//   node soak/mcp-soak.mjs [rounds=5] [--no-emulator] [--no-real]
// Per round: mcp/ unit tests under clock skews, the Auth-emulator scenarios, the bogus real refresh, the login CLI with
// bad codes. One summary line per step; the last line is PASS n/N or FAIL with the first failing step and its log path.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const rounds = Number(args.find(a => /^\d+$/.test(a)) || 5);
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-soak-logs-'));
let pass = 0, failed = null;
const step = (label, cmd, argv, env = {}, cwd = root) => {
  const t = Date.now();
  const r = spawnSync(cmd, argv, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600_000, shell: process.platform === 'win32' && (cmd === 'npx' || cmd === 'npm') });
  const log = path.join(logDir, `${label.replace(/\W+/g, '_')}-${t}.log`);
  fs.writeFileSync(log, `${r.stdout}\n${r.stderr}`);
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)${ok ? '' : ' log ' + log}`);
  if (!ok && !failed) failed = { label, log };
  return ok;
};
if (!fs.existsSync(path.join(root, 'mcp', 'node_modules')) && !step('npm ci mcp', 'npm', ['ci', '--no-audit', '--no-fund'], {}, path.join(root, 'mcp'))) { console.log('FAIL 0/' + rounds + ' npm ci in mcp/ failed'); process.exit(1); }
for (let i = 1; i <= rounds; i++) {
  let all = true;
  for (const skew of [0, 3600e3, -3600e3, 25 * 3600e3]) {
    all = step(`r${i} mcp tests skew=${skew / 3600e3}h`, process.execPath, ['--import', pathToFileURL(path.join(root, 'soak', 'skew.mjs')).href, '--test', ...fs.readdirSync(path.join(root, 'mcp', 'test')).filter(f => f.endsWith('.test.mjs')).map(f => path.join(root, 'mcp', 'test', f))], { SOAK_SKEW_MS: String(skew) }) && all;
  }
  if (!args.includes('--no-emulator')) all = step(`r${i} auth emulator`, 'npx', ['-y', 'firebase-tools@15.33.0', 'emulators:exec', '--only', 'auth', '--project', 'demo-notes', `node soak/mcp-emulator.mjs`], { SOAK_N: '20' }) && all;
  if (!args.includes('--no-real')) all = step(`r${i} real bogus refresh`, process.execPath, ['soak/mcp-real.mjs']) && all;
  all = step(`r${i} login bad code`, process.execPath, ['soak/mcp-login.mjs', ...args.filter(a => a === '--no-real')]) && all;
  if (all) pass++;
}
console.log(failed ? `FAIL ${pass}/${rounds} first: ${failed.label} ${failed.log}` : `PASS ${pass}/${rounds}`);
process.exit(failed ? 1 : 0);
