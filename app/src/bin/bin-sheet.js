// The bin (#bin): the notes deleted in the last 30 days, each with Restore and Delete forever. A delete already wrote
// the note's last version to the bin (cloud.js onCommit); this reads those entries, brings one back as the same note, and
// purges what is past 30 days.
import { confirmModal } from '@core/ui';
import { $, dialog } from '../shell/dom.js';
import { COLL } from '../cloud.js';
import { binLabel, sortBin } from './bin.js';

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast @param {() => boolean} canWrite */
export function binSheet(app, toast, canWrite) {
  const sheet = dialog('bin'), items = $('bin-items'), msg = $('bin-msg');

  /** the entries now: the ones to show, with the expired ones purged on the way */
  const load = async () => {
    const { show, purge } = sortBin(await app.bin.list(), COLL);
    if (purge.length && canWrite()) await app.bin.purge(purge).catch(() => {});
    return show;
  };
  const draw = async () => {
    msg.textContent = 'Loading…';
    /** @type {Awaited<ReturnType<typeof load>>} */ let show;
    try { show = await load(); } catch (e) { msg.textContent = `The bin could not be read: ${/** @type {Error} */ (e).message}`; return; }
    items.replaceChildren(...show.map(e => {
      const li = document.createElement('li'), name = document.createElement('span'), when = document.createElement('span');
      name.textContent = e.data.title || 'Untitled'; when.className = 'small'; when.textContent = ` ${binLabel(e)}`;
      li.append(name, when);
      if (canWrite()) li.append(button('Restore', async () => { const why = await app.bin.restore(e); toast(why || 'Restored'); void draw(); }),
        button('Delete forever', async () => {
          if (!await confirmModal('Delete this note for good? It can’t be restored.', { title: 'Delete forever', danger: true, yes: 'Delete' })) return;
          await app.bin.purge([e]); void draw();
        }));
      return li;
    }));
    msg.textContent = show.length ? '' : 'The bin is empty. Deleted notes stay here for 30 days.';
  };
  /** @param {string} label @param {() => Promise<void>} run */
  const button = (label, run) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { b.disabled = true; run().catch(e => { toast(/** @type {Error} */ (e).message); b.disabled = false; }); });
    return b;
  };
  $('bin-close').addEventListener('click', () => sheet.close());
  return { open: () => { sheet.showModal(); void draw(); }, sweep: () => load().catch(() => {}) };
}
