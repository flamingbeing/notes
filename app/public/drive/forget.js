// Sync forget: what this device remembers about its Drive copy (each note's ledger entry and base text, the last-sync
// times) is wiped at sign-out of a different account or "Forget this device", so the next account never inherits it.

/** @param {{ name?: string, storage?: Pick<Storage, 'removeItem' | 'key' | 'length'>, idb?: Pick<IDBFactory, 'deleteDatabase'> }} [o] */
export async function forgetDrive({ name = 'notes-drive', storage = globalThis.localStorage, idb = globalThis.indexedDB } = {}) {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) || '');
    for (const k of keys) if (k.startsWith('drive-last:')) storage.removeItem(k);
  } catch { /* storage off */ }
  try {
    await new Promise(resolve => { const r = idb.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => resolve(undefined); });
  } catch { /* no IndexedDB */ }
}
