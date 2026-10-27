// Google Drive (#drive): a Markdown copy of the open space in the person's own Drive, one file per note in Notes/<space>/.
// Off until turned on (the device's driveOn option); the Google permission is asked by popup on the tap that turns it on
// and again, the same way, after an hour. Syncing happens only on a tap of "Sync now". The work is @core/drive.
import { driveToken, driveRemote, runSync, idbStore } from '@core/drive';
import { $, dialog } from '../shell/dom.js';
import { merge3 } from '../notes/merge3.js';
import { sdk } from '../cloud.js';

/**
 * @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast
 * @param {() => import('../cloud.js').OpenSpace | undefined} space  the open space
 */
export function driveSheet(app, toast, space) {
  const sheet = dialog('drive');
  const msg = $('drive-msg'), on = $('drive-on'), off = $('drive-off'), sync = $('drive-sync'), intro = $('drive-intro'), last = $('drive-last');
  const store = idbStore('notes-drive');
  /** @type {ReturnType<typeof driveToken> | null} */ let token = null;
  let busy = false;

  const isOn = () => !!app.settings.get('driveOn');
  const draw = () => {
    intro.hidden = isOn();
    on.hidden = isOn();
    off.hidden = sync.hidden = !isOn();
    const at = Number(localStorage.getItem(lastKey()) || 0);
    last.textContent = isOn() && at ? `Last synced ${new Date(at).toLocaleString()}` : '';
  };
  const lastKey = () => `drive-last:${app.auth.user()?.uid || ''}:${space()?.id || ''}`;
  const getToken = async () => {
    if (!token) { const { A, auth, emulator } = await sdk(); token = driveToken({ A, auth, emulator }); }
    return token;
  };
  /** @param {() => Promise<void>} fn */
  const guarded = async fn => {
    if (busy) return;
    busy = true; msg.textContent = '';
    try { await fn(); } catch (e) { msg.textContent = /** @type {Error} */ (e).message; } finally { busy = false; draw(); }
  };

  on.addEventListener('click', () => guarded(async () => {
    await (await getToken()).get();   // first, while the tap still counts for the popup
    await app.settings.set('driveOn', true);
    toast('Google Drive is on');
  }));
  off.addEventListener('click', () => guarded(async () => { await app.settings.set('driveOn', false); toast('Google Drive is off'); }));
  sync.addEventListener('click', () => guarded(async () => {
    const sp = space(), uid = app.auth.user()?.uid;
    if (!sp || !uid) throw new Error('Open a space first.');
    const t = await getToken();
    await t.get();   // asks now, from the tap, if the hour is up
    const remote = driveRemote({ token: () => t.get(), forget: t.forget });
    msg.textContent = 'Syncing…';
    const r = await runSync({
      notes: app.notes().map(n => ({ id: n.id, title: n.title, body: n.body, path: n.path })),
      space: sp.name, scope: `${uid}:${sp.id}`, remote, store, merge: merge3,
      onProgress: (done, of) => { if (of) msg.textContent = `Syncing… ${done}/${of}`; },
    });
    if (!r.stopped) localStorage.setItem(lastKey(), String(Date.now()));
    const bits = [`${r.written} written`, r.merged && `${r.merged} merged with edits made in Drive`, r.conflicts && `${r.conflicts} with a clash marked in the file`, r.failed.length && `${r.failed.length} failed (${r.failed[0].title}: ${r.failed[0].error})`];
    msg.textContent = r.stopped || bits.filter(Boolean).join('; ') + '.';
    if (!r.stopped && !r.failed.length) toast(r.written ? `Synced ${r.written} to Drive` : 'Drive is up to date');
  }));

  $('drive-close').addEventListener('click', () => sheet.close());
  app.settings.watch('driveOn', () => { if (sheet.open) draw(); });
  return { open: () => { msg.textContent = ''; draw(); sheet.showModal(); } };
}
