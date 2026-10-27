// Shared spaces on the page: the list of spaces the person is in (a live Firestore query on memberIds, kept per
// account on this device so the switcher shows at once, offline too), and the Worker's /api/spaces calls (only the
// Worker writes a space doc, decision 0010). cloud.js opens one space at a time; this file knows nothing of notes.
//
// spacesOf({ sdk, uid, onList }) -> { list(), stop() }
//   onList(spaces, { removed, fromServer }): spaces [{ id, name, owner, role, members, emails, invited }] sorted by
//   name; removed: ids that were in the list and are no longer (only from a server answer, never the device cache).
// spacesApi(sdk) -> { create(name), rename(sid, name), remove(sid), invite(sid, email, role), setRole(sid, uid, role),
//   removeMember(sid, uid), uninvite(sid, key), move(from, id, to) }: each -> the Worker's JSON, or throws its error.

/** @typedef {{ id: string, name: string, owner: string, role: 'owner' | 'edit' | 'view', members: Record<string, string>, emails: Record<string, string>, invited: Record<string, { email: string, role: string }> }} Space */

const KEY = (/** @type {string} */ uid) => `notes:spaces:${uid}`;

/** @param {string} uid @returns {Space[]} */
export function cachedSpaces(uid) {
  try { const v = JSON.parse(localStorage.getItem(KEY(uid)) || 'null'); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** @param {string} uid */
export function forgetSpaces(uid) { try { localStorage.removeItem(KEY(uid)); } catch { /* storage off */ } }

/** @param {any} d @param {string} id @param {string} uid @returns {Space} */
const toSpace = (d, id, uid) => ({
  id, name: String(d.name || ''), owner: String(d.owner || ''), role: d.members?.[uid] || 'view',
  members: d.members || {}, emails: d.emails || {}, invited: d.invited || {},
});

/** @param {{ sdk: () => Promise<any>, uid: string, onList: (spaces: Space[], meta: { removed: string[], fromServer: boolean }) => void }} o */
export function spacesOf({ sdk, uid, onList }) {
  let stopped = false, off = () => {};
  /** @type {Space[]} */
  let spaces = cachedSpaces(uid);
  onList(spaces, { removed: [], fromServer: false });
  void sdk().then(({ F, db }) => {
    if (stopped) return;
    const q = F.query(F.collection(db, 'spaces'), F.where('memberIds', 'array-contains', uid));
    off = F.onSnapshot(q, (/** @type {any} */ snap) => {
      const next = snap.docs.map((/** @type {any} */ d) => toSpace(d.data(), d.id, uid)).sort((/** @type {Space} */ a, /** @type {Space} */ b) => a.name.localeCompare(b.name));
      const fromServer = !snap.metadata.fromCache;
      const removed = fromServer ? spaces.filter(s => !next.some((/** @type {Space} */ n) => n.id === s.id)).map(s => s.id) : [];
      spaces = next;
      if (fromServer) { try { localStorage.setItem(KEY(uid), JSON.stringify(spaces)); } catch { /* storage off */ } }
      onList(spaces, { removed, fromServer });
    }, (/** @type {any} */ e) => console.warn('spaces', e?.code || e?.message));
  });
  return { list: () => spaces, stop() { stopped = true; off(); } };
}

/** @param {() => Promise<any>} sdk */
export function spacesApi(sdk) {
  /** @param {string} method @param {string} path @param {unknown} [body] */
  async function call(method, path, body) {
    const { auth } = await sdk();
    const u = auth.currentUser;
    if (!u) throw new Error('Sign in first.');
    const r = await fetch(`/api/spaces${path}`, {
      method, headers: { Authorization: `Bearer ${await u.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);
    if (!r) throw new Error('No connection; try again when online.');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Couldn’t do that (${r.status}).`);
    return j;
  }
  const at = (/** @type {string} */ s) => '/' + encodeURIComponent(s);
  return {
    /** @param {string} name @returns {Promise<{ id: string }>} */
    create: name => call('POST', '', { name }),
    /** @param {string} sid @param {string} name */
    rename: (sid, name) => call('PATCH', at(sid), { name }),
    // a big space is deleted in rounds: ask again until done
    /** @param {string} sid */
    async remove(sid) { for (let i = 0; i < 50; i++) if ((await call('DELETE', at(sid))).done) return; throw new Error('Still deleting; try again.'); },
    /** @param {string} sid @param {string} email @param {string} role @returns {Promise<{ added?: string, pending?: boolean }>} */
    invite: (sid, email, role) => call('POST', at(sid) + '/invite', { email, role }),
    /** @param {string} sid @param {string} uid @param {string} role */
    setRole: (sid, uid, role) => call('PATCH', `${at(sid)}/members${at(uid)}`, { role }),
    /** @param {string} sid @param {string} uid */
    removeMember: (sid, uid) => call('DELETE', `${at(sid)}/members${at(uid)}`),
    /** @param {string} sid @param {string} key */
    uninvite: (sid, key) => call('DELETE', `${at(sid)}/invites${at(key)}`),
    /** @param {string} from @param {string} id @param {string} to */
    move: (from, id, to) => call('POST', at(from) + '/move', { id, to }),
  };
}
