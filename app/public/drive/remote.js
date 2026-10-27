// Google Drive by plain fetch (no Google script): read a note's file (its text and version) and write it back only if
// nobody changed it meanwhile. Scope drive.file: the app sees only the files and folders it made. The token comes from
// the caller (token.js).
//   prime()     -> lists everything the app has in Drive once (one paged call); read/stat/write then look files and folders
//                  up from that list instead of searching per note
//   release()   -> drops the list (end of a run)
//   stat(path)  -> { id, rev } from the list, null when there is no such file, undefined when not primed
//   read(path)  -> { text, rev } or null when there is no file
//   write(path, text, prev) -> { rev }; throws an error with .conflict when the file changed since `prev` (the read's
//   answer, null for a new file) so the run reads it again and merges; .auth = the token was refused.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER = 'Notes';

const DRIVE = 'https://www.googleapis.com/drive/v3/files', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,md5Checksum,headRevisionId,trashed';
const LIST_FIELDS = 'id,name,mimeType,parents,md5Checksum,headRevisionId';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';

/** @typedef {{ id: string, name?: string, mimeType?: string, parents?: string[], md5Checksum?: string, headRevisionId?: string, trashed?: boolean }} DriveFile */
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
  /** "Notes/Space" -> id (as a promise: notes synced side by side share one lookup; a lookup that may not make the folder
   *  is not shared with one that must), for this visit @type {Map<string, { p: Promise<string | null>, make: boolean }>} */
  const folderIds = new Map();
  /** folder ids already checked this visit for being in the bin @type {Map<string, Promise<boolean>>} */
  const checked = new Map();
  /** the list taken by prime(): "parent id/name" -> newest file, and the same for folders; null until primed
   *  @type {{ files: Map<string, DriveFile>, folders: Map<string, DriveFile> } | null} */
  let index = null;
  /** folder ids found binned or deleted: looked up (or made) again once, however many notes noticed @type {Set<string>} */
  const gone = new Set();
  /** files whose entry in the list is out of date (a write found them changed) @type {Set<string>} */
  const moved = new Set();
  const slot = (/** @type {string} */ parent, /** @type {string} */ name) => `${parent}\0${name}`;
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
  const findAll = async (q, fields = FILE_FIELDS, max = 1000) => {
    /** @type {DriveFile[]} */ const out = [];
    let pageToken = '';
    do {
      const r = await json(`${DRIVE}?${new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, orderBy: 'modifiedTime desc', pageSize: '1000', spaces: 'drive', ...(pageToken ? { pageToken } : {}) })}`);
      out.push(...(r.files || []));
      pageToken = r.nextPageToken || '';
    } while (pageToken && out.length < max);
    return out;
  };
  /** one level of a folder path: from the list when primed, else searched; made when asked to
   *  @param {string} parent @param {string} name @param {boolean} make @returns {Promise<string | null>} */
  const level = async (parent, name, make) => {
    const found = index ? (parent ? index.folders.get(slot(parent, name)) : rootFolder(name)) : (await findAll(driveQuery(name, { folder: true, parent })))[0];
    if (found) return found.id;
    if (!make) return null;
    const id = (await json(DRIVE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_TYPE, ...(parent ? { parents: [parent] } : {}) }) })).id;
    index?.folders.set(slot(parent, name), { id, name });
    return id;
  };
  /** the app's own top folder: the newest one that is not inside another of the app's folders @param {string} name */
  const rootFolder = name => {
    const all = [...(index?.folders.values() || [])], inside = new Set(all.map(f => f.id));
    return all.find(f => f.name === name && !(f.parents || []).some(p => inside.has(p)));
  };
  /** the folder for a path, one level at a time from the app's own folder; made when asked to
   *  @param {string[]} dirs @param {boolean} make @returns {Promise<string | null>} */
  const folder = async (dirs, make) => {
    let parent = '', key = '';
    for (const name of [FOLDER, ...dirs]) {
      key += (key ? '/' : '') + name;
      let entry = folderIds.get(key);
      if (!entry || (make && !entry.make)) {
        const mine = entry = { make, p: level(parent, name, make) };
        const drop = () => { if (folderIds.get(key) === mine) folderIds.delete(key); };
        mine.p.then(id => { if (!id) drop(); }, drop);
        folderIds.set(key, mine);
      }
      const id = await entry.p;
      if (!id) return null;
      parent = id;
    }
    return parent;
  };
  /** the folder remembered this visit may have been binned or deleted in Drive since (a file put there would be out of
   *  sight): checked once per folder per visit, and the memory dropped if so @param {string} id @returns {Promise<boolean>} still there */
  const stillThere = id => {
    let p = checked.get(id);
    if (!p) {
      p = call(`${DRIVE}/${encodeURIComponent(id)}?fields=trashed`).then(async res => !(res.status === 404 || (res.ok && (await res.json()).trashed)));
      checked.set(id, p);
      p.catch(() => checked.delete(id));
    }
    return p;
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
  /** the file of a path, from the list when primed, else searched @param {string} path @returns {Promise<DriveFile | null>} */
  const lookup = async path => {
    const { dirs, name } = split(path);
    const parent = await folder(dirs, false);
    if (!parent) return null;
    const listed = index?.files.get(slot(parent, name));
    // a file the list had but that changed since (a write found it moved) is looked up live
    return (index && !(listed && moved.has(listed.id)) ? listed : (await findAll(driveQuery(name, { parent })))[0]) || null;
  };
  return {
    /** list everything the app made in Drive (drive.file shows only that), newest first, in one paged call */
    async prime() {
      const all = await findAll('trashed = false', LIST_FIELDS, 100000);
      const next = { files: new Map(), folders: new Map() };
      for (const f of all) {
        const set = f.mimeType === FOLDER_TYPE ? next.folders : next.files;
        for (const parent of f.parents?.length ? f.parents : ['']) if (!set.has(slot(parent, /** @type {string} */ (f.name)))) set.set(slot(parent, /** @type {string} */ (f.name)), f);
      }
      folderIds.clear(); checked.clear();
      index = next;
    },
    /** drop the list at the end of a run: it would be stale at the next one */
    release() { index = null; folderIds.clear(); checked.clear(); gone.clear(); moved.clear(); },
    /** @param {string} path @returns {Promise<{ id: string, rev: string } | null | undefined>} */
    async stat(path) {
      if (!index) return undefined;
      const f = await lookup(path);
      return f ? { id: f.id, rev: rev(f) } : null;
    },
    /** @param {string} path @returns {Promise<Read | null>} */
    async read(path) {
      const f = await lookup(path);
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
        if (now.status === 404) { moved.add(prev.id); throw conflict(); }
        if (!now.ok) throw fail(`Google Drive: ${now.status} ${(await detail(now)).slice(0, 160)}`);
        const meta = await now.json();
        if (meta.trashed || rev(meta) !== prev.rev) { moved.add(prev.id); throw conflict(); }
        return { rev: rev(await upload(`${DRIVE_UP}/${encodeURIComponent(prev.id)}`, 'PATCH', {}, text)) };
      }
      let parent = /** @type {string} */ (await folder(dirs, true));
      if (!(await stillThere(parent)) && !gone.has(parent)) {
        gone.add(parent); folderIds.clear(); checked.clear();
        if (index) for (const [k, f] of index.folders) if (f.id === parent) index.folders.delete(k);
      }
      if (gone.has(parent)) {
        parent = /** @type {string} */ (await folder(dirs, true));
      }
      // made by another device meanwhile: searched for only without the list (the list was taken a moment ago)
      if (!index && (await findAll(driveQuery(name, { parent }))).length) throw conflict();
      const made = await upload(DRIVE_UP, 'POST', { name, parents: [parent], mimeType: 'text/markdown' }, text);
      index?.files.set(slot(parent, name), { ...made, name, parents: [parent] });
      return { rev: rev(made) };
    },
  };
}
