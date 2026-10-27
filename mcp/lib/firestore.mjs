// Firestore REST, as the signed-in user (so firestore.rules apply exactly as in the app). Only the user's own vault
// (spaces/<uid>) and the shared spaces they are a member of are reached; every write is a commit that stamps serverAt
// with the request time, as the rules require. The HTTP layer (fetch) and the token source are injected for tests.

// ---- typed values -> plain JS ----

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return { lat: v.geoPointValue.latitude ?? 0, lng: v.geoPointValue.longitude ?? 0 };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}

export const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));

// A Firestore document -> its fields, with `id` set from the document name when the data has none.
export function decodeDoc(doc) {
  if (!doc) return null;
  const data = decodeFields(doc.fields);
  const id = String(doc.name || '').split('/').pop();
  return data.id == null && id ? { ...data, id } : data;
}

// ---- plain JS -> typed values (strings, numbers, booleans, null, lists and maps) ----

export function encodeValue(v) {
  if (v == null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encodeValue) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error(`Cannot store a ${typeof v}`);
}

export const encodeFields = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]));

// ---- client ----

export class FirestoreError extends Error {
  /** @param {string} message @param {number} status @param {string} [code] Google's status name, e.g. FAILED_PRECONDITION */
  constructor(message, status, code = '') { super(message); this.status = status; this.code = code; }
}

// getIdToken(force) -> a Firebase ID token; onDenied() asks for new role claims (called once on a 403).
export function makeFirestore({ projectId, getIdToken, onDenied = async () => {}, fetch = globalThis.fetch, pageSize = 300 }) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;

  async function call(url, init = {}, { allow404 = true } = {}) {
    let denied = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getIdToken(attempt > 0 && !denied);
      const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) continue;   // stale token: refresh once
      if (res.status === 403 && !denied) { denied = true; await onDenied(); continue; }   // the role claims may be behind
      if (res.status === 404 && allow404) return null;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message || res.statusText || 'request failed';
        throw new FirestoreError(res.status === 403
          ? `Firestore refused access (${msg}). Try signing in again with the login command.`
          : `Firestore error ${res.status}: ${msg}`, res.status, body?.error?.status);
      }
      return body;
    }
  }

  const path = segments => segments.map(encodeURIComponent).join('/');
  const docUrl = segments => `${base}/${path(segments)}`;
  const docName = segments => `${root}/${path(segments)}`;

  return {
    /** @returns {Promise<(Record<string, any> & { _updateTime?: string }) | null>} */
    async getDoc(segments) {
      const doc = await call(docUrl(segments));
      return doc && { ...decodeDoc(doc), _updateTime: doc.updateTime };
    },

    async listCollection(segments) {
      const out = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({ pageSize: String(pageSize) });
        if (pageToken) q.set('pageToken', pageToken);
        const body = await call(`${docUrl(segments)}?${q}`);
        for (const d of body?.documents || []) out.push(decodeDoc(d));
        pageToken = body?.nextPageToken || '';
      } while (pageToken);
      return out;
    },

    // documents of a top-level collection whose list field contains value (the spaces a person is in)
    async queryContains(collectionId, field, value) {
      const body = await call(`${base}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'ARRAY_CONTAINS', value: { stringValue: value } } },
        } }),
      });
      return (Array.isArray(body) ? body : []).filter(r => r && r.document).map(r => decodeDoc(r.document));
    },

    // Applies the writes together or not at all. A write is one of
    //   { set: segments, data, mustNotExist?, updateTime? }   the whole document, stamped with serverAt
    //   { delete: segments, updateTime? }
    // updateTime (from getDoc's _updateTime): refused when someone changed the document since (retry with a fresh read).
    async commit(writes) {
      const body = await call(`${base}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: writes.map(w => w.delete
          ? { delete: docName(w.delete), ...(w.updateTime ? { currentDocument: { updateTime: w.updateTime } } : {}) }
          : {
            update: { name: docName(w.set), fields: encodeFields(w.data) },
            updateTransforms: [{ fieldPath: 'serverAt', setToServerValue: 'REQUEST_TIME' }],
            ...(w.mustNotExist ? { currentDocument: { exists: false } } : w.updateTime ? { currentDocument: { updateTime: w.updateTime } } : {}),
          }) }),
      }, { allow404: false });
      return body;
    },
  };
}
