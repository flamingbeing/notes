// Share-in (#share): a share from another app (text, a link, files) arrives through the manifest's share_target; sw.js
// keeps its parts in a cache and sends the page here (?share=1). A chooser: a new note, or added to a note.
import { $, input, dialog } from '../shell/dom.js';
import { parseShare, appendShare } from './share-in.js';

const CACHE = 'share-in';

/** the share waiting in the cache, which is emptied -> { title, text, url, files } or null
 * @returns {Promise<{ fields: Record<string, string>, files: File[] } | null>} */
async function takeShare() {
  if (!globalThis.caches) return null;
  const cache = await caches.open(CACHE);
  const data = await cache.match('/share-in/data');
  if (!data) return null;
  const fields = await data.json();
  const files = [];
  for (const req of await cache.keys()) {
    if (!req.url.includes('/share-in/file-')) continue;
    const res = await cache.match(req);
    if (res) files.push(new File([await res.blob()], decodeURIComponent(res.headers.get('x-name') || 'shared'), { type: res.headers.get('content-type') || '' }));
  }
  await caches.delete(CACHE);
  return { fields, files };
}

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast @param {(note: import('../cloud.js').Note) => void} open */
export function shareSheet(app, toast, open) {
  const sheet = dialog('share'), pick = /** @type {HTMLSelectElement} */ ($('share-note'));
  /** @type {{ title: string, body: string, files: File[] } | null} */ let held = null;

  /** @param {import('../cloud.js').Note} note */
  const attachAll = async note => { for (const f of held?.files || []) await app.attach(note, f, f.name); };
  const finish = (/** @type {import('../cloud.js').Note} */ note, why = '') => { sheet.close(); held = null; toast(why || 'Added'); if (!why) open(note); };

  $('share-new').addEventListener('click', async () => {
    if (!held) return;
    const { note, refused } = await app.create({ title: held.title, body: held.body, path: String(app.settings.get('newFolder') || '') });
    if (!refused) await attachAll(note);
    finish(note, refused);
  });
  $('share-add').addEventListener('click', async () => {
    const note = app.notes().find(n => n.id === pick.value);
    if (!held || !note) return;
    const refused = await app.edit(note, { body: appendShare(note.body, held.body) });
    if (!refused) await attachAll(note);
    finish(note, refused);
  });
  $('share-cancel').addEventListener('click', () => { held = null; sheet.close(); });

  return {
    /** once the notes are in: shows the chooser when the page was opened by a share (?share=1) */
    async check() {
      const url = new URL(location.href);
      if (!url.searchParams.has('share')) return;
      url.searchParams.delete('share');
      history.replaceState(null, '', url);
      const got = await takeShare().catch(() => null);
      if (!got) return;
      if (!app.settings.get('shareIn')) { toast('Receiving shares is off. Turn it on in Settings.'); return; }
      const parsed = parseShare(got.fields);
      held = { ...parsed, files: got.files };
      $('share-text').textContent = [parsed.title, parsed.body, got.files.length ? `${got.files.length} file(s)` : ''].filter(Boolean).join('\n\n');
      pick.replaceChildren(...[...app.notes()].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 500).map(n => new Option(n.title || 'Untitled', n.id)));
      /** @type {HTMLButtonElement} */ ($('share-add')).disabled = !pick.options.length;
      input('share-note').hidden = !pick.options.length;
      sheet.showModal();
    },
  };
}
