// /api/spaces: shared spaces, written only here (the rules let devices read a space doc, never write it). A space is
// spaces/s-<random> = { name, owner, members: { uid: owner | edit | view }, memberIds, emails: { uid: email },
// invited: { <key>: { email, role } }, closing? }; its notes, files and bin live under it as in a person's vault.
//
//   POST   /api/spaces                         { name }          a new space, the caller its owner -> { id }
//   PATCH  /api/spaces/<sid>                   { name }          owner: rename
//   DELETE /api/spaces/<sid>                                     owner: notes, files, bin, the bytes, then the space
//                                                                -> { done } (false: call again, a big space goes in rounds)
//   POST   /api/spaces/<sid>/invite            { email, role }   owner: add by Google email (role edit | view)
//                                                                -> { added: uid } or { pending: true }
//   PATCH  /api/spaces/<sid>/members/<uid>     { role }          owner: change someone's role
//   DELETE /api/spaces/<sid>/members/<uid>                       owner: remove someone; anyone else: leave (own uid)
//   DELETE /api/spaces/<sid>/invites/<key>                       owner: take back an invite not yet taken up
//   POST   /api/spaces/<from>/move             { id, to }        a note from one space (or the caller's vault, its uid)
//                                                                to another, in one commit; the caller writes both. Its
//                                                                attachments (files whose item is the note) go with it,
//                                                                bytes too; 409 if the note changed since it was read
//
// Invites: an email with an account already in the app joins at once. Anyone else joins at their first sign-in with
// that (verified) email, when /api/claims runs acceptInvites (members.js): invites/<key> = { spaces: { sid: { role,
// by, at } } }, key = sha-256 of the email (no email in a doc id). Only an app admin may invite someone who isn't in
// the app yet (they come in as an app member, with their own vault); members invite people already in it.
//
// handleSpaces(request, { verify, store, bucket, origin, now, newId }) is pure: store is worker/store.js's shape (an
// in-memory one in the unit tests), bucket the R2 binding (list, delete). Answers { error } with 400/401/403/404/405/409/503.

export const SPACE_ID = /^s-[A-Za-z0-9]{8,40}$/;
const PATH = /^\/api\/spaces(?:\/([A-Za-z0-9_-]{1,128})(?:\/(invite|move|members|invites)(?:\/([A-Za-z0-9_-]{1,128}))?)?)?$/;
const APP_ROLES = ['admin', 'member', 'viewer'], APP_WRITERS = ['admin', 'member'];
const ROLES = ['edit', 'view'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,63}$/;
const NOTE_ID = /^[A-Za-z0-9_:-]{1,128}$/;
const COLLS = ['notes', 'files', 'bin'];
const MOVE_FILES = 40;   // attachments that move with a note (one commit holds at most 500 writes)
const ROUND = 200;   // docs per delete round (a Worker request makes at most 50 calls on the Free plan)

/** @param {string} email -> the invite key: hex sha-256 of the email, lower case */
export async function inviteKey(email) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(email).trim().toLowerCase()));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
const randomId = () => 's-' + [...crypto.getRandomValues(new Uint8Array(20))].map(b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('');

/** the caller's app role ('' = none or past its access end), as the rules' can() */
export function appRole(token, now = Date.now()) {
  if (token.x != null && !(now < Number(token.x) * 1000)) return '';
  const r = token.g && typeof token.g === 'object' ? token.g._ : '';
  return APP_ROLES.includes(r) ? r : '';
}

/** Who may read or write a space's files (worker/files.js access): the vault's own person, or a space member (edit
 * and owner write), with an app role; a closing space takes no new writes. */
export function spaceAccess(store) {
  return async ({ token, scope, write, now = Date.now() }) => {
    const role = appRole(token, now);
    if (!role || (write && !APP_WRITERS.includes(role))) return false;
    if (scope === token.sub) return true;
    if (!SPACE_ID.test(scope)) return false;
    const s = await store.getDoc(`spaces/${scope}`);
    const mine = s?.members?.[token.sub];
    return !!mine && (!write || ((mine === 'owner' || mine === 'edit') && !s.closing));
  };
}

// At sign-in (/api/claims, members.js): the invites waiting for this verified email join their spaces; the invites go.
// -> the number of spaces joined
// newMember: the person has no role doc yet; one joining makes it (role member) in the same commit, so an invite is
// never used up without the app role that lets them in
export async function acceptInvites({ uid, email, store, now = Date.now(), newMember = false }) {
  if (!email) return 0;
  const key = await inviteKey(email);
  const inv = await store.getDoc(`invites/${key}`);
  const waiting = Object.entries(inv?.spaces || {});
  if (!waiting.length) return 0;
  const ops = [], at = new Date(now);
  let joined = 0;
  for (const [sid, v] of waiting) {
    const s = SPACE_ID.test(sid) ? await store.getDoc(`spaces/${sid}`) : null;
    if (!s) continue;
    const op = { path: `spaces/${sid}`, exists: true, remove: [['invited', key]], set: /** @type {[string[], unknown][]} */ ([]), union: /** @type {[string[], unknown[]][]} */ ([]) };
    if (!s.closing && !s.members?.[uid] && ROLES.includes(v?.role)) {
      op.set.push([['members', uid], v.role], [['emails', uid], email.toLowerCase()], [['updatedAt'], at.getTime()]);
      op.union.push([['memberIds'], [uid]]);
      joined++;
    }
    ops.push(op);
  }
  ops.push({ path: `invites/${key}`, delete: true });
  if (newMember && joined) ops.push({ path: `members/${uid}`, exists: false, set: [[['role'], 'member'], [['v'], 1]] });
  await store.write(ops);
  return joined;
}

export async function handleSpaces(request, { verify, store, bucket = null, origin, now = Date.now, newId = randomId } = {}) {
  const url = new URL(request.url), m = url.pathname.match(PATH);
  if (!m) return json({ error: 'Not found.' }, 404);
  if (!store || typeof verify !== 'function') return json({ error: 'Spaces are not set up yet.' }, 503);
  const from = request.headers.get('Origin');
  if (origin && from && from !== origin) return json({ error: 'Wrong origin.' }, 403);
  const idToken = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/)?.[1];
  if (!idToken) return json({ error: 'Sign in first.' }, 401);
  let token;
  try { token = await verify(idToken); } catch (e) { return json({ error: 'Sign in again.', why: e?.message }, 401); }
  const me = token.sub, role = appRole(token, now());
  if (!role || await store.getDoc(`revoked/${me}`)) return json({ error: 'No access.' }, 403);
  const writer = APP_WRITERS.includes(role);
  /** @type {any} */
  let body = {};
  if (request.method === 'POST' || request.method === 'PATCH') {
    try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Send JSON.' }, 400);
  }
  const [, sid, sub, arg] = m;
  const method = request.method, at = now();
  const nameOk = (/** @type {unknown} */ n) => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 200 && !n.includes('/');

  try {
    if (!sid) {
      if (method !== 'POST') return json({ error: 'POST only.' }, 405);
      if (!writer) return json({ error: 'Viewers make no spaces.' }, 403);
      if (!nameOk(body.name)) return json({ error: 'A name, at most 200 letters, without "/".' }, 400);
      const id = newId(), email = String(token.email || '').toLowerCase();
      await store.write([{ path: `spaces/${id}`, exists: false, set: [[['name'], body.name.trim()], [['owner'], me], [['members'], { [me]: 'owner' }],
        [['memberIds'], [me]], [['emails'], { [me]: email }], [['invited'], {}], [['updatedAt'], at]] }]);
      return json({ id }, 201);
    }

    // a note moves out of a vault (the caller's own uid) or a space
    if (sub === 'move') {
      if (method !== 'POST') return json({ error: 'POST only.' }, 405);
      const to = String(body.to || ''), id = String(body.id || '');
      if (!NOTE_ID.test(id) || !(to === me || SPACE_ID.test(to)) || to === sid) return json({ error: 'Which note, and where to?' }, 400);
      if (!writer || !(await writes(sid)) || !(await writes(to))) return json({ error: 'You can’t change both spaces.' }, 403);
      // the note as read now: its source delete fails if it changed after this read (a save racing the move is not lost)
      const got = await store.getDocT(`spaces/${sid}/notes/${id}`);
      if (!got) return json({ error: 'No such note.' }, 404);
      const { data: note, updateTime } = got;
      if (await store.getDoc(`spaces/${to}/notes/${id}`)) return json({ error: 'That space already has a note with this id.' }, 409);
      // its attachments (file records whose item is this note) travel with it, bytes included
      const files = (await store.query(`spaces/${sid}`, 'files', 'item', id, MOVE_FILES + 1));
      if (files.length > MOVE_FILES) return json({ error: `A note can move with up to ${MOVE_FILES} attachments.` }, 413);
      if (files.some(f => f.data.state !== 'stored')) return json({ error: 'Its attachments are still uploading; try again when they have finished.' }, 409);
      for (const f of files) if (await store.getDoc(`spaces/${to}/files/${f.id}`)) return json({ error: 'That space already has a file with this id.' }, 409);
      if (files.length && !bucket) return json({ error: 'Files are not set up yet.' }, 503);
      // bytes first (copies; the source's stay until the records have moved), so a failed copy leaves everything where it was
      const keys = files.flatMap(f => (f.data.thumb ? [f.id, f.id + '.thumb'] : [f.id]));
      const undo = () => bucket?.delete(keys.map(k => `${to}/${k}`)).catch(() => {});
      for (const k of keys) {
        const o = await bucket.get(`${sid}/${k}`);
        if (!o) { await undo(); return json({ error: 'An attachment’s file is missing; it can’t move.' }, 409); }
        try { await bucket.put(`${to}/${k}`, o.body, { httpMetadata: o.httpMetadata, customMetadata: o.customMetadata }); } catch (e) { await undo(); throw e; }
      }
      const { serverAt, ...keep } = note;
      const bin = (/** @type {string} */ coll, /** @type {string} */ key, /** @type {any} */ data) => ({ path: `spaces/${sid}/bin/${coll}:${key}`, set: [[['id'], `${coll}:${key}`], [['kind'], coll], [['data'], data],
        [['deletedAt'], Math.max(at, Number(data.updatedAt) + 1 || 0)], [['updatedAt'], at]], serverTime: [['serverAt']] });
      try {
        await store.write([
          { path: `spaces/${to}/notes/${id}`, exists: false, set: [...Object.entries(keep).map(([k, v]) => /** @type {[string[], unknown]} */ ([[k], v])), [['updatedAt'], at]], serverTime: [['serverAt']] },
          { path: `spaces/${sid}/notes/${id}`, delete: true, updateTime },
          // the bin entry a delete writes (cloud.js onCommit), so the source's other devices drop the note as for a delete
          bin('notes', id, keep),
          ...files.flatMap(({ id: fid, data }) => {
            const { serverAt: _s, ...rec } = data;
            return [
              { path: `spaces/${to}/files/${fid}`, exists: false, set: [...Object.entries(rec).map(([k, v]) => /** @type {[string[], unknown]} */ ([[k], v])), [['updatedAt'], at]], serverTime: [['serverAt']] },
              { path: `spaces/${sid}/files/${fid}`, delete: true },
              bin('files', fid, rec),
            ];
          }),
        ]);
      } catch (e) {
        // the copies in the target are of no use now
        await undo();
        if (/** @type {any} */ (e)?.status === 400 || /** @type {any} */ (e)?.status === 409) return json({ error: 'The note changed while it was moving; nothing moved. Try again.' }, 409);
        throw e;
      }
      if (keys.length) await bucket.delete(keys.map(k => `${sid}/${k}`)).catch(() => {});
      return json({ ok: true });
    }

    if (!SPACE_ID.test(sid)) return json({ error: 'Not found.' }, 404);
    const space = await store.getDoc(`spaces/${sid}`);
    const mine = space?.members?.[me];
    if (!mine) return json({ error: 'Not found.' }, 404);   // a space you aren't in looks like no space
    const owner = mine === 'owner';
    const ownerOnly = () => (owner && writer ? null : json({ error: 'Only the space’s owner can do that.' }, 403));
    const doc = `spaces/${sid}`;

    if (!sub) {
      if (method === 'PATCH') {
        const no = ownerOnly(); if (no) return no;
        if (!nameOk(body.name)) return json({ error: 'A name, at most 200 letters, without "/".' }, 400);
        await store.write([{ path: doc, exists: true, set: [[['name'], body.name.trim()], [['updatedAt'], at]] }]);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        const no = ownerOnly(); if (no) return no;
        return json({ done: await close(sid, space) });
      }
      return json({ error: 'PATCH or DELETE.' }, 405);
    }
    if (space.closing) return json({ error: 'This space is being deleted.' }, 409);

    if (sub === 'invite') {
      if (method !== 'POST') return json({ error: 'POST only.' }, 405);
      const no = ownerOnly(); if (no) return no;
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 254) return json({ error: 'That doesn’t look like an email address.' }, 400);
      if (!ROLES.includes(body.role)) return json({ error: 'Role edit or view.' }, 400);
      const user = await store.userByEmail(email);
      const inApp = user?.verified ? await store.getDoc(`members/${user.uid}`) : null;
      if (user?.verified && space.members[user.uid]) return json({ error: 'Already in this space.' }, 409);
      if (!inApp && role !== 'admin') return json({ error: 'They aren’t in the app yet; only an admin can invite them.' }, 403);
      if (user?.verified && inApp) {
        await store.write([{ path: doc, exists: true, set: [[['members', user.uid], body.role], [['emails', user.uid], email], [['updatedAt'], at]], union: [[['memberIds'], [user.uid]]] }]);
        return json({ added: user.uid });
      }
      if (user?.verified) {
        // in Firebase but not in the app: an admin brings them in as a member, with this space
        await store.write([
          { path: `members/${user.uid}`, exists: false, set: [[['role'], 'member'], [['v'], 1]] },
          { path: doc, exists: true, set: [[['members', user.uid], body.role], [['emails', user.uid], email], [['updatedAt'], at]], union: [[['memberIds'], [user.uid]]] },
        ]);
        return json({ added: user.uid });
      }
      const key = await inviteKey(email);
      await store.write([
        { path: `invites/${key}`, set: [[['spaces', sid], { role: body.role, by: me, at }]] },
        { path: doc, exists: true, set: [[['invited', key], { email, role: body.role }], [['updatedAt'], at]] },
      ]);
      return json({ pending: true, key });
    }

    if (sub === 'invites') {
      if (method !== 'DELETE' || !arg) return json({ error: 'DELETE only.' }, 405);
      const no = ownerOnly(); if (no) return no;
      if (!space.invited?.[arg]) return json({ error: 'No such invite.' }, 404);
      await store.write([
        { path: doc, exists: true, remove: [['invited', arg]], set: [[['updatedAt'], at]] },
        { path: `invites/${arg}`, remove: [['spaces', sid]] },
      ]);
      return json({ ok: true });
    }

    if (sub === 'members') {
      if (!arg || !space.members[arg]) return json({ error: 'Not a member.' }, 404);
      if (method === 'PATCH') {
        const no = ownerOnly(); if (no) return no;
        if (arg === me) return json({ error: 'The owner stays the owner.' }, 400);
        if (!ROLES.includes(body.role)) return json({ error: 'Role edit or view.' }, 400);
        await store.write([{ path: doc, exists: true, set: [[['members', arg], body.role], [['updatedAt'], at]] }]);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        if (arg === space.owner) return json({ error: 'The owner can’t leave; delete the space instead.' }, 400);
        if (arg !== me) { const no = ownerOnly(); if (no) return no; }
        await store.write([{ path: doc, exists: true, remove: [['members', arg], ['emails', arg]], pull: [[['memberIds'], [arg]]], set: [[['updatedAt'], at]] }]);
        return json({ ok: true });
      }
      return json({ error: 'PATCH or DELETE.' }, 405);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    const status = /** @type {any} */ (e)?.status;
    if (status === 409 || status === 400) return json({ error: 'Someone changed that at the same time; try again.' }, 409);
    console.error('spaces failed', /** @type {any} */ (e)?.message);
    return json({ error: 'Couldn’t do that. Try again.' }, 500);
  }

  // the caller may write notes there: their vault, or a space they own or edit that isn't closing
  async function writes(/** @type {string} */ s) {
    if (s === me) return true;
    if (!SPACE_ID.test(s)) return false;
    const d = await store.getDoc(`spaces/${s}`), r = d?.members?.[me];
    return (r === 'owner' || r === 'edit') && !d.closing;
  }
  // a space deleted: closed to writes first, then its notes, files and bin, the bytes, the invites, the doc
  async function close(/** @type {string} */ s, /** @type {any} */ space) {
    if (!space.closing) await store.write([{ path: `spaces/${s}`, exists: true, set: [[['closing'], true], [['updatedAt'], now()]] }]);
    let rounds = 0;
    for (const coll of COLLS) {
      for (;;) {
        const ids = await store.listIds(`spaces/${s}/${coll}`, ROUND);
        if (!ids.length) break;
        await store.write(ids.map((/** @type {string} */ id) => ({ path: `spaces/${s}/${coll}/${id}`, delete: true })));
        if (++rounds >= 10) return false;
      }
    }
    if (bucket) {
      const page = await bucket.list({ prefix: `${s}/`, limit: 1000 });
      if (page.objects.length) {
        await bucket.delete(page.objects.map((/** @type {{ key: string }} */ o) => o.key));
        if (page.truncated) return false;
      }
    }
    const pending = Object.keys(space.invited || {});
    await store.write([...pending.map(k => ({ path: `invites/${k}`, remove: [['spaces', s]] })), { path: `spaces/${s}`, delete: true }]);
    return true;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
