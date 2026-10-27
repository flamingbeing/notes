// No network: fetch is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFirestore, encodeValue, decodeDoc, FirestoreError } from '../lib/firestore.mjs';

const json = (status, body) => ({ ok: status < 300, status, statusText: '', json: async () => body });
const BASE = 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents';

test('encoding: integers stay integers, lists and maps nest, undefined is dropped', () => {
  assert.deepEqual(encodeValue(5), { integerValue: '5' });
  assert.deepEqual(encodeValue(1.5), { doubleValue: 1.5 });
  assert.deepEqual(encodeValue([]), { arrayValue: {} });
  const doc = { name: 'projects/p/databases/(default)/documents/spaces/u/notes/n1', fields: { title: encodeValue('A'), tags: encodeValue(['x']), updatedAt: encodeValue(1760000000000) } };
  assert.deepEqual(decodeDoc(doc), { title: 'A', tags: ['x'], updatedAt: 1760000000000, id: 'n1' });
});

test('a 401 refreshes the token once; a 404 reads as null; the version comes with the document', async () => {
  const tokens = [];
  const fetch = async (url, init) => {
    if (init.headers.Authorization === 'Bearer stale') return json(401, { error: { message: 'expired' } });
    if (url.endsWith('/notes/gone')) return json(404, {});
    return json(200, { name: 'x/notes/n1', updateTime: 'T1', fields: { title: { stringValue: 'A' } } });
  };
  const fs = makeFirestore({ projectId: 'p', fetch, getIdToken: async force => { tokens.push(force); return force ? 'fresh' : 'stale'; } });
  assert.equal(await fs.getDoc(['spaces', 'u', 'notes', 'gone']), null);
  assert.deepEqual(tokens.slice(0, 2), [false, true]);
  assert.deepEqual(await fs.getDoc(['spaces', 'u', 'notes', 'n1']), { title: 'A', id: 'n1', _updateTime: 'T1' });
});

test('a 403 asks for new claims once, then tries again; a second 403 is a clear error', async () => {
  let denied = 0, renewed = 0;
  const fetch = async () => (denied++ < 1 ? json(403, { error: { message: 'Missing or insufficient permissions.' } }) : json(200, { documents: [] }));
  const fs = makeFirestore({ projectId: 'p', fetch, getIdToken: async () => 't', onDenied: async () => { renewed++; } });
  assert.deepEqual(await fs.listCollection(['spaces', 'u', 'notes']), []);
  assert.equal(renewed, 1);
  const deny = makeFirestore({ projectId: 'p', getIdToken: async () => 't', onDenied: async () => { renewed++; }, fetch: async () => json(403, { error: { message: 'no' } }) });
  await assert.rejects(() => deny.listCollection(['spaces', 'u', 'notes']), /refused access/);
  assert.equal(renewed, 2, 'asked once per call, not in a loop');
});

test('lists page by page, with the page size', async () => {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    return url.includes('pageToken=P2') ? json(200, { documents: [{ name: 'a/n2', fields: {} }] }) : json(200, { documents: [{ name: 'a/n1', fields: {} }], nextPageToken: 'P2' });
  };
  const fs = makeFirestore({ projectId: 'p', fetch, getIdToken: async () => 't', pageSize: 2 });
  assert.deepEqual((await fs.listCollection(['spaces', 'u', 'notes'])).map(d => d.id), ['n1', 'n2']);
  assert.ok(urls.every(u => u.startsWith(`${BASE}/spaces/u/notes?`) && new URL(u).searchParams.get('pageSize') === '2'));
});

test('queryContains: spaces whose memberIds hold the person', async () => {
  let body;
  const fetch = async (url, init) => { body = JSON.parse(init.body); return json(200, [{ readTime: 'x' }, { document: { name: 'a/s-abcdefgh12', fields: { name: { stringValue: 'Team' } } } }]); };
  const fs = makeFirestore({ projectId: 'p', fetch, getIdToken: async () => 't' });
  assert.deepEqual(await fs.queryContains('spaces', 'memberIds', 'u1'), [{ name: 'Team', id: 's-abcdefgh12' }]);
  assert.deepEqual(body.structuredQuery.where.fieldFilter, { field: { fieldPath: 'memberIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: 'u1' } });
});

test('commit: stamps serverAt with the request time, escapes ids, and carries preconditions', async () => {
  let call;
  const fetch = async (url, init) => { call = { url, body: JSON.parse(init.body) }; return json(200, { writeResults: [] }); };
  const fs = makeFirestore({ projectId: 'p', fetch, getIdToken: async () => 't' });
  await fs.commit([
    { delete: ['spaces', 'u', 'notes', 'n1'], updateTime: 'T1' },
    { set: ['spaces', 'u', 'bin', 'notes:n1'], data: { id: 'notes:n1', deletedAt: 5 }, mustNotExist: true },
    { set: ['spaces', 'u', 'notes', 'n2'], data: { title: 'B' }, updateTime: 'T2' },
  ]);
  assert.equal(call.url, `${BASE}:commit`);
  const [del, bin, upd] = call.body.writes;
  assert.deepEqual(del, { delete: 'projects/p/databases/(default)/documents/spaces/u/notes/n1', currentDocument: { updateTime: 'T1' } });
  assert.equal(bin.update.name, 'projects/p/databases/(default)/documents/spaces/u/bin/notes%3An1');
  assert.deepEqual(bin.updateTransforms, [{ fieldPath: 'serverAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.deepEqual(bin.currentDocument, { exists: false });
  assert.deepEqual(upd.currentDocument, { updateTime: 'T2' });
});

test('a failed precondition keeps Google\'s status name', async () => {
  const fs = makeFirestore({ projectId: 'p', getIdToken: async () => 't', fetch: async () => json(400, { error: { message: 'too late', status: 'FAILED_PRECONDITION' } }) });
  await assert.rejects(() => fs.commit([{ set: ['a', 'b'], data: {} }]), e => e instanceof FirestoreError && e.code === 'FAILED_PRECONDITION' && e.status === 400);
});
