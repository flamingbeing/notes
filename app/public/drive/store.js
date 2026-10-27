// What this device remembers about each synced note, in IndexedDB (a note's last text can be large): the ledger entry
// { fp, rev, path } and the base text for the 3-way merge. A store is { get, set, remove }; tests use a Map-backed one.

/** @typedef {{ get: (key: string) => Promise<unknown>, set: (key: string, value: unknown) => Promise<void>, remove: (key: string) => Promise<void> }} Store */

/** @param {string} name @returns {Store} */
export function idbStore(name) {
  /** @type {Promise<IDBDatabase> | null} */ let db = null;
  const open = () => (db ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { db = null; reject(req.error); };
  }));
  /** @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest} fn */
  const run = async (mode, fn) => {
    const store = (await open()).transaction('kv', mode).objectStore('kv');
    return new Promise((resolve, reject) => { const r = fn(store); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  };
  return {
    get: key => run('readonly', s => s.get(key)),
    set: async (key, value) => { await run('readwrite', s => s.put(value, key)); },
    remove: async key => { await run('readwrite', s => s.delete(key)); },
  };
}

/** @returns {Store} a store in memory (tests) */
export function memoryStore() {
  const m = new Map();
  return { get: async k => m.get(k), set: async (k, v) => { m.set(k, v); }, remove: async k => { m.delete(k); } };
}
