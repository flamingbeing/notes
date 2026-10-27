// Import and export (#transfer): an Obsidian vault (a folder or a zip) into the open space, with a dry-run line first
// (what would be added, what skipped and why); the open space out as a zip. The planning is vault.js (pure); the zip
// library (fflate) loads only when a zip is read or made. Import never overwrites (vault.js skips what is there).
import { $, input, dialog } from '../shell/dom.js';
import { download } from '../shell/download.js';
import { planImport, summary, exportFiles } from '../notes/vault.js';

const MAX_ZIP_BYTES = 300_000_000;
const TYPES = /** @type {Record<string, string>} */ ({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
});
const typeOf = (/** @type {string} */ name) => TYPES[name.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';

/** @typedef {{ path: string, size: number, read: () => Promise<Uint8Array> }} Item */

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast @param {() => boolean} canWrite */
export function transferSheet(app, toast, canWrite) {
  const sheet = dialog('transfer');
  const msg = $('transfer-msg'), plan = $('transfer-plan'), skipped = $('transfer-skipped'), go = $('transfer-go');
  /** @type {Item[]} */ let items = [];
  /** @type {ReturnType<typeof planImport> | null} */ let planned = null;
  let busy = false;

  const reset = () => { items = []; planned = null; plan.textContent = ''; skipped.replaceChildren(); go.hidden = true; msg.textContent = ''; input('transfer-folder').value = ''; input('transfer-zip').value = ''; };

  const describe = () => {
    planned = planImport(items.map(i => ({ path: i.path, size: i.size })), {
      notes: app.notes(), files: app.attachments().map(a => ({ name: a.name, path: a.path })),
    });
    plan.textContent = items.length ? summary(planned) : 'Nothing found.';
    skipped.replaceChildren(...planned.skipped.slice(0, 20).map(s => Object.assign(document.createElement('li'), { textContent: `${s.from}: ${s.why}` })));
    if (planned.skipped.length > 20) skipped.append(Object.assign(document.createElement('li'), { textContent: `and ${planned.skipped.length - 20} more` }));
    go.hidden = !canWrite() || !(planned.notes.length || planned.files.length);
    if (!canWrite() && items.length) msg.textContent = 'You can’t add to this space.';
  };

  /** @param {File[]} files */
  const fromFolder = files => {
    items = files.map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, read: async () => new Uint8Array(await f.arrayBuffer()) }));
  };
  /** @param {File} file */
  const fromZip = async file => {
    if (file.size > MAX_ZIP_BYTES) throw new Error('That zip is too big to open here.');
    const { unzipSync } = await import('fflate');
    /** @type {{ path: string, size: number }[]} */ const found = [];
    const data = new Uint8Array(await file.arrayBuffer());
    // filter: nothing is unpacked until it is wanted; entries over the cap are listed (and skipped by the plan)
    unzipSync(data, { filter: f => { if (!f.name.endsWith('/')) found.push({ path: f.name, size: f.originalSize }); return false; } });
    // each entry is unpacked on its own when it is imported (unzipSync only reads the one the filter names)
    items = found.map(it => ({ ...it, read: async () => unzipSync(data, { filter: f => f.name === it.path })[it.path] }));
  };

  const load = async (/** @type {() => void | Promise<void>} */ fn) => {
    msg.textContent = ''; plan.textContent = 'Reading…'; go.hidden = true;
    try { await fn(); describe(); } catch (e) { items = []; planned = null; plan.textContent = ''; msg.textContent = /** @type {Error} */ (e).message; }
  };
  input('transfer-folder').addEventListener('change', () => { input('transfer-zip').value = ''; void load(() => fromFolder([...(input('transfer-folder').files || [])])); });
  input('transfer-zip').addEventListener('change', () => { input('transfer-folder').value = ''; const f = input('transfer-zip').files?.[0]; if (f) void load(() => fromZip(f)); });

  go.addEventListener('click', async () => {
    if (busy || !planned || !canWrite()) return;
    busy = true; go.hidden = true;
    const p = planned, byPath = new Map(items.map(i => [i.path, i]));
    const get = (/** @type {string} */ from) => /** @type {Item} */ (byPath.get(from)).read();
    try {
      const dec = new TextDecoder();
      msg.textContent = 'Importing notes…';
      const notes = [];
      for (const n of p.notes) notes.push({ title: n.title, path: n.path, body: dec.decode(await get(n.from)) });
      let bad = await app.importNotes(notes);
      let done = 0;
      for (const f of p.files) {
        msg.textContent = `Importing files… ${done}/${p.files.length}`;
        const bytes = await get(f.from);
        if (await app.importFile(new Blob([bytes.slice().buffer], { type: typeOf(f.name) }), f.name, f.path)) bad++;
        done++;
      }
      const text = `Imported ${p.notes.length} notes and ${p.files.length} files` + (bad ? `; ${bad} could not be saved` : '');
      msg.textContent = text; toast(text); items = []; planned = null; plan.textContent = ''; skipped.replaceChildren();
    } catch (e) { msg.textContent = /** @type {Error} */ (e).message; go.hidden = false; } finally { busy = false; }
  });

  $('transfer-export').addEventListener('click', async () => {
    if (busy) return;
    busy = true; msg.textContent = 'Making the zip…';
    try {
      const { zipSync } = await import('fflate');
      const enc = new TextEncoder();
      /** @type {Record<string, Uint8Array>} */ const out = {};
      let missing = 0;
      for (const f of exportFiles(app.notes(), app.attachments().filter(a => a.state === 'stored' || !a.state))) {
        if ('text' in f) out[f.path] = enc.encode(f.text);
        else { try { out[f.path] = await app.attachmentBytes(f.att); } catch { missing++; } }
      }
      const blob = new Blob([zipSync(out, { level: 0 }).slice().buffer], { type: 'application/zip' });
      download(blob, 'notes-export.zip');
      msg.textContent = `Exported ${Object.keys(out).length} files` + (missing ? `; ${missing} could not be fetched` : '');
    } catch (e) { msg.textContent = /** @type {Error} */ (e).message; } finally { busy = false; }
  });

  $('transfer-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('close', reset);
  return { open: () => { reset(); sheet.showModal(); } };
}

