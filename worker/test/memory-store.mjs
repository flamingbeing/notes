// An in-memory stand-in for worker/store.js (getDoc, write, listIds, userByEmail), for the spaces unit tests.
// docs is a Map of path -> data; users a list of { uid, email, verified }.
/** @param {{ docs?: Map<string, any>, users?: { uid: string, email: string, verified: boolean }[], now?: () => number }} [o] */
export function memoryStore({ docs = new Map(), users = [], now = Date.now } = {}) {
  const clone = (/** @type {unknown} */ v) => (v === undefined ? v : structuredClone(v));
  /** @param {any} doc @param {string[]} keys @param {(parent: any, key: string) => void} fn */
  const at = (doc, keys, fn) => { let p = doc; for (const k of keys.slice(0, -1)) p = (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) ? p[k] : (p[k] = {}); fn(p, keys.at(-1) || ''); };
  return {
    docs, users,
    async getDoc(/** @type {string} */ path) { return clone(docs.get(path)) ?? null; },
    // a doc's version is how many commits touched it (the REST updateTime stand-in); touch() makes a racing write
    versions: new Map(),
    touch(/** @type {string} */ path) { this.versions.set(path, (this.versions.get(path) || 0) + 1); },
    async getDocT(/** @type {string} */ path) { return docs.has(path) ? { data: clone(docs.get(path)), updateTime: `v${this.versions.get(path) || 0}` } : null; },
    async query(/** @type {string} */ parent, /** @type {string} */ coll, /** @type {string} */ field, /** @type {unknown} */ value, /** @type {number} */ max) {
      const depth = parent.split('/').length + 2;
      return [...docs.entries()].filter(([p, d]) => p.startsWith(`${parent}/${coll}/`) && p.split('/').length === depth && d[field] === value)
        .slice(0, max).map(([p, d]) => ({ id: p.split('/').at(-1), data: clone(d) }));
    },
    async write(/** @type {any[]} */ ops) {
      for (const op of ops) {
        if (op.updateTime != null && `v${this.versions.get(op.path) || 0}` !== op.updateTime) throw Object.assign(new Error('commit 400'), { status: 400 });
        if (op.delete || op.exists == null) continue;
        if (op.exists !== docs.has(op.path)) throw Object.assign(new Error(`commit ${op.exists ? 404 : 409}`), { status: op.exists ? 404 : 409 });
      }
      for (const op of ops) {
        this.touch(op.path);
        if (op.delete) { docs.delete(op.path); continue; }
        const d = clone(docs.get(op.path)) || {};
        for (const [k, v] of op.set || []) at(d, k, (p, key) => { p[key] = clone(v); });
        for (const k of op.remove || []) at(d, k, (p, key) => { delete p[key]; });
        for (const [k, v] of op.union || []) at(d, k, (p, key) => { p[key] = [...new Set([...(Array.isArray(p[key]) ? p[key] : []), ...v])]; });
        for (const [k, v] of op.pull || []) at(d, k, (p, key) => { p[key] = (Array.isArray(p[key]) ? p[key] : []).filter((/** @type {unknown} */ x) => !v.includes(x)); });
        for (const k of op.serverTime || []) at(d, k, (p, key) => { p[key] = new Date(now()); });
        docs.set(op.path, d);
      }
    },
    async listIds(/** @type {string} */ coll, /** @type {number} */ max) {
      const depth = coll.split('/').length + 1;
      return [...docs.keys()].filter(p => p.startsWith(coll + '/') && p.split('/').length === depth).slice(0, max).map(p => p.split('/').at(-1));
    },
    async userByEmail(/** @type {string} */ email) { return clone(users.find(u => u.email === email)) ?? null; },
  };
}
