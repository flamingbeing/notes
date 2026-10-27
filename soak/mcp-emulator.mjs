// MCP code sign-in against the Auth emulator (no live project): a real user, a real refresh token, the real
// loginWithCode / makeSession code. Run inside: firebase emulators:exec --only auth --project demo-notes "node soak/mcp-emulator.mjs"
// Cases: good code, rotated token kept, revoked (deleted user) code, bad code, wrong project, clock skew in the session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loginWithCode, makeSession, readToken, NotSignedInError } from '../mcp/lib/auth.mjs';
import { encodeCode } from '../app/src/mcp/code.js';

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
assert(host, 'FIREBASE_AUTH_EMULATOR_HOST not set (run inside emulators:exec)');
const PROJECT = 'demo-notes', KEY = 'fake-key';
const emu = `http://${host}`;
// the real Google hosts are answered by the emulator
const fetchEmu = (url, init) => fetch(String(url).replace(/^https:\/\/(securetoken|identitytoolkit)\.googleapis\.com\//, (_, h) => `${emu}/${h}.googleapis.com/`), init);
const post = async (p, body) => (await fetchEmu(`https://identitytoolkit.googleapis.com/${p}?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const signUp = async () => post('v1/accounts:signUp', { email: `soak-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.com`, password: 'made-up-pass-1', returnSecureToken: true });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-soak-'));
const tf = n => path.join(dir, n, 'token.json');
const rounds = Number(process.env.SOAK_N || 20);
let n = 0;
for (let i = 0; i < rounds; i++) {
  // good code
  const u = await signUp();
  assert(u.refreshToken, 'emulator sign-up gave no refresh token');
  const code = encodeCode({ projectId: PROJECT, refreshToken: u.refreshToken });
  const r = await loginWithCode({ code, apiKey: KEY, projectId: PROJECT, fetch: fetchEmu, tokenFile: tf(`ok${i}`) });
  assert.equal(r.email, u.email);
  assert.deepEqual(Object.keys(readToken(tf(`ok${i}`))).sort(), ['email', 'refreshToken']);
  // clock skew: +/-2 h on the session's clock must still return a token for the same user, and refresh on a stale cache
  for (const skew of [0, 2 * 3600e3, -2 * 3600e3]) {
    let calls = 0;
    const f = (url, init) => { calls++; return fetchEmu(url, init); };
    const s = makeSession({ fetch: f, apiKey: KEY, appUrl: 'http://127.0.0.1:1', tokenFile: tf(`ok${i}`), now: () => Date.now() + skew });
    // no role claim in the emulator user: the session asks the Worker (unreachable here), so only check the refresh itself
    await s.getIdToken().catch(e => assert.match(String(e.message), /fetch failed|claims|ECONNREFUSED|NoAccess|not a member/i));
    assert(calls >= 1, 'session did not refresh');
  }
  // revoked: delete the user, then the old code must be refused as NotSignedIn
  const u2 = await signUp();
  const code2 = encodeCode({ projectId: PROJECT, refreshToken: u2.refreshToken });
  await post('v1/accounts:delete', { idToken: u2.idToken });
  await assert.rejects(() => loginWithCode({ code: code2, apiKey: KEY, projectId: PROJECT, fetch: fetchEmu, tokenFile: tf(`rev${i}`) }), NotSignedInError);
  // bad code: a refresh token the emulator never issued
  await assert.rejects(() => loginWithCode({ code: encodeCode({ projectId: PROJECT, refreshToken: `bogus-${i}` }), apiKey: KEY, projectId: PROJECT, fetch: fetchEmu, tokenFile: tf(`bad${i}`) }), e => e instanceof NotSignedInError || /INVALID_REFRESH_TOKEN|no longer works/.test(e.message));
  // wrong project, junk
  await assert.rejects(() => loginWithCode({ code, apiKey: KEY, projectId: 'other', fetch: fetchEmu, tokenFile: tf(`wp${i}`) }), /another app/);
  await assert.rejects(() => loginWithCode({ code: 'junk', apiKey: KEY, projectId: PROJECT, fetch: fetchEmu, tokenFile: tf(`j${i}`) }), /not a Notes code/);
  for (const k of ['rev', 'bad', 'wp', 'j']) assert.equal(readToken(tf(`${k}${i}`)), null, `${k}: a token was saved`);
  n++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`emulator PASS ${n}/${rounds}`);
