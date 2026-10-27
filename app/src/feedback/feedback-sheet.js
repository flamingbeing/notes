// Feedback (#feedback): anyone with a role sends a private message to the owner; admins see the inbox, tick messages off
// and copy one as a to-do line. The messages are plain documents (feedback/{id}), not synced notes.
import { $, input, dialog } from '../shell/dom.js';
import { cleanFeedback, asTask } from './feedback.js';

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast @param {() => boolean} isAdmin */
export function feedbackSheet(app, toast, isAdmin) {
  const sheet = dialog('feedback'), items = $('feedback-items'), msg = $('feedback-msg');

  const draw = async () => {
    $('feedback-inbox').hidden = !isAdmin();
    if (!isAdmin()) return;
    /** @type {Awaited<ReturnType<typeof app.feedback.list>>} */ let list;
    try { list = await app.feedback.list(); } catch (e) { msg.textContent = `The inbox could not be read: ${/** @type {Error} */ (e).message}`; return; }
    items.replaceChildren(...list.map(f => {
      const li = document.createElement('li'), text = document.createElement('span');
      text.textContent = `${f.done ? '✓ ' : ''}${f.text}`; li.append(text);
      for (const [label, run] of /** @type {[string, () => Promise<void>][]} */ ([
        [f.done ? 'Not done' : 'Done', async () => { await app.feedback.setDone(f.id, !f.done); void draw(); }],
        ['Copy as task', async () => { await navigator.clipboard.writeText(asTask(f)); toast('Copied'); }],
      ])) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.addEventListener('click', () => run().catch(e => toast(/** @type {Error} */ (e).message)));
        li.append(b);
      }
      return li;
    }));
  };
  $('feedback-send').addEventListener('click', async () => {
    const text = cleanFeedback(input('feedback-text').value);
    if (!text) { msg.textContent = 'Write something first.'; return; }
    try { await app.feedback.send(text); input('feedback-text').value = ''; msg.textContent = 'Sent. Thank you.'; void draw(); }
    catch (e) { msg.textContent = `Not sent: ${/** @type {Error} */ (e).message}`; }
  });
  $('feedback-close').addEventListener('click', () => sheet.close());
  return { open: () => { msg.textContent = ''; sheet.showModal(); void draw(); } };
}
