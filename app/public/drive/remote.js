// Google Drive by plain fetch (no Google script): read a note's file (its text and version) and write it back only if
// nobody changed it meanwhile. Scope drive.file: the app sees only the files and folders it made. The token comes from
// the caller (token.js).
//   read(path)  -> { text, rev } or null when there is no file
//   write(path, text, prev) -> { rev }; throws an error with .conflict when the file changed since `prev` (the read's
//   answer, null for a new file) so the run reads it again and merges; .auth = the token was refused.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER = 'Notes';

const DRIVE = 'https://www.googleapis.com/drive/v3/files', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,md5Checksum,headRevisionId,trashed';

/** @typedef {{ id: string, md5Checksum?: string, headRevisionId?: string, trashed?: boolean }} DriveFile */
/** @typedef {{ text: string, rev: string, id: string }} Read */
/** @typedef {{ conflict?: boolean, auth?: boolean, status?: number, limited?: boolean }} Flags */

/** @param {string} msg @param {Flags} [extra] @returns {Error & Flags} */
const fail = (msg, extra = {}) => Object.assign(new Error(msg), extra);
const conflict = () => fail('changed elsewhere meanwhile', { conflict: true });
/** @param {string} path */
const split = path => { const parts = path.split('/').filter(Boolean); return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] }; };
/** @param {Response} res */
const detail = async res => { const t = await res.text().catch(() => ''); try { return JSON.parse(t)?.error?.message || t; } catch { return t; } };

/** the folder search for Drive (drive.file only lists what this app made); quotes in names escaped @param {string} name @param {{ folder?: boolean, parent?: string }} [o] */
export const driveQuery = (name, { folder = false, parent = '' } = {}) =>
  [`name = '${String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, 'trashed = false', folder ? "mimeType = 'application/vnd.google-apps.folder'" : '', parent ? `'${parent}' in parents` : ''].filter(Boolean).join(' and ');

/**
 * @param {{ token: () => Promise<string>, forget?: () => void, fetch?: typeof fetch }} o
 *   token: the access token now; forget: drops a refused token so the next call asks again
 */
export function driveRemote({ token, forget = () => {}, fetch: doFetch = (...a) => fetch(...a) }) {
  /** "Notes/Space" -> id, for this visit @type {Map<string, string>} */
  const folderIds = new Map();
  /** @param {string} url @param {RequestInit} [init] */
  const call = async (url, init = {}) => {
    const res = await doFetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${await token()}` } });
    if (res.status === 401) { forget(); throw fail('Google Drive: sign-in expired. Tap Sync again.', { auth: true }); }
    return res;
  };
  /** @param {string} url @param {RequestInit} [init] */
  const json = async (url, init) => {
    const res = await call(url, init);
    if (!res.ok) throw fail(`Google Drive: ${res.status} ${(await detail(res)).slice(0, 160)}`, { status: res.status, limited: res.status === 429 });
    return res.json();
  };
  /** every match, newest first (Drive allows two files of one name: the newest is the note's file) @param {string} q @returns {Promise<DriveFile[]>} */
  const findAll = async q => {
    /** @type {DriveFile[]} */ const out = [];
    let pageToken = '';
    do {
      const r = await json(`${DRIVE}?${new URLSearchParams({ q, fields: `nextPageToken,files(${FILE_FIELDS})`, orderBy: 'modifiedTime desc', pageSize: '100', spaces: 'drive', ...(pageToken ? { pageToken } : {}) })}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken || '';
    } while (pageToken && out.length < 1000);
    return out;
  };
  /** the folder for a path, one level at a time from the app's own folder; made when asked to @param {string[]} dirs @param {boolean} make */
  const folder = async (dirs, make) => {
    let parent = '', key = '';
    for (const name of [FOLDER, ...dirs]) {
      key += (key ? '/' : '') + name;
      let id = folderIds.get(key);
      if (!id) {
        const found = (await findAll(driveQuery(name, { folder: true, parent })))[0];
        if (!found && !make) return null;
        id = found ? found.id : (await json(DRIVE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }) })).id;
        folderIds.set(key, /** @type {string} */ (id));
      }
      parent = /** @type {string} */ (id);
    }
    return parent;
  };
  /** @param {DriveFile} f */
  const rev = f => f.md5Checksum || f.headRevisionId || '';
  /** @param {string} url @param {string} method @param {object} meta @param {string} text @returns {Promise<DriveFile>} */
  const upload = (url, method, meta, text) => {
    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    body.append('file', new Blob([text], { type: 'text/markdown' }));
    return json(`${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams({ uploadType: 'multipart', fields: FILE_FIELDS })}`, { method, body });
  };
  return {
    /** @param {string} path @returns {Promise<Read | null>} */
    async read(path) {
      const { dirs, name } = split(path);
      const parent = await folder(dirs, false);
      const f = parent && (await findAll(driveQuery(name, { parent })))[0];
      if (!f) return null;
      const res = await call(`${DRIVE}/${encodeURIComponent(f.id)}?alt=media`);
      if (res.status === 404) return null;
      if (!res.ok) throw fail(`Google Drive: ${res.status} ${(await detail(res)).slice(0, 160)}`);
      return { text: await res.text(), rev: rev(f), id: f.id };
    },
    /** @param {string} path @param {string} text @param {Read | null} prev @returns {Promise<{ rev: string }>} */
    async write(path, text, prev) {
      const { dirs, name } = split(path);
      if (prev) {
        // Drive has no "only if unchanged" upload: check the version just before writing (a second's window)
        const now = await call(`${DRIVE}/${encodeURIComponent(prev.id)}?fields=${FILE_FIELDS}`);
        if (now.status === 404) throw conflict();
        if (!now.ok) throw fail(`Google Drive: ${now.status} ${(await detail(now)).slice(0, 160)}`);
        const meta = await now.json();
        if (meta.trashed || rev(meta) !== prev.rev) throw conflict();
        return { rev: rev(await upload(`${DRIVE_UP}/${encodeURIComponent(prev.id)}`, 'PATCH', {}, text)) };
      }
      let parent = /** @type {string} */ (await folder(dirs, true));
      // the folder remembered this visit may have been binned or deleted in Drive since (a file put there would be out of
      // sight): checked, and looked up (or made) again if so
      const there = await call(`${DRIVE}/${encodeURIComponent(parent)}?fields=trashed`);
      if (there.status === 404 || (there.ok && (await there.json()).trashed)) {
        folderIds.clear();
        parent = /** @type {string} */ (await folder(dirs, true));
      }
      if ((await findAll(driveQuery(name, { parent }))).length) throw conflict();   // made by another device meanwhile
      return { rev: rev(await upload(DRIVE_UP, 'POST', { name, parents: [parent], mimeType: 'text/markdown' }, text)) };
    },
  };
}
