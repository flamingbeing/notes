// An in-memory Google Drive (the part drive/remote.js calls): folders and files by name and parent, md5-like versions,
// trash. `handle` takes a request already read ({ method, url, token, meta, text }) and answers { status, body };
// `asFetch` adapts it to fetch (unit tests) and e2e/drive.spec.mjs adapts it to a Playwright route.
import crypto from 'node:crypto';

export function fakeDrive() {
  /** @type {Map<string, { id: string, name: string, mimeType: string, parents: string[], text: string, trashed: boolean, rev: number }>} */
  const files = new Map();
  const calls = [];
  let n = 0;
  const md5 = f => crypto.createHash('md5').update(f.text + '\0' + f.rev).digest('hex');
  const view = f => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, md5Checksum: md5(f), headRevisionId: String(f.rev), trashed: f.trashed });
  const add = (name, mimeType, parents, text = '') => {
    const f = { id: `f${++n}`, name, mimeType, parents, text, trashed: false, rev: 1 };
    files.set(f.id, f);
    return f;
  };
  // the few query shapes remote.js makes: name = '…' and trashed = false [and mimeType = folder] [and 'id' in parents]
  const matches = (f, q) => {
    const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1].replace(/\\(.)/g, '$1');
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    if (name === undefined) return !f.trashed;   // the whole list: trashed = false
    return f.name === name && !f.trashed && (!q.includes('google-apps.folder') || f.mimeType === 'application/vnd.google-apps.folder')
      && (!parent || f.parents.includes(parent));
  };
  const json = (status, body) => ({ status, body });
  const handle = ({ method, url, token, meta, text }) => {
    calls.push(`${method} ${new URL(url).pathname}`);
    if (token !== 'emulator-token' && token !== 'good') return json(401, { error: { message: 'Invalid Credentials' } });
    const u = new URL(url), id = decodeURIComponent(u.pathname.split('/').pop());
    const upload = u.pathname.startsWith('/upload/');
    if (method === 'GET' && u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q') || '';
      return json(200, { files: [...files.values()].filter(f => matches(f, q)).reverse().map(view) });
    }
    if (method === 'GET') {
      const f = files.get(id);
      if (!f) return json(404, { error: { message: 'File not found' } });
      return u.searchParams.get('alt') === 'media' ? { status: 200, text: f.text } : json(200, view(f));
    }
    if (method === 'POST' && !upload) {
      const b = JSON.parse(meta || '{}');
      return json(200, view(add(b.name, b.mimeType, b.parents || [])));
    }
    if (method === 'POST') {
      const b = JSON.parse(meta || '{}');
      return json(200, view(add(b.name, b.mimeType, b.parents || [], text)));
    }
    if (method === 'PATCH') {
      const f = files.get(id);
      if (!f) return json(404, { error: { message: 'File not found' } });
      f.text = text; f.rev++;
      return json(200, view(f));
    }
    return json(400, { error: { message: 'unsupported' } });
  };
  /** @type {typeof fetch} */
  const asFetch = async (url, init = {}) => {
    const token = String(init.headers?.Authorization || '').replace(/^Bearer /, '');
    let meta = '', text = '';
    if (init.body instanceof FormData) { meta = await init.body.get('metadata').text(); text = await init.body.get('file').text(); }
    else if (typeof init.body === 'string') meta = init.body;
    const r = handle({ method: init.method || 'GET', url: String(url), token, meta, text });
    return new Response(r.body === undefined ? r.text : JSON.stringify(r.body), { status: r.status });
  };
  /** the text of the one file with this name, or undefined */
  const textOf = name => [...files.values()].find(f => f.name === name && !f.trashed && f.mimeType !== 'application/vnd.google-apps.folder')?.text;
  /** the person edits a file in Drive */
  const edit = (name, text) => { const f = [...files.values()].find(x => x.name === name && x.mimeType !== 'application/vnd.google-apps.folder'); f.text = text; f.rev++; };
  return { files, calls, handle, fetch: asFetch, textOf, edit, add };
}

// A browser's multipart body -> { meta, text } (remote.js sends a 'metadata' part and a 'file' part)
export function parseMultipart(contentType, body) {
  const boundary = /boundary=(.+)$/.exec(contentType || '')?.[1];
  const out = { meta: '', text: '' };
  if (!boundary) return out;
  for (const part of body.split(`--${boundary}`)) {
    const m = /name="(metadata|file)"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n$/.exec(part);
    if (m) out[m[1] === 'metadata' ? 'meta' : 'text'] = m[2];
  }
  return out;
}
