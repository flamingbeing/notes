// The signed-in person's notes, read and written through Firestore REST. The vault is spaces/<uid>; shared spaces are
// the spaces/<id> documents listing the person in memberIds. Nothing else is reached; the rules decide the rest.
// Notes are kept for a minute per space so a run of tool calls reads Firestore once; every write drops them.

import { binEntry } from './write.mjs';

export const VAULT = 'My notes';

export class SpaceError extends Error {}

export function makeNotesSource({ firestore, uid, now = () => Date.now(), cacheMs = 60_000 }) {
  if (!uid) throw new Error('No signed-in account');
  /** @type {Map<string, { at: number, notes: any[] }>} */
  const cache = new Map();
  let spaceList = null;

  async function spaces() {
    if (!spaceList) {
      const shared = await firestore.queryContains('spaces', 'memberIds', uid);
      spaceList = [{ id: uid, name: VAULT, role: 'owner', vault: true },
        ...shared.map(s => ({ id: s.id, name: String(s.name || s.id), role: String(s.members?.[uid] || 'view') }))];
    }
    return spaceList;
  }

  // a space named by its id or its name (case ignored); none: the vault
  async function resolve(ref) {
    const all = await spaces();
    if (ref === undefined || ref === '') return all[0];
    const byId = all.find(s => s.id === ref);
    if (byId) return byId;
    const named = all.filter(s => s.name.toLowerCase() === String(ref).toLowerCase());
    if (named.length === 1) return named[0];
    if (named.length > 1) throw new SpaceError(`Several spaces are called "${ref}"; use an id: ${named.map(s => s.id).join(', ')}`);
    throw new SpaceError(`No space "${ref}" (or you are not in it). list_spaces shows yours.`);
  }

  const forget = () => cache.clear();
  const canWrite = s => s.vault || s.role === 'owner' || s.role === 'edit';
  const mustWrite = s => { if (!canWrite(s)) throw new SpaceError(`You can only read "${s.name}" (your role there is ${s.role}).`); return s; };

  return {
    uid, spaces, resolve,
    async notes(space, fresh = false) {
      const hit = cache.get(space.id);
      if (!fresh && hit && now() - hit.at < cacheMs) return hit.notes;
      const notes = await firestore.listCollection(['spaces', space.id, 'notes']);
      cache.set(space.id, { at: now(), notes });
      return notes;
    },
    // one note read now (with its version), for a change made to what is stored
    note: (space, id) => firestore.getDoc(['spaces', space.id, 'notes', id]).then(d => d && { ...d, id }),
    async create(space, id, record) {
      mustWrite(space);
      await firestore.commit([{ set: ['spaces', space.id, 'notes', id], data: record, mustNotExist: true }]);
      forget();
    },
    async replace(space, id, record, updateTime) {
      mustWrite(space);
      await firestore.commit([{ set: ['spaces', space.id, 'notes', id], data: record, updateTime }]);
      forget();
    },
    // delete and the bin copy in one commit, as the app does
    async remove(space, note, at) {
      mustWrite(space);
      await firestore.commit([
        { delete: ['spaces', space.id, 'notes', note.id], updateTime: note._updateTime },
        { set: ['spaces', space.id, 'bin', `notes:${note.id}`], data: binEntry(note, at) },
      ]);
      forget();
    },
  };
}
