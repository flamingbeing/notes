// The Worker's own Firestore and Auth calls beyond claims.js's admin (which is app-devkit's and stays as it is): atomic
// writes of single fields (members.<uid>, an array's items, the server's time), listing a collection's ids, and finding
// an account by its email. As the service account (rules do not apply); on localhost with EMULATOR, the emulators.
//
// store({ project, emulator, accessToken, getDoc }) -> { getDoc, getDocT, query, write, listIds, userByEmail }
//   getDoc(path) -> plain data | null                         (claims.js admin.getDoc, passed through)
//   getDocT(path) -> { data, updateTime } | null              (updateTime: the version, for an op's updateTime)
//   query(parent, coll, field, value, max) -> [{ id, data }]  the docs of <parent>/<coll> whose field equals value
//   write(ops)   one atomic commit; each op is
//                { path, delete: true }  or
//                { path, set?: [[field, ...keys], value][], remove?: [field, ...keys][], union?: [[...], values[]][],
//                  pull?: [[...], values[]][], serverTime?: [...][], exists?: boolean, updateTime?: string }
//                (only the fields named change; exists: true fails when the doc is gone, false when it is there;
//                updateTime, from getDocT, fails when the doc changed since, on a delete too)
//   listIds(collectionPath, max) -> up to max doc ids in it
//   userByEmail(email) -> { uid, email, verified } | null
// worker/test/spaces.test.mjs uses an in-memory store of the same shape (worker/test/memory-store.mjs).
import { toValue, fromValue } from './claims.js';

const SIMPLE = /^[A-Za-z_][A-Za-z_0-9]*$/;
/** @param {string[]} keys -> a Firestore field path (`odd keys` quoted) */
export const fieldPath = keys => keys.map(k => (SIMPLE.test(k) ? k : '`' + k.replace(/[`\\]/g, c => '\\' + c) + '`')).join('.');

/** @param {[string[], unknown][]} sets -> the nested fields of a REST document */
function nest(sets) {
  /** @type {Record<string, any>} */
  const root = {};
  for (const [keys, value] of sets) {
    let at = root;
    keys.slice(0, -1).forEach(k => { at = (at[k] ??= { mapValue: { fields: {} } }).mapValue.fields; });
    at[keys.at(-1)] = toValue(value);
  }
  return root;
}

export function store({ project, emulator, accessToken, getDoc }) {
  const authBase = emulator ? `http://${emulator.auth}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const fsBase = emulator ? `http://${emulator.firestore}` : 'https://firestore.googleapis.com';
  const db = `projects/${encodeURIComponent(project)}/databases/(default)`;
  const name = (/** @type {string} */ path) => `projects/${project}/databases/(default)/documents/${path}`;
  async function call(/** @type {string} */ url, /** @type {unknown} */ body) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const e = /** @type {Error & { status?: number }} */ (new Error(`${url.split('?')[0].split(/[/:]/).at(-1)} ${r.status}`));
      e.status = r.status;
      throw e;
    }
    return r.json();
  }
  return {
    getDoc,
    /** @param {string} path */
    async getDocT(path) {
      const r = await fetch(`${fsBase}/v1/${name(path).split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`get ${r.status}`);
      const d = await r.json();
      return { data: fromValue({ mapValue: { fields: d.fields || {} } }), updateTime: d.updateTime };
    },
    /** @param {string} parent @param {string} coll @param {string} field @param {unknown} value @param {number} max */
    async query(parent, coll, field, value, max) {
      const rows = await call(`${fsBase}/v1/${db}/documents/${parent.split('/').map(encodeURIComponent).join('/')}:runQuery`, { structuredQuery: {
        from: [{ collectionId: coll }], limit: max,
        where: { fieldFilter: { field: { fieldPath: fieldPath([field]) }, op: 'EQUAL', value: toValue(value) } } } });
      return rows.filter((/** @type {any} */ x) => x.document).map((/** @type {any} */ x) => ({
        id: x.document.name.split('/').at(-1), data: fromValue({ mapValue: { fields: x.document.fields || {} } }) }));
    },
    /** @param {any[]} ops */
    async write(ops) {
      const writes = ops.map(op => {
        if (op.delete) return { delete: name(op.path), ...(op.updateTime ? { currentDocument: { updateTime: op.updateTime } } : {}) };
        const sets = op.set || [], removes = op.remove || [];
        const transforms = [
          ...(op.union || []).map((/** @type {[string[], unknown[]]} */ [k, v]) => ({ fieldPath: fieldPath(k), appendMissingElements: { values: v.map(toValue) } })),
          ...(op.pull || []).map((/** @type {[string[], unknown[]]} */ [k, v]) => ({ fieldPath: fieldPath(k), removeAllFromArray: { values: v.map(toValue) } })),
          ...(op.serverTime || []).map((/** @type {string[]} */ k) => ({ fieldPath: fieldPath(k), setToServerValue: 'REQUEST_TIME' })),
        ];
        return {
          update: { name: name(op.path), fields: nest(sets) },
          updateMask: { fieldPaths: [...sets.map((/** @type {[string[], unknown]} */ [k]) => fieldPath(k)), ...removes.map(fieldPath)] },
          ...(transforms.length ? { updateTransforms: transforms } : {}),
          ...(op.updateTime ? { currentDocument: { updateTime: op.updateTime } } : op.exists != null ? { currentDocument: { exists: op.exists } } : {}),
        };
      });
      await call(`${fsBase}/v1/${db}/documents:commit`, { writes });
    },
    /** @param {string} coll @param {number} max */
    async listIds(coll, max) {
      const url = `${fsBase}/v1/${db}/documents/${coll.split('/').map(encodeURIComponent).join('/')}?pageSize=${max}&mask.fieldPaths=__none__`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`list ${r.status}`);
      const j = await r.json();
      return (j.documents || []).map((/** @type {{ name: string }} */ d) => d.name.split('/').at(-1));
    },
    /** @param {string} email */
    async userByEmail(email) {
      const j = await call(`${authBase}/v1/projects/${encodeURIComponent(project)}/accounts:lookup`, { email: [email] });
      const u = j.users?.[0];
      return u ? { uid: u.localId, email: String(u.email || '').toLowerCase(), verified: !!u.emailVerified } : null;
    },
  };
}
