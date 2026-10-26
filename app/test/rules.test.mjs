// The app's rules in the Firestore emulator: the rules kit's load check plus the app's own cases (every app role ×
// every collection, in a person's vault and in a shared space).
//   firebase emulators:exec --only firestore --project demo-notes "node --test app/test/rules.test.mjs"
// (from the repo root, after setup-tools or with .devkit/ copied from app-devkit)
// The kit's generic per-collection cases assume one path for every role; a vault is per person, so the cases are here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suite, token, toValue } from '../../.devkit/rules/suite.mjs';

const PROJECT = 'demo-notes';
const emu = suite({
  project: PROJECT,
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  roles: ['admin', 'member', 'viewer'],
  collections: [],
});

const ROLES = ['admin', 'member', 'viewer'];
const as = (role, uid = `u-${role}`) => emu.as(uid, { g: { _: role }, v: 1 });
const at = { serverAt: true };
const note = (extra = {}) => ({ path: 'work', title: 'A note', body: 'Text with [[B]] #tag', links: ['b'], tags: ['tag'], aliases: [], updatedAt: 1, ...extra });
const SPACE = 's-abcdefgh12';

// a list query with array-contains (the kit's client has == only)
async function containsQuery(uid, role, coll, field, value) {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const r = await fetch(`http://${host}/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token(uid, { g: { _: role }, v: 1 }, PROJECT)}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'ARRAY_CONTAINS', value: toValue(value) } } } }),
  });
  if (r.status >= 300 && process.env.RULES_DEBUG) console.error(await r.text());
  return r.status < 300;
}

test('people read their own role doc, not others’; only admins write role docs', async () => {
  await emu.clear();
  await emu.seed('members/u-member', { role: 'member', v: 1 });
  await emu.seed('members/u-other', { role: 'member', v: 1 });
  assert.equal((await as('member').get('members/u-member')).ok, true);
  assert.equal((await emu.as('u-new', {}).get('members/u-new')).ok, true, 'no role yet: may still read (absent) own doc');
  assert.equal((await as('member').get('members/u-other')).ok, false);
  assert.equal((await as('member').set('members/u-member', { role: 'admin', v: 2 })).ok, false, 'no self-promotion');
  assert.equal((await as('admin').set('members/u-other', { role: 'viewer', v: 2 })).ok, true);
  assert.equal((await as('admin').set('members/u-other', { role: 'owner', v: 3 })).ok, false, 'unknown role');
});

test('vault notes: each person reads their own vault; admins and members write it; nobody else gets in', async () => {
  await emu.clear();
  for (const role of ROLES) {
    const mine = `spaces/u-${role}/notes/n1`, writes = role !== 'viewer';
    await emu.seed(mine, note());
    assert.equal((await as(role).get(mine)).ok, true, `${role} reads their vault`);
    assert.equal((await as(role).list(`spaces/u-${role}/notes`)).ok, true, `${role} lists their vault`);
    assert.equal((await as(role).set(`spaces/u-${role}/notes/n2`, note(), at)).ok, writes, `${role} writes their vault`);
    assert.equal((await as(role).set(mine, note({ body: 'changed' }), at)).ok, writes, `${role} edits`);
    assert.equal((await as(role).delete(mine)).ok, writes, `${role} deletes`);
    // someone else's vault, whatever the role
    await emu.seed('spaces/u-victim/notes/v1', note());
    assert.equal((await as(role).get('spaces/u-victim/notes/v1')).ok, false, `${role} reads another vault`);
    assert.equal((await as(role).list('spaces/u-victim/notes')).ok, false, `${role} lists another vault`);
    assert.equal((await as(role).set('spaces/u-victim/notes/v2', note(), at)).ok, false, `${role} writes another vault`);
    assert.equal((await as(role).delete('spaces/u-victim/notes/v1')).ok, false, `${role} deletes in another vault`);
  }
  await emu.seed('spaces/u-none/notes/n1', note());
  assert.equal((await emu.as('u-none', { v: 1 }).get('spaces/u-none/notes/n1')).ok, false, 'no app role: not even their own vault');
  assert.equal((await emu.as('u-none', { v: 1 }).set('spaces/u-none/notes/n2', note(), at)).ok, false);
  assert.equal((await emu.anon().get('spaces/u-none/notes/n1')).ok, false, 'signed out');
});

test('notes: known fields only, in their shapes; title required; stamped (a body over 1 MiB the server itself refuses)', async () => {
  await emu.clear();
  const put = data => as('member').set('spaces/u-member/notes/n', data, at);
  assert.equal((await put(note())).ok, true);
  assert.equal((await put(note({ daily: '2026-10-26', _edits: { body: { by: 'Sam', device: 'Phone', at: 1 } } }))).ok, true, 'daily and _edits');
  assert.equal((await put({ title: 'Bare', body: '', updatedAt: 1 })).ok, true, 'path, links, tags and aliases optional');
  assert.equal((await put(note({ title: '' }))).ok, false, 'a title');
  assert.equal((await put(note({ title: 'x'.repeat(301) }))).ok, false, 'title at most 300');
  assert.equal((await put(note({ body: 5 }))).ok, false, 'body is text');
  assert.equal((await put(note({ owner: 'me' }))).ok, false, 'no other fields');
  assert.equal((await put(note({ links: 'b' }))).ok, false, 'links is a list');
  assert.equal((await put(note({ tags: 'tag' }))).ok, false, 'tags is a list');
  assert.equal((await put(note({ daily: 'today' }))).ok, false, 'daily is a date');
  assert.equal((await put(note({ _edits: 'x' }))).ok, false, '_edits is a map');
  assert.equal((await put(note({ updatedAt: 'now' }))).ok, false, 'updatedAt is a number');
  assert.equal((await as('member').set('spaces/u-member/notes/m', note())).ok, false, 'unstamped');
});

test('shared space notes: every space role × app role; non-members denied', async () => {
  await emu.clear();
  const members = { 'u-owner': 'owner', 'u-edit': 'edit', 'u-view': 'view' };
  await emu.seed(`spaces/${SPACE}`, { name: 'Team', owner: 'u-owner', members, memberIds: Object.keys(members) });
  await emu.seed(`spaces/${SPACE}/notes/n1`, note());
  for (const [uid, sr] of Object.entries(members)) for (const role of ROLES) {
    const who = `${sr} in the space, ${role} in the app`, writes = sr !== 'view' && role !== 'viewer';
    assert.equal((await as(role, uid).get(`spaces/${SPACE}/notes/n1`)).ok, true, `${who} reads`);
    assert.equal((await as(role, uid).list(`spaces/${SPACE}/notes`)).ok, true, `${who} lists`);
    assert.equal((await as(role, uid).set(`spaces/${SPACE}/notes/n-${uid}-${role}`, note(), at)).ok, writes, `${who} writes`);
  }
  for (const role of ROLES) {
    assert.equal((await as(role, 'u-out').get(`spaces/${SPACE}/notes/n1`)).ok, false, `non-member ${role} reads`);
    assert.equal((await as(role, 'u-out').list(`spaces/${SPACE}/notes`)).ok, false, `non-member ${role} lists`);
    assert.equal((await as(role, 'u-out').set(`spaces/${SPACE}/notes/n2`, note(), at)).ok, false, `non-member ${role} writes`);
    assert.equal((await as(role, 'u-out').delete(`spaces/${SPACE}/notes/n1`)).ok, false, `non-member ${role} deletes`);
  }
  assert.equal((await as('member', 'u-view').delete(`spaces/${SPACE}/notes/n1`)).ok, false, 'a viewer of the space cannot delete');
  assert.equal((await as('member', 'u-edit').delete(`spaces/${SPACE}/notes/n1`)).ok, true, 'an editor can');
  assert.equal((await as('member', 'u-x').get('spaces/s-nospace1234/notes/n1')).ok, false, 'a space with no doc: nobody');
});

test('space docs: made by their owner alone; the owner changes them; a member may only leave', async () => {
  await emu.clear();
  const own = { name: 'Team', owner: 'u-member', members: { 'u-member': 'owner' }, memberIds: ['u-member'] };
  const mk = (data, id = SPACE) => as('member').create(`spaces/${id}`, data);
  assert.equal((await mk({ ...own, members: { 'u-member': 'owner', 'u-x': 'edit' }, memberIds: ['u-member', 'u-x'] })).ok, false, 'only themselves at first');
  assert.equal((await mk({ ...own, owner: 'u-x', members: { 'u-x': 'owner' }, memberIds: ['u-x'] })).ok, false, 'not for someone else');
  assert.equal((await mk({ ...own, memberIds: [] })).ok, false, 'memberIds matches members');
  assert.equal((await mk({ ...own, name: '' })).ok, false, 'a name');
  assert.equal((await mk({ ...own, extra: 1 })).ok, false, 'known fields only');
  assert.equal((await mk(own, 'u-victim')).ok, false, 'a space id never looks like a uid (a vault)');
  assert.equal((await mk(own, 's-short')).ok, false, 'space ids are s- and 8 to 40 letters or digits');
  assert.equal((await as('viewer', 'u-member').create(`spaces/${SPACE}`, own)).ok, false, 'app viewers make no spaces');
  assert.equal((await mk(own)).ok, true);
  assert.equal((await as('member').get(`spaces/${SPACE}`)).ok, true, 'a member reads it');
  assert.equal((await as('member', 'u-x').get(`spaces/${SPACE}`)).ok, false, 'a non-member does not');
  assert.equal(await containsQuery('u-member', 'member', 'spaces', 'memberIds', 'u-member'), true, 'my spaces: a memberIds query');
  assert.equal(await containsQuery('u-member', 'member', 'spaces', 'memberIds', 'u-x'), false, 'not someone else’s spaces');
  // the owner adds people and changes roles; the owner stays
  const three = { ...own, members: { 'u-member': 'owner', 'u-edit': 'edit', 'u-view': 'view' }, memberIds: ['u-member', 'u-edit', 'u-view'] };
  assert.equal((await as('member').update(`spaces/${SPACE}`, { ...three, members: { ...three.members, 'u-edit': 'boss' } })).ok, false, 'known roles only');
  assert.equal((await as('member').update(`spaces/${SPACE}`, { ...three, memberIds: ['u-member'] })).ok, false, 'memberIds matches');
  assert.equal((await as('member').update(`spaces/${SPACE}`, three)).ok, true, 'the owner invites');
  assert.equal((await as('member').update(`spaces/${SPACE}`, { ...three, owner: 'u-edit', members: { ...three.members, 'u-edit': 'owner' } })).ok, false, 'the owner stays');
  assert.equal((await as('member', 'u-edit').update(`spaces/${SPACE}`, { ...three, members: { ...three.members, 'u-new': 'edit' }, memberIds: [...three.memberIds, 'u-new'] })).ok, false, 'an editor invites nobody');
  assert.equal((await as('member', 'u-edit').update(`spaces/${SPACE}`, { ...three, name: 'Mine now' })).ok, false, 'nor renames it');
  assert.equal((await as('member', 'u-edit').update(`spaces/${SPACE}`, { ...three, members: { 'u-member': 'owner', 'u-edit': 'edit' }, memberIds: ['u-member', 'u-edit'] })).ok, false, 'nor removes others');
  assert.equal((await as('member', 'u-edit').delete(`spaces/${SPACE}`)).ok, false, 'nor deletes it');
  assert.equal((await as('viewer', 'u-view').update(`spaces/${SPACE}`, { ...three, members: { 'u-member': 'owner', 'u-edit': 'edit' }, memberIds: ['u-member', 'u-edit'] })).ok, true, 'a member leaves');
  assert.equal((await as('member', 'u-x').update(`spaces/${SPACE}`, three)).ok, false, 'a non-member changes nothing');
  assert.equal((await as('member').delete(`spaces/${SPACE}`)).ok, true, 'the owner deletes it');
});

test('files: the record of a photo or file in a vault or space; known fields only, in their shapes', async () => {
  await emu.clear();
  const ok = { name: 'a.webp', type: 'image/webp', size: 10, w: 4, h: 3, thumb: true, taken: 5, state: 'local', item: 'n1', updatedAt: 1 };
  const put = data => as('member').set('spaces/u-member/files/f', data, at);
  assert.equal((await put(ok)).ok, true);
  const { item, ...loose } = ok;
  assert.equal((await put(loose)).ok, true, 'on a note or on none');
  assert.equal((await put({ ...ok, state: 'stored' })).ok, true);
  assert.equal((await as('viewer').set('spaces/u-viewer/files/f', ok, at)).ok, false, 'viewers only read');
  assert.equal((await as('viewer').get('spaces/u-viewer/files/f')).ok, true);
  assert.equal((await as('member').set('spaces/u-other/files/f', ok, at)).ok, false, 'not in another vault');
  assert.equal((await put({ ...ok, place: { lat: 1, lng: 2 } })).ok, false, 'the place is never kept here');
  assert.equal((await put({ ...ok, state: 'gone' })).ok, false);
  assert.equal((await put({ ...ok, item: '' })).ok, false, 'an item, if any, is named');
  assert.equal((await put({ ...ok, name: '' })).ok, false);
  assert.equal((await put({ ...ok, size: 1.5 })).ok, false);
  assert.equal((await put({ ...ok, thumb: 'yes' })).ok, false);
  assert.equal((await as('member').set('spaces/u-member/files/g', ok)).ok, false, 'unstamped');
});

test('account options: one doc per person, in their own vault, only the allowed fields', async () => {
  await emu.clear();
  const mine = { itemCount: true, updatedAt: 1 };
  for (const role of ROLES) {
    assert.equal((await as(role).set(`spaces/u-${role}/settings/u-${role}`, mine, at)).ok, true, `${role} saves their own`);
    assert.equal((await as(role).get(`spaces/u-${role}/settings/u-${role}`)).ok, true);
    assert.equal((await as(role).list(`spaces/u-${role}/settings`)).ok, true, `${role} lists their own`);
  }
  assert.equal((await as('member').set('spaces/u-member/settings/u-admin', mine, at)).ok, false, 'only the doc named by their uid');
  assert.equal((await as('member').get('spaces/u-admin/settings/u-admin')).ok, false, 'not someone else’s');
  assert.equal((await as('member').set('spaces/u-admin/settings/u-member', mine, at)).ok, false, 'not in someone else’s vault');
  assert.equal((await as('member').set(`spaces/${SPACE}/settings/u-member`, mine, at)).ok, false, 'not in a shared space');
  assert.equal((await emu.as('u-new', {}).set('spaces/u-new/settings/u-new', mine, at)).ok, false, 'no role, no access');
  assert.equal((await as('member').set('spaces/u-member/settings/u-member', mine)).ok, false, 'unstamped');
  assert.equal((await as('member').set('spaces/u-member/settings/u-member', { ...mine, other: 1 }, at)).ok, false, 'an option the app did not list');
  assert.equal((await as('member').set('spaces/u-member/settings/u-member', { itemCount: 'yes', updatedAt: 1 }, at)).ok, false, 'wrong type');
  assert.equal((await as('member').set('spaces/u-member/settings/u-member', { itemCount: null, profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
});

test('bin entries: writers stamp them in their vault; viewers only read; nobody else', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'notes', data: { title: 'ok' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/u-viewer/bin/notes:a', entry, at)).ok, false);
  assert.equal((await as('member').set('spaces/u-member/bin/notes:a', entry, at)).ok, true);
  assert.equal((await as('member').get('spaces/u-member/bin/notes:a')).ok, true);
  assert.equal((await as('admin').get('spaces/u-member/bin/notes:a')).ok, false, 'not someone else’s bin');
  assert.equal((await as('member').set('spaces/u-member/bin/notes:b', entry)).ok, false, 'unstamped');
});
