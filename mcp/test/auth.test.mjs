// No network: fetch is stubbed; temp token file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { readToken, writeToken, deleteToken, makeSession, refreshIdToken, requestClaims, pkce, authUrl, login, NotSignedInError, NoAccessError } from '../lib/auth.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-mcp-test-'));
const file = path.join(dir, 'sub', 'token.json');
const jwt = payload => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
const ok = body => ({ ok: true, status: 200, json: async () => body });
const fail = (status, error) => ({ ok: false, status, json: async () => ({ error }) });

test('token file: only refresh token + email, mode 0600', () => {
  assert.equal(readToken(file), null);
  writeToken({ refreshToken: 'R1', email: 'Me@Example.com', idToken: 'never stored' }, file);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { refreshToken: 'R1', email: 'me@example.com' });
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readToken(file), { refreshToken: 'R1', email: 'me@example.com' });
});

test('refresh token exchange', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return ok({ id_token: 'ID', refresh_token: 'R2', expires_in: '3600' }); };
  assert.deepEqual(await refreshIdToken({ fetch, apiKey: 'KEY', refreshToken: 'R1' }), { idToken: 'ID', refreshToken: 'R2', expiresIn: 3600 });
  assert.equal(calls[0].url, 'https://securetoken.googleapis.com/v1/token?key=KEY');
  assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'refresh_token');
});

test('session: caches, rotates the refresh token, forces, and asks /api/claims when the token has no role', async () => {
  writeToken({ refreshToken: 'R1', email: 'me@example.com' }, file);
  let clock = 0, refreshes = 0, claimed = 0, hasRole = false;
  const fetch = async (url, init) => {
    if (url === 'https://notes.example/api/claims') {
      claimed++;
      assert.ok(init.headers.Authorization.endsWith(`s${refreshes}`), "the claims ask carries the token just refreshed");
      hasRole = true;
      return ok({ claims: { g: { _: 'member' }, v: 1, m: 'google' } });
    }
    refreshes++;
    return ok({ id_token: hasRole ? jwt({ user_id: 'U1', g: { _: 'member' } }) + refreshes : jwt({ user_id: 'U1' }) + refreshes, refresh_token: 'R2', expires_in: '3600' });
  };
  const s = makeSession({ fetch, apiKey: 'KEY', appUrl: 'https://notes.example', tokenFile: file, now: () => clock });
  assert.equal(s.email, 'me@example.com');
  const first = await s.getIdToken();
  assert.equal(claimed, 1, 'no role in the token: claims asked once');
  assert.equal(refreshes, 2, 'refreshed again so the token carries the role');
  assert.equal(await s.getIdToken(), first, 'cached');
  assert.equal(await s.uid(), 'U1');
  assert.equal(readToken(file).refreshToken, 'R2', 'rotated refresh token saved');
  clock = 3600_000 - 30_000;
  assert.notEqual(await s.getIdToken(), first, 'refreshed within a minute of expiry');
  assert.equal(claimed, 1, 'a token that has the role does not ask again');
});

test('claims: not a member -> NoAccessError; bad refresh token -> NotSignedInError', async () => {
  await assert.rejects(() => requestClaims({ fetch: async () => ok({ claims: {} }), appUrl: 'https://notes.example', idToken: 'T' }), NoAccessError);
  await assert.rejects(() => requestClaims({ fetch: async () => fail(500, 'x'), appUrl: 'https://notes.example', idToken: 'T' }), /Notes access check failed \(500\)/);
  writeToken({ refreshToken: 'BAD', email: 'me@example.com' }, file);
  const fetch = async () => fail(400, { message: 'INVALID_REFRESH_TOKEN' });
  await assert.rejects(() => makeSession({ fetch, apiKey: 'KEY', appUrl: 'https://notes.example', tokenFile: file }).getIdToken(), NotSignedInError);
});

test('deleteToken, and a session needs a token', () => {
  assert.equal(deleteToken(file), true);
  assert.equal(deleteToken(file), false);
  assert.throws(() => makeSession({ apiKey: 'KEY', appUrl: 'https://notes.example', tokenFile: file }), NotSignedInError);
});

test('PKCE and the auth URL', () => {
  const p = pkce();
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.challenge, crypto.createHash('sha256').update(p.verifier).digest('base64url'));
  assert.notEqual(p.state, pkce().state);
  const u = new URL(authUrl({ clientId: 'CID', redirectUri: 'http://127.0.0.1:5555', challenge: p.challenge, state: p.state }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('scope'), 'openid email');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5555');
  assert.equal(u.searchParams.get('state'), p.state);
});

test('login: loopback redirect, PKCE, Google and Firebase stubbed', async () => {
  // login: loopback redirect on 127.0.0.1 (local only), Google + Firebase stubbed
  const seen = [];
  const stub = async (url, init) => {
    seen.push({ url, body: init.body });
    if (url === 'https://oauth2.googleapis.com/token') return { ok: true, status: 200, json: async () => ({ id_token: 'GOOGLE_ID' }) };
    if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=KEY')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'FB_ID', refreshToken: 'FB_R', email: 'Me@Example.com', expiresIn: '3600' }) };
    }
    throw new Error('unexpected ' + url);
  };
  const redirectTo = (params) => async url => {
    const a = new URL(url);
    const back = new URL(a.searchParams.get('redirect_uri'));
    for (const [k, v] of Object.entries(params(a))) back.searchParams.set(k, v);
    await globalThis.fetch(back).then(r => r.text());
  };
  const out = await login({ clientId: 'CID', clientSecret: 'CSECRET', apiKey: 'KEY', fetch: stub, tokenFile: file, log: () => {},
    open: redirectTo(a => ({ code: 'CODE', state: a.searchParams.get('state') })) });
  assert.deepEqual(out, { email: 'me@example.com' });
  assert.deepEqual(readToken(file), { refreshToken: 'FB_R', email: 'me@example.com' });
  const ex = new URLSearchParams(seen[0].body);
  assert.equal(ex.get('code'), 'CODE'); assert.equal(ex.get('client_secret'), 'CSECRET');
  assert.equal(ex.get('grant_type'), 'authorization_code'); assert.match(ex.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(ex.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+$/);
  const idp = JSON.parse(seen[1].body);
  assert.deepEqual(idp, { postBody: 'id_token=GOOGLE_ID&providerId=google.com', requestUri: 'http://localhost', returnSecureToken: true });
  await assert.rejects(() => login({ clientId: 'CID', clientSecret: 'S', apiKey: 'KEY', fetch: stub, tokenFile: file, log: () => {},
    open: redirectTo(() => ({ code: 'CODE', state: 'forged' })) }), /state mismatch/);
});

// ---- sign-in by code ----
import { loginWithCode } from '../lib/auth.mjs';
import { encodeCode, decodeCode } from '../../app/src/mcp/code.js';

test('code: round trip, and what is not a code is refused', () => {
  const code = encodeCode({ projectId: 'proj-1', refreshToken: 'R-é/+=' });
  assert.match(code, /^nmcp1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCode(`  ${code}\n`), { projectId: 'proj-1', refreshToken: 'R-é/+=' });
  assert.throws(() => decodeCode('R1'), /not a Notes code/);
  assert.throws(() => decodeCode('nmcp1.'), /damaged/);
  assert.throws(() => decodeCode(code.slice(0, 12)), /damaged/);
  assert.throws(() => decodeCode(`nmcp1.${Buffer.from('{"p":"x"}').toString('base64url')}`), /damaged/);
});

test('code login: one refresh proves it, then only refresh token + email are kept', async () => {
  const f = path.join(dir, 'code', 'token.json');
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return ok({ id_token: jwt({ user_id: 'U1', email: 'Me@Example.com' }), refresh_token: 'R2', expires_in: '3600' }); };
  const code = encodeCode({ projectId: 'proj-1', refreshToken: 'R1' });
  assert.deepEqual(await loginWithCode({ code, apiKey: 'KEY', projectId: 'proj-1', fetch, tokenFile: f }), { email: 'me@example.com' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://securetoken.googleapis.com/v1/token?key=KEY');
  assert.equal(new URLSearchParams(calls[0].init.body).get('refresh_token'), 'R1');
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { refreshToken: 'R2', email: 'me@example.com' });
  if (process.platform !== 'win32') assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  // and a session made from that file refreshes with the rotated token
  const s = makeSession({ fetch: async () => ok({ id_token: jwt({ user_id: 'U1', g: { _: 'member' } }), refresh_token: 'R2', expires_in: '3600' }), apiKey: 'KEY', appUrl: 'https://notes.example', tokenFile: f });
  assert.equal(await s.uid(), 'U1');
});

test('code login: revoked code, bad code, wrong project, no email: refused and nothing saved', async () => {
  const f = path.join(dir, 'code-bad', 'token.json');
  const code = encodeCode({ projectId: 'proj-1', refreshToken: 'R1' });
  const never = async () => { throw new Error('no network call expected'); };
  await assert.rejects(() => loginWithCode({ code, apiKey: 'KEY', projectId: 'proj-1', fetch: async () => fail(400, 'TOKEN_EXPIRED'), tokenFile: f }), NotSignedInError);
  await assert.rejects(() => loginWithCode({ code, apiKey: 'KEY', projectId: 'proj-1', fetch: async () => fail(400, 'INVALID_REFRESH_TOKEN'), tokenFile: f }), /no longer works/);
  await assert.rejects(() => loginWithCode({ code: 'junk', apiKey: 'KEY', projectId: 'proj-1', fetch: never, tokenFile: f }), /not a Notes code/);
  await assert.rejects(() => loginWithCode({ code, apiKey: 'KEY', projectId: 'other', fetch: never, tokenFile: f }), /another app \(proj-1\)/);
  await assert.rejects(() => loginWithCode({ code, apiKey: 'KEY', projectId: 'proj-1', fetch: async () => ok({ id_token: jwt({ user_id: 'U1' }), expires_in: '3600' }), tokenFile: f }), /no email/);
  await assert.rejects(() => loginWithCode({ code, apiKey: 'KEY', projectId: 'proj-1', fetch: async () => fail(500, 'x'), tokenFile: f }), /Token refresh failed \(500\)/);
  assert.equal(readToken(f), null);
});
