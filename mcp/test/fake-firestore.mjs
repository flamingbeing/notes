// An in-memory stand-in for lib/firestore.mjs's client (same methods), that also enforces the notes rules' field checks
// on every write (firestore.app.rules: keys, title, body, updatedAt, serverAt) and the commit preconditions.
import { FirestoreError } from '../lib/firestore.mjs';

const NOTE_KEYS = ['path', 'title', 'body', 'links', 'tags', 'aliases', 'daily', 'updatedAt', 'serverAt', '_edits'];
const BIN_KEYS = ['id', 'kind', 'data', 'deletedAt', 'updatedAt', 'serverAt'];

// the notes rule, as written in app/firestore.app.rules
export function noteRuleProblem(d) {
  const bad = Object.keys(d).filter(k => !NOTE_KEYS.includes(k));
  if (bad.length) return `fields not allowed: ${bad}`;
  if (typeof d.title !== 'string' || !d.title.length || d.title.length > 300) return 'title';
  if (typeof d.body !== 'string' || new TextEncoder().encode(d.body).length > 1048576) return 'body';
  if ('path' in d && (typeof d.path !== 'string' || d.path.length > 500)) return 'path';
  for (const [k, max] of [['links', 2000], ['tags', 500], ['aliases', 100]]) if (k in d && (!Array.isArray(d[k]) || d[k].length > max)) return k;
  if ('daily' in d && !/^\d{4}-\d{2}-\d{2}$/.test(d.daily)) return 'daily';
  if (typeof d.updatedAt !== 'number') return 'updatedAt';
  return '';
}

export function makeFake({ spaces = [], docs = {} } = {}) {
  const store = new Map(Object.entries(docs).map(([k, v]) => [k, { data: v, version: 1 }]));
  const commits = [];
  const key = segs => segs.join('/');
  return {
    store, commits,
    async getDoc(segs) {
      const d = store.get(key(segs));
      return d && { ...d.data, id: segs.at(-1), _updateTime: `v${d.version}` };
    },
    async listCollection(segs) {
      const prefix = key(segs) + '/';
      return [...store].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([k, d]) => ({ ...d.data, id: k.slice(prefix.length) }));
    },
    async queryContains(_coll, _field, uid) { return spaces.filter(s => s.memberIds.includes(uid)); },
    async commit(writes) {
      const next = new Map(store);
      for (const w of writes) {
        const k = key(w.delete || w.set);
        const have = next.get(k);
        if (w.updateTime && (!have || `v${have.version}` !== w.updateTime)) throw new FirestoreError('precondition', 400, 'FAILED_PRECONDITION');
        if (w.mustNotExist && have) throw new FirestoreError('exists', 409, 'ALREADY_EXISTS');
        if (w.delete) { next.delete(k); continue; }
        const data = { ...w.data, serverAt: 'REQUEST_TIME' };
        const parts = w.set;
        if (parts[2] === 'notes') { const p = noteRuleProblem(data); if (p) throw new FirestoreError(`rules refuse: ${p}`, 403); }
        if (parts[2] === 'bin') {
          const extra = Object.keys(data).filter(x => !BIN_KEYS.includes(x));
          if (extra.length) throw new FirestoreError(`rules refuse bin fields: ${extra}`, 403);
        }
        next.set(k, { data, version: (have?.version || 0) + 1 });
      }
      store.clear(); for (const [k, v] of next) store.set(k, v);
      commits.push(writes);
      return {};
    },
  };
}
