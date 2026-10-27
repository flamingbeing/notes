// Sign-in without a server: Google OAuth for installed apps (loopback redirect, PKCE, state), then
// Firebase signInWithIdp, then the app's /api/claims (the rules read the role from claims). Only the Firebase refresh token and the email are stored, in
// ~/.config/notes-mcp/token.json (mode 0600). Messages go to stderr: stdout is the MCP channel.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export class NotSignedInError extends Error {}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lc = s => String(s || '').trim().toLowerCase();

// ---- token file ----

export const defaultTokenFile = () => path.join(os.homedir(), '.config', 'notes-mcp', 'token.json');

export function readToken(file = defaultTokenFile()) {
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    return t && typeof t.refreshToken === 'string' && t.refreshToken && typeof t.email === 'string' ? { refreshToken: t.refreshToken, email: lc(t.email) } : null;
  } catch { return null; }
}

export function writeToken({ refreshToken, email }, file = defaultTokenFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ refreshToken, email: lc(email) }, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);   // also when the file was already there with other permissions
}

export function deleteToken(file = defaultTokenFile()) {
  try { fs.unlinkSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

// ---- Firebase token refresh ----

async function postJson(fetch, url, init, what) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_description || body?.error || res.statusText;
    const err = new Error(`${what} failed (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status; err.code = typeof msg === 'string' ? msg : '';
    throw err;
  }
  return body;
}

export async function refreshIdToken({ fetch = globalThis.fetch, apiKey, refreshToken }) {
  const body = await postJson(fetch, `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  }, 'Token refresh');
  return { idToken: body.id_token, refreshToken: body.refresh_token || refreshToken, expiresIn: Number(body.expires_in) || 3600 };
}

const claimsOf = idToken => {
  try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
};

// Asks the Worker to put the person's role on their account as claims (what the app does after sign-in); the next
// token refresh carries them. Throws when the person is not a member of Notes.
export async function requestClaims({ fetch = globalThis.fetch, appUrl, idToken }) {
  const body = await postJson(fetch, `${appUrl}/api/claims`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } }, 'Notes access check');
  if (!body.claims || !body.claims.g) throw new NotSignedInError('this Google account has no access to Notes (ask the owner to add you)');
  return body.claims;
}

// A session from the stored token: { email, uid(), getIdToken(force), renewClaims() }. Throws NotSignedInError if there
// is no token file. The ID token is kept in memory only, refreshed a minute before it expires; one without the role
// claims is sent through /api/claims first. fetch is global unless injected.
export function makeSession({ fetch = globalThis.fetch, apiKey, appUrl, tokenFile = defaultTokenFile(), now = () => Date.now() }) {
  const stored = readToken(tokenFile);
  if (!stored) throw new NotSignedInError('not signed in');
  let cache = null;

  async function refresh() {
    let r;
    try { r = await refreshIdToken({ fetch, apiKey, refreshToken: stored.refreshToken }); }
    catch (e) {
      if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND/.test(e.code || e.message)) {
        throw new NotSignedInError('your sign-in has expired or was revoked');
      }
      throw e;
    }
    if (r.refreshToken !== stored.refreshToken) { stored.refreshToken = r.refreshToken; writeToken(stored, tokenFile); }
    return { idToken: r.idToken, expires: now() + r.expiresIn * 1000 };
  }

  async function renewClaims() {
    await requestClaims({ fetch, appUrl, idToken: (cache || (cache = await refresh())).idToken });
    cache = await refresh();
    return cache.idToken;
  }

  return {
    email: stored.email,
    async uid() { return claimsOf(await this.getIdToken()).user_id; },
    async getIdToken(force = false) {
      if (!force && cache && cache.expires > now() + 60_000) return cache.idToken;
      cache = await refresh();
      if (!claimsOf(cache.idToken).g) await renewClaims();
      return cache.idToken;
    },
    renewClaims,
  };
}

// ---- interactive login ----

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge, state: b64url(crypto.randomBytes(16)) };
}

export function authUrl({ clientId, redirectUri, challenge, state }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email',
    code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function openBrowser(url, log) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`]]   // quoted: & is literal
    : ['xdg-open', [url]];
  let shown = false;
  const fallback = () => { if (!shown) { shown = true; log(`Couldn't open a browser. Open this address to sign in:\n\n${url}\n`); } };
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', fallback);
    child.on('exit', code => { if (code) fallback(); });
    child.unref();
  } catch { fallback(); }
}

const PAGE = msg => `<!doctype html><meta charset="utf-8"><title>Notes</title><body style="font:16px system-ui;margin:3em">${msg}</body>`;

// Waits for Google's redirect on 127.0.0.1:<random port>. Resolves with the code.
function waitForCode({ state, timeoutMs, onListening }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const done = (ok, msg, err) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(msg));
        clearTimeout(timer); server.close();
        ok ? resolve(u.searchParams.get('code')) : reject(err);
      };
      if (u.searchParams.get('state') !== state) return done(false, 'Sign-in failed (state mismatch). Close this tab and try again.', new Error('OAuth state mismatch'));
      if (u.searchParams.get('error')) return done(false, 'Sign-in was cancelled. You can close this tab.', new Error(`Google sign-in: ${u.searchParams.get('error')}`));
      if (!u.searchParams.get('code')) return done(false, 'No sign-in code received.', new Error('No authorisation code'));
      done(true, 'Signed in to the Notes MCP server. You can close this tab.');
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('Timed out waiting for Google sign-in')); }, timeoutMs);
    server.on('error', e => { clearTimeout(timer); reject(e); });
    server.listen(0, '127.0.0.1', () => onListening(server.address().port));
  });
}

// open(url, log) is injectable for tests (the default opens the system browser).
export async function login({ clientId, clientSecret, apiKey, fetch = globalThis.fetch, tokenFile = defaultTokenFile(), log = m => process.stderr.write(m + '\n'), timeoutMs = 5 * 60_000, open = openBrowser }) {
  const { verifier, challenge, state } = pkce();
  let redirectUri = '';
  const code = await waitForCode({
    state, timeoutMs,
    onListening: port => {
      redirectUri = `http://127.0.0.1:${port}`;
      log('Opening your browser to sign in with Google…');
      open(authUrl({ clientId, redirectUri, challenge, state }), log);
    },
  });

  const google = await postJson(fetch, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
      grant_type: 'authorization_code', code_verifier: verifier,
    }).toString(),
  }, 'Google token exchange');
  if (!google.id_token) throw new Error('Google returned no id_token');

  const fb = await postJson(fetch, `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(google.id_token)}&providerId=google.com`,
      requestUri: 'http://localhost', returnSecureToken: true,
    }),
  }, 'Firebase sign-in');
  if (!fb.refreshToken || !fb.email) throw new Error('Firebase returned no refresh token or email');

  writeToken({ refreshToken: fb.refreshToken, email: fb.email }, tokenFile);
  return { email: lc(fb.email) };
}
