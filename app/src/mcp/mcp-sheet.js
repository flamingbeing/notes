// Connect MCP (#mcp): a code that lets Claude Desktop / Claude Code (the server in mcp/) sign in as this person
// without a Google client. The code is this sign-in's Firebase refresh token with the project id (code.js), shown on a
// tap, copied by hand or by the Copy button, wiped when the sheet closes, and never stored. Disconnect asks the Worker to
// end every sign-in of the account (Firebase cannot end one), then signs this device out. Off until a device turns on
// Settings → Advanced → Connect MCP (the device's mcpOn option).
import { $, dialog } from '../shell/dom.js';
import { sdk } from '../cloud.js';
import { encodeCode } from './code.js';

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast */
export function mcpSheet(app, toast) {
  const sheet = dialog('mcp');
  const msg = $('mcp-msg'), show = $('mcp-show'), copy = $('mcp-copy'), box = /** @type {HTMLTextAreaElement} */ ($('mcp-code')), off = /** @type {HTMLButtonElement} */ ($('mcp-off'));
  let confirming = false;

  const clear = () => { box.value = ''; box.hidden = copy.hidden = true; show.hidden = false; confirming = false; off.textContent = 'Disconnect MCP'; };

  show.addEventListener('click', async () => {
    msg.textContent = '';
    try {
      const { auth } = await sdk();
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in first.');
      box.value = encodeCode({ projectId: auth.app.options.projectId, refreshToken: user.refreshToken });
      box.hidden = copy.hidden = false; show.hidden = true;
      box.focus(); box.select();
    } catch (e) { msg.textContent = /** @type {Error} */ (e).message; }
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(box.value); toast('Code copied'); } catch { box.select(); msg.textContent = 'Copy it by hand: the code is selected.'; }
  });
  off.addEventListener('click', async () => {
    if (!confirming) {   // two taps: this ends every sign-in of the account, this device's included
      confirming = true; off.textContent = 'Tap again: disconnect and sign out everywhere';
      return;
    }
    msg.textContent = ''; off.disabled = true;
    try {
      const { auth } = await sdk();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in first.');
      const r = await fetch('/api/sessions/revoke', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Refused (${r.status})`);
    } catch (e) {
      confirming = false; off.textContent = 'Disconnect MCP';
      msg.textContent = e instanceof TypeError ? 'Offline: try again.' : /** @type {Error} */ (e).message;
      return;
    } finally { off.disabled = false; }
    clear(); sheet.close();
    $('sign-out').click();
    toast('Disconnected. The code no longer works; sign in again here.');
  });

  $('mcp-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('close', clear);
  return { open: () => { msg.textContent = ''; clear(); sheet.showModal(); } };
}
