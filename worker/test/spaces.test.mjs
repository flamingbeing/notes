import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSpaces, acceptInvites, inviteKey, spaceAccess, appRole } from '../spaces.js';
import { loadClaims } from '../members.js';
import { store as restStore, fieldPath } from '../store.js';
import { memoryStore } from './memory-store.mjs';
import { memoryBucket } from '../../e2e/memory-bucket.mjs';

// made-up people: ann, bob and cat are in the app (cat as a viewer), dan is an app admin, eve has an account but isn't
// in the app, and new@example.com has no account yet
const PEOPLE = {
  ann: { role: 'member', email: 'ann@example.com' },
  bob: { role: 'member', email: 'bob@example.com' },
  cat: { role: 'viewer', email: 'cat@example.com' },
  dan: { role: 'admin', email: 'dan@example.com' },
  eve: { role: null, email: 'eve@example.com' },
};
const T0 = Date.UTC(2026, 9, 26, 12);

function setup() {
  const docs = new Map();
  for (const [uid, p] of Object.entries(PEOPLE)) if (p.role) docs.set(`members/${uid}`, { role: p.role, v: 1 });
  const users = Object.entries(PEOPLE).map(([uid, p]) => ({ uid, email: p.email, verified: true }));
  const st = memoryStore({ docs, users, now: () => T0 });
  const bucket = memoryBucket();
  let n = 0;
  const verify = async (/** @type {string} */ t) => {
    if (!PEOPLE[t]) throw new Error('bad token');
    const role = PEOPLE[t].role;
    return { sub: t, email: PEOPLE[t].email, email_verified: true, ...(role ? { g: { _: role } } : {}) };
  };
  const call = async (who, method, path, body) => {
    const init = { method, headers: /** @type {Record<string, string>} */ ({}) };
    if (who) init.headers.Authorization = `Bearer ${who}`;
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const r = await handleSpaces(new Request(`http://localhost${path}`, init), { verify, store: st, bucket, origin: 'http://localhost', now: () => T0, newId: () => `s-test${String(++n).padStart(4, '0')}` });
    return { status: r.status, body: await r.json() };
  };
  return { st, docs, bucket, call };
}

// ann's space with bob editing and cat viewing
async function shared() {
  const s = setup();
  const { body } = await s.call('ann', 'POST', '/api/spaces', { name: 'Team' });
  assert.equal((await s.call('ann', 'POST', `/api/spaces/${body.id}/invite`, { email: 'bob@example.com', role: 'edit' })).body.added, 'bob');
  assert.equal((await s.call('ann', 'POST', `/api/spaces/${body.id}/invite`, { email: 'CAT@example.com ', role: 'view' })).body.added, 'cat');
  return { ...s, sid: body.id, doc: () => s.docs.get(`spaces/${body.id}`) };
}

test('a new space: the caller owns it; viewers and people outside the app make none; names are checked', async () => {
  const { call, docs } = setup();
  const r = await call('ann', 'POST', '/api/spaces', { name: ' Team ' });
  assert.equal(r.status, 201);
  assert.deepEqual(docs.get(`spaces/${r.body.id}`), { name: 'Team', owner: 'ann', members: { ann: 'owner' }, memberIds: ['ann'], emails: { ann: 'ann@example.com' }, invited: {}, updatedAt: T0 });
  assert.equal((await call('cat', 'POST', '/api/spaces', { name: 'x' })).status, 403);
  assert.equal((await call('eve', 'POST', '/api/spaces', { name: 'x' })).status, 403);
  assert.equal((await call(null, 'POST', '/api/spaces', { name: 'x' })).status, 401);
  assert.equal((await call('nobody', 'POST', '/api/spaces', { name: 'x' })).status, 401);
  for (const name of ['', '  ', 'a/b', 'x'.repeat(201), 7]) assert.equal((await call('ann', 'POST', '/api/spaces', { name })).status, 400, String(name));
  assert.equal((await call('ann', 'GET', '/api/spaces')).status, 405);
});

test('wrong origin, no store, unknown paths', async () => {
  const { call } = setup();
  assert.equal((await call('ann', 'GET', '/api/spaces/s-test0001/what')).status, 404);
  const r = await handleSpaces(new Request('http://localhost/api/spaces', { method: 'POST', headers: { Origin: 'https://evil.example' } }), { verify: async () => ({}), store: memoryStore(), origin: 'http://localhost' });
  assert.equal(r.status, 403);
  assert.equal((await handleSpaces(new Request('http://localhost/api/spaces', { method: 'POST' }), {})).status, 503);
});

test('revoked people and those past their access end are refused', async () => {
  const { call, docs } = setup();
  docs.set('revoked/ann', {});
  assert.equal((await call('ann', 'POST', '/api/spaces', { name: 'x' })).status, 403);
  assert.equal(appRole({ sub: 'x', g: { _: 'member' }, x: T0 / 1000 - 1 }, T0), '');
  assert.equal(appRole({ sub: 'x', g: { _: 'member' }, x: T0 / 1000 + 60 }, T0), 'member');
  assert.equal(appRole({ sub: 'x', g: { _: 'owner' } }, T0), '');
});

test('invite someone in the app: they join at once; only the owner invites; checks on email and role', async () => {
  const { call, doc, sid } = await shared();
  assert.deepEqual(doc().members, { ann: 'owner', bob: 'edit', cat: 'view' });
  assert.deepEqual(doc().memberIds, ['ann', 'bob', 'cat']);
  assert.deepEqual(doc().emails, { ann: 'ann@example.com', bob: 'bob@example.com', cat: 'cat@example.com' });
  assert.equal((await call('ann', 'POST', `/api/spaces/${sid}/invite`, { email: 'bob@example.com', role: 'view' })).status, 409, 'already in');
  assert.equal((await call('bob', 'POST', `/api/spaces/${sid}/invite`, { email: 'dan@example.com', role: 'view' })).status, 403, 'editor');
  assert.equal((await call('cat', 'POST', `/api/spaces/${sid}/invite`, { email: 'dan@example.com', role: 'view' })).status, 403, 'viewer');
  assert.equal((await call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'dan@example.com', role: 'view' })).status, 404, 'not a member: no such space');
  assert.equal((await call('ann', 'POST', `/api/spaces/${sid}/invite`, { email: 'not-an-email', role: 'view' })).status, 400);
  assert.equal((await call('ann', 'POST', `/api/spaces/${sid}/invite`, { email: 'dan@example.com', role: 'owner' })).status, 400);
  assert.equal((await call('ann', 'POST', `/api/spaces/${sid}/invite`, { email: 'dan@example.com' })).status, 400);
});

test('someone not in the app: a member may not invite them; an admin brings them in, at once or at first sign-in', async () => {
  const s = setup();
  const own = (await s.call('ann', 'POST', '/api/spaces', { name: 'A' })).body.id;
  assert.equal((await s.call('ann', 'POST', `/api/spaces/${own}/invite`, { email: 'eve@example.com', role: 'edit' })).status, 403);
  assert.equal((await s.call('ann', 'POST', `/api/spaces/${own}/invite`, { email: 'new@example.com', role: 'edit' })).status, 403);
  assert.equal(s.docs.has('members/eve'), false);

  const sid = (await s.call('dan', 'POST', '/api/spaces', { name: 'D' })).body.id;
  // eve has an account: she joins now, as an app member with her own vault
  assert.deepEqual((await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'eve@example.com', role: 'view' })).body, { added: 'eve' });
  assert.deepEqual(s.docs.get('members/eve'), { role: 'member', v: 1 });
  // no account yet: a pending invite, keyed by a hash (no email in a doc id)
  const r = await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'New@Example.com', role: 'edit' });
  const key = await inviteKey('new@example.com');
  assert.deepEqual(r.body, { pending: true, key });
  assert.match(key, /^[0-9a-f]{40}$/);
  assert.deepEqual(s.docs.get(`invites/${key}`), { spaces: { [sid]: { role: 'edit', by: 'dan', at: T0 } } });
  assert.deepEqual(s.docs.get(`spaces/${sid}`).invited, { [key]: { email: 'new@example.com', role: 'edit' } });

  // they sign up with that email: /api/claims takes the invite up, and they come in as an app member
  s.st.users.push({ uid: 'new', email: 'new@example.com', verified: true });
  const claims = await loadClaims({ uid: 'new', token: { email: 'new@example.com', email_verified: true }, admin: s.st, store: s.st });
  assert.deepEqual(claims, { g: { _: 'member' }, v: 1 });
  const sp = s.docs.get(`spaces/${sid}`);
  assert.equal(sp.members.new, 'edit');
  assert.ok(sp.memberIds.includes('new'));
  assert.deepEqual(sp.invited, {});
  assert.equal(s.docs.has(`invites/${key}`), false);
});

test('a pending invite needs a verified email, is taken up once, and skips a closing or gone space', async () => {
  const s = setup();
  const a = (await s.call('dan', 'POST', '/api/spaces', { name: 'A' })).body.id;
  const b = (await s.call('dan', 'POST', '/api/spaces', { name: 'B' })).body.id;
  await s.call('dan', 'POST', `/api/spaces/${a}/invite`, { email: 'new@example.com', role: 'view' });
  await s.call('dan', 'POST', `/api/spaces/${b}/invite`, { email: 'new@example.com', role: 'edit' });
  const key = await inviteKey('new@example.com');
  // unverified: nothing taken, no claims
  assert.equal(await loadClaims({ uid: 'new', token: { email: 'new@example.com', email_verified: false }, admin: s.st, store: s.st }), null);
  assert.ok(s.docs.has(`invites/${key}`));
  s.docs.get(`spaces/${b}`).closing = true;
  assert.equal(await acceptInvites({ uid: 'new', email: 'new@example.com', store: s.st, now: T0 }), 1);
  assert.equal(s.docs.get(`spaces/${a}`).members.new, 'view');
  assert.equal(s.docs.get(`spaces/${b}`).members.new, undefined, 'closing');
  assert.deepEqual(s.docs.get(`spaces/${b}`).invited, {});
  assert.equal(await acceptInvites({ uid: 'new', email: 'new@example.com', store: s.st, now: T0 }), 0, 'once');
  assert.equal(await acceptInvites({ uid: 'new', email: '', store: s.st }), 0);
});

test('take back a pending invite (owner only)', async () => {
  const s = setup();
  const sid = (await s.call('dan', 'POST', '/api/spaces', { name: 'D' })).body.id;
  await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'eve@example.com', role: 'view' });
  await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'new@example.com', role: 'view' });
  const key = await inviteKey('new@example.com');
  assert.equal((await s.call('eve', 'DELETE', `/api/spaces/${sid}/invites/${key}`)).status, 403);
  assert.equal((await s.call('dan', 'DELETE', `/api/spaces/${sid}/invites/nope`)).status, 404);
  assert.equal((await s.call('dan', 'DELETE', `/api/spaces/${sid}/invites/${key}`)).status, 200);
  assert.deepEqual(s.docs.get(`spaces/${sid}`).invited, {});
  assert.deepEqual(s.docs.get(`invites/${key}`).spaces, {});
  assert.equal(await acceptInvites({ uid: 'new', email: 'new@example.com', store: s.st, now: T0 }), 0);
});

test('roles change and people leave or are removed; the owner stays', async () => {
  const { call, doc, sid } = await shared();
  assert.equal((await call('bob', 'PATCH', `/api/spaces/${sid}/members/cat`, { role: 'edit' })).status, 403);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}/members/cat`, { role: 'owner' })).status, 400);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}/members/ann`, { role: 'view' })).status, 400);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}/members/dan`, { role: 'view' })).status, 404);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}/members/cat`, { role: 'edit' })).status, 200);
  assert.equal(doc().members.cat, 'edit');
  assert.equal((await call('bob', 'DELETE', `/api/spaces/${sid}/members/cat`)).status, 403, 'only the owner removes others');
  assert.equal((await call('ann', 'DELETE', `/api/spaces/${sid}/members/ann`)).status, 400, 'owner can’t leave');
  assert.equal((await call('bob', 'DELETE', `/api/spaces/${sid}/members/bob`)).status, 200, 'leave');
  assert.equal((await call('ann', 'DELETE', `/api/spaces/${sid}/members/cat`)).status, 200, 'remove');
  assert.deepEqual(doc().members, { ann: 'owner' });
  assert.deepEqual(doc().memberIds, ['ann']);
  assert.deepEqual(doc().emails, { ann: 'ann@example.com' });
  assert.equal((await call('bob', 'PATCH', `/api/spaces/${sid}`, { name: 'x' })).status, 404, 'gone: looks like no space');
});

test('rename: owner only', async () => {
  const { call, doc, sid } = await shared();
  assert.equal((await call('bob', 'PATCH', `/api/spaces/${sid}`, { name: 'B' })).status, 403);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}`, { name: 'a/b' })).status, 400);
  assert.equal((await call('ann', 'PATCH', `/api/spaces/${sid}`, { name: 'Renamed' })).status, 200);
  assert.equal(doc().name, 'Renamed');
  assert.equal((await call('ann', 'POST', `/api/spaces/${sid}`, { name: 'x' })).status, 405);
});

test('move a note between the vault and a space: both writable; one commit with a bin entry at the source', async () => {
  const { call, docs, sid } = await shared();
  const note = { id: 'n1', path: '', title: 'Plan', body: 'x', links: [], tags: [], aliases: [], updatedAt: T0 - 5, serverAt: new Date(T0 - 5) };
  docs.set('spaces/ann/notes/n1', note);
  docs.set('spaces/cat/notes/c1', { ...note, id: 'c1' });
  assert.equal((await call('ann', 'POST', `/api/spaces/ann/move`, { id: 'n1', to: 's-other00000' })).status, 403, 'not a member there');
  assert.equal((await call('cat', 'POST', `/api/spaces/cat/move`, { id: 'c1', to: sid })).status, 403, 'a viewer there (and in the app)');
  assert.equal((await call('bob', 'POST', `/api/spaces/ann/move`, { id: 'n1', to: sid })).status, 403, 'another person’s vault');
  assert.equal((await call('ann', 'POST', `/api/spaces/ann/move`, { id: 'n1', to: 'ann' })).status, 400);
  assert.equal((await call('ann', 'POST', `/api/spaces/ann/move`, { id: 'a/b', to: sid })).status, 400);
  assert.equal((await call('ann', 'POST', `/api/spaces/ann/move`, { id: 'n9', to: sid })).status, 404);
  assert.equal((await call('ann', 'POST', `/api/spaces/ann/move`, { id: 'n1', to: sid })).status, 200);
  assert.equal(docs.has('spaces/ann/notes/n1'), false);
  const moved = docs.get(`spaces/${sid}/notes/n1`);
  assert.equal(moved.title, 'Plan');
  assert.equal(moved.updatedAt, T0);
  assert.ok(moved.serverAt instanceof Date);
  const bin = docs.get('spaces/ann/bin/notes:n1');
  assert.equal(bin.kind, 'notes');
  assert.equal(bin.data.title, 'Plan');
  assert.equal(bin.deletedAt, T0);
  // and back out again, by an editor into their own vault
  assert.equal((await call('bob', 'POST', `/api/spaces/${sid}/move`, { id: 'n1', to: 'bob' })).status, 200);
  assert.ok(docs.has('spaces/bob/notes/n1'));
  // the target already has a note of that id: refused, nothing lost
  docs.set(`spaces/${sid}/notes/n2`, { ...note, id: 'n2' });
  docs.set('spaces/bob/notes/n2', { ...note, id: 'n2', title: 'Other' });
  assert.equal((await call('bob', 'POST', `/api/spaces/${sid}/move`, { id: 'n2', to: 'bob' })).status, 409);
  assert.ok(docs.has(`spaces/${sid}/notes/n2`));
  assert.equal(docs.get('spaces/bob/notes/n2').title, 'Other');
});

test('move a note with its attachments: records, bytes and bin entries go together; a racing save or an unstored file stops it', async () => {
  const { call, docs, bucket, st, sid } = await shared();
  const note = (id, extra = {}) => ({ id, path: '', title: id, body: 'x', links: [], tags: [], aliases: [], updatedAt: T0 - 5, serverAt: new Date(T0 - 5), ...extra });
  const file = (id, item, extra = {}) => ({ id, name: `${id}.png`, type: 'image/webp', size: 3, state: 'stored', item, thumb: true, updatedAt: T0 - 5, serverAt: new Date(T0 - 5), ...extra });
  const bytes = async k => bucket.put(k, new Blob([k]), { httpMetadata: { contentType: 'image/webp' } });
  docs.set('spaces/ann/notes/n1', note('n1'));
  docs.set('spaces/ann/files/f1', file('f1', 'n1'));
  docs.set('spaces/ann/files/f2', file('f2', 'other'));
  for (const k of ['ann/f1', 'ann/f1.thumb', 'ann/f2', 'ann/f2.thumb']) await bytes(k);
  assert.equal((await call('ann', 'POST', '/api/spaces/ann/move', { id: 'n1', to: sid })).status, 200);
  assert.ok(docs.has(`spaces/${sid}/files/f1`) && !docs.has('spaces/ann/files/f1'), 'the record moved');
  assert.equal(docs.get(`spaces/${sid}/files/f1`).item, 'n1');
  assert.ok(docs.has('spaces/ann/files/f2'), 'another note’s file stays');
  assert.deepEqual([...bucket.objects.keys()].sort(), ['ann/f2', 'ann/f2.thumb', `${sid}/f1`, `${sid}/f1.thumb`]);
  assert.equal(docs.get('spaces/ann/bin/files:f1').kind, 'files');
  assert.equal(docs.get('spaces/ann/bin/notes:n1').kind, 'notes');

  // a file still uploading: refused, nothing moved
  docs.set('spaces/ann/notes/n2', note('n2'));
  docs.set('spaces/ann/files/f3', file('f3', 'n2', { state: 'pending' }));
  assert.equal((await call('ann', 'POST', '/api/spaces/ann/move', { id: 'n2', to: sid })).status, 409);
  assert.ok(docs.has('spaces/ann/notes/n2') && !docs.has(`spaces/${sid}/notes/n2`));
  // its bytes are missing: refused, and no copy is left in the target
  docs.set('spaces/ann/files/f3', file('f3', 'n2'));
  await bytes('ann/f3');
  assert.equal((await call('ann', 'POST', '/api/spaces/ann/move', { id: 'n2', to: sid })).status, 409);
  assert.ok(![...bucket.objects.keys()].some(k => k.startsWith(`${sid}/f3`)), 'the copy of f3 was removed');
  assert.ok(docs.has('spaces/ann/notes/n2'));

  // a save lands between the read and the commit: the move stops, the save is not lost, no stray copies
  docs.set('spaces/ann/notes/n3', note('n3'));
  docs.set('spaces/ann/files/f4', file('f4', 'n3', { thumb: false }));
  await bytes('ann/f4');
  const query = st.query;
  st.query = async (...a) => { st.touch('spaces/ann/notes/n3'); return query(...a); };
  assert.equal((await call('ann', 'POST', '/api/spaces/ann/move', { id: 'n3', to: sid })).status, 409);
  st.query = query;
  assert.ok(docs.has('spaces/ann/notes/n3') && docs.has('spaces/ann/files/f4'));
  assert.ok(!docs.has(`spaces/${sid}/notes/n3`) && ![...bucket.objects.keys()].includes(`${sid}/f4`));
  // without the race it moves
  assert.equal((await call('ann', 'POST', '/api/spaces/ann/move', { id: 'n3', to: sid })).status, 200);
  assert.ok(docs.has(`spaces/${sid}/files/f4`));
});

test('delete a space: owner only, closed to writes first, then in rounds; bytes and pending invites go too', async () => {
  const s = setup();
  const sid = (await s.call('dan', 'POST', '/api/spaces', { name: 'Big' })).body.id;
  await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'bob@example.com', role: 'edit' });
  await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'new@example.com', role: 'view' });
  for (let i = 0; i < 2100; i++) s.docs.set(`spaces/${sid}/notes/n${i}`, { id: `n${i}` });
  s.docs.set(`spaces/${sid}/files/f1`, { id: 'f1' });
  s.docs.set(`spaces/${sid}/bin/notes:n0`, { id: 'notes:n0' });
  s.docs.set('spaces/dan/notes/keep', { id: 'keep' });
  await s.bucket.put(`${sid}/f1`, 'x');
  await s.bucket.put(`${sid}/f1.thumb`, 'x');
  await s.bucket.put('dan/f9', 'x');
  assert.equal((await s.call('bob', 'DELETE', `/api/spaces/${sid}`)).status, 403);
  let r = await s.call('dan', 'DELETE', `/api/spaces/${sid}`);
  assert.deepEqual(r.body, { done: false });
  assert.equal(s.docs.get(`spaces/${sid}`).closing, true);
  // closing: no invites, no moves in, no file writes
  assert.equal((await s.call('dan', 'POST', `/api/spaces/${sid}/invite`, { email: 'cat@example.com', role: 'view' })).status, 409);
  assert.equal((await s.call('dan', 'POST', `/api/spaces/dan/move`, { id: 'keep', to: sid })).status, 403);
  const acc = spaceAccess(s.st);
  assert.equal(await acc({ token: { sub: 'bob', g: { _: 'member' } }, scope: sid, write: true, now: T0 }), false);
  assert.equal(await acc({ token: { sub: 'bob', g: { _: 'member' } }, scope: sid, write: false, now: T0 }), true);
  r = await s.call('dan', 'DELETE', `/api/spaces/${sid}`);
  assert.deepEqual(r.body, { done: true });
  assert.deepEqual([...s.docs.keys()].filter(k => k.startsWith(`spaces/${sid}`)), []);
  assert.ok(s.docs.has('spaces/dan/notes/keep'));
  assert.deepEqual([...s.bucket.objects.keys()], ['dan/f9']);
  assert.deepEqual(s.docs.get(`invites/${await inviteKey('new@example.com')}`).spaces, {});
});

test('files by space membership: owner and editors write, viewers read, others nothing; app role needed', async () => {
  const { st, sid } = await shared();
  const acc = spaceAccess(st);
  const t = (/** @type {string} */ sub, role = 'member') => ({ sub, g: { _: role } });
  const can = (token, scope, write) => acc({ token, scope, write, now: T0 });
  assert.equal(await can(t('ann'), sid, true), true);
  assert.equal(await can(t('bob'), sid, true), true);
  assert.equal(await can(t('cat', 'viewer'), sid, true), false);
  assert.equal(await can(t('cat', 'viewer'), sid, false), true);
  assert.equal(await can(t('dan', 'admin'), sid, false), false, 'not a member');
  assert.equal(await can(t('ann'), 'ann', true), true, 'own vault');
  assert.equal(await can(t('ann'), 'bob', false), false, 'another vault');
  assert.equal(await can(t('ann', 'viewer'), 'ann', true), false, 'app viewer writes nothing');
  assert.equal(await can({ sub: 'ann' }, 'ann', false), false, 'no app role');
  assert.equal(await can(t('ann'), '_', false), false);
});

test('store.js: field paths are quoted; a commit has masks, transforms and preconditions', async () => {
  assert.equal(fieldPath(['members', 'abcXYZ09']), 'members.abcXYZ09');
  assert.equal(fieldPath(['invited', '0af3']), 'invited.`0af3`');
  assert.equal(fieldPath(['emails', 'a-b`c\\']), 'emails.`a-b\\`c\\\\`');
  const realFetch = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return Response.json({}); };
  try {
    const s = restStore({ project: 'demo-x', emulator: { auth: 'a', firestore: 'fs' }, accessToken: async () => 't', getDoc: async () => null });
    await s.write([
      { path: 'spaces/s-x', exists: true, set: [[['members', 'u1'], 'edit']], remove: [['invited', '0af3']], union: [[['memberIds'], ['u1']]], serverTime: [['serverAt']] },
      { path: 'invites/k', delete: true },
    ]);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(sent[0].url, 'http://fs/v1/projects/demo-x/databases/(default)/documents:commit');
  const [w, d] = sent[0].body.writes;
  assert.deepEqual(w.update.fields, { members: { mapValue: { fields: { u1: { stringValue: 'edit' } } } } });
  assert.deepEqual(w.updateMask.fieldPaths, ['members.u1', 'invited.`0af3`']);
  assert.deepEqual(w.updateTransforms, [
    { fieldPath: 'memberIds', appendMissingElements: { values: [{ stringValue: 'u1' }] } },
    { fieldPath: 'serverAt', setToServerValue: 'REQUEST_TIME' },
  ]);
  assert.deepEqual(w.currentDocument, { exists: true });
  assert.equal(d.delete, 'projects/demo-x/databases/(default)/documents/invites/k');
});
