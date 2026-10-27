import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSessions } from '../sessions.js';

const ORIGIN = 'https://app.example.com';
const verify = async t => { if (t !== 'good') throw new Error('bad token'); return { sub: 'u1' }; };
const call = (opts, { method = 'POST', headers = {}, path = '/api/sessions/revoke' } = {}) =>
  handleSessions(new Request(`${ORIGIN}${path}`, { method, headers }), { origin: ORIGIN, verify, ...opts });
const withAdmin = () => { const revoked = []; return { revoked, admin: { revokeSessions: async uid => { revoked.push(uid); } } }; };

test('revokes the caller’s own sign-ins, nobody else’s', async () => {
  const { admin, revoked } = withAdmin();
  const res = await call({ admin }, { headers: { Authorization: 'Bearer good' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(revoked, ['u1']);
});

test('refuses: no token, bad token, wrong origin, wrong method, wrong path, not set up', async () => {
  const { admin, revoked } = withAdmin();
  assert.equal((await call({ admin })).status, 401);
  assert.equal((await call({ admin }, { headers: { Authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await call({ admin }, { headers: { Authorization: 'Bearer good', Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call({ admin }, { method: 'GET', headers: { Authorization: 'Bearer good' } })).status, 405);
  assert.equal((await call({ admin }, { path: '/api/sessions/other', headers: { Authorization: 'Bearer good' } })).status, 404);
  assert.equal((await call({ admin: null }, { headers: { Authorization: 'Bearer good' } })).status, 503);
  assert.deepEqual(revoked, []);
});

test('a failed revoke is a 500 the page can show', async () => {
  const admin = { revokeSessions: async () => { throw new Error('boom'); } };
  const res = await call({ admin }, { headers: { Authorization: 'Bearer good' } });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /Try again/);
});
