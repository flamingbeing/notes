// The Haiku tab (#haiku, the owner and admins only): pick a prompt, paste text, Run, and the box's text is replaced by
// Claude Haiku's reply (POST /api/haiku, worker/haiku.js); Undo puts the text from before back, Copy copies the box.
// The prompts are notes in the Prompts folder (prompts.js), synced and edited like any note. The text itself is never
// saved: not a note, not the cloud, not this device's storage; it lives in the box until the page goes. Only the last
// picked prompt is remembered on this device. On a tablet or laptop the side bar's Haiku opens it as a side panel (the
// body moves in and back out, as Settings does).
import { $, dialog } from '../shell/dom.js';
import { sdk } from '../cloud.js';
import { BUILT_IN, FOLDER, promptNotes, promptText } from './prompts.js';

const PICKED = 'notes-haiku-prompt';
const remembered = () => { try { return localStorage.getItem(PICKED) || ''; } catch { return ''; } };
const remember = (/** @type {string} */ id) => { try { localStorage.setItem(PICKED, id); } catch { /* private window */ } };

/**
 * @param {import('../cloud.js').Started} app
 * @param {(message: string) => unknown} toast
 * @param {(note: import('../cloud.js').Note) => unknown} openNote
 */
export function haikuTab(app, toast, openNote) {
  const pick = /** @type {HTMLSelectElement} */ ($('haiku-prompt'));
  const box = /** @type {HTMLTextAreaElement} */ ($('haiku-text'));
  const msg = $('haiku-msg'), run = /** @type {HTMLButtonElement} */ ($('haiku-run')), undo = $('haiku-undo'), spin = $('haiku-spin');
  const panel = dialog('haiku-panel'), body = $('haiku-body'), page = $('haiku');
  /** @type {import('./prompts.js').PromptNote[]} */
  let prompts = [];
  let before = '';   // the text before the last Run, for Undo (in memory only)

  const chosen = () => prompts.find(p => p.id === pick.value) || (prompts.length ? prompts[0] : BUILT_IN);
  /** the picker, from the notes in Prompts/ (or the built-in prompt while there are none) @param {any[]} notes */
  const fill = notes => {
    const next = promptNotes(notes);
    const want = pick.value || remembered();
    const same = pick.options.length > 0 && next.length === prompts.length && next.every((p, i) => p.id === prompts[i].id && p.title === prompts[i].title);
    prompts = next;
    if (!same) {
      const list = prompts.length ? prompts : [BUILT_IN];
      pick.replaceChildren(...list.map(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = String(p.title || '') || 'Untitled'; return o; }));
      pick.value = list.some(p => p.id === want) ? want : list[0].id;
    }
    $('haiku-edit').hidden = !prompts.length;
  };
  pick.addEventListener('change', () => remember(pick.value));

  const leave = () => { if (panel.open) panel.close(); };
  $('haiku-edit').addEventListener('click', () => {
    const p = chosen();
    const note = p.id ? app.notes().find(n => n.id === p.id) : null;
    if (note) { leave(); openNote(note); }
  });
  $('haiku-new').addEventListener('click', async () => {
    const { note, refused } = await app.create({ title: 'New prompt', path: FOLDER, body: '' });
    if (refused) { toast(refused); return; }
    pick.value = note.id; remember(note.id);
    leave(); openNote(note);
  });

  $('haiku-paste').addEventListener('click', async () => {
    try {
      box.value = await navigator.clipboard.readText();
      undo.hidden = true; msg.textContent = '';
    } catch { msg.textContent = 'Couldn’t read the clipboard: paste into the box by hand.'; box.focus(); }
  });
  $('haiku-copy').addEventListener('click', async () => {
    if (!box.value) { msg.textContent = 'Nothing to copy yet.'; return; }
    try { await navigator.clipboard.writeText(box.value); toast('Copied'); } catch { box.select(); msg.textContent = 'Copy it by hand: the text is selected.'; }
  });
  undo.addEventListener('click', () => { box.value = before; undo.hidden = true; msg.textContent = ''; });

  run.addEventListener('click', async () => {
    const text = box.value, p = chosen();
    if (!text.trim()) { msg.textContent = 'Paste some text first.'; return; }
    const prompt = p.id ? promptText(p) : BUILT_IN.body;
    if (!prompt) { msg.textContent = 'This prompt is empty: tap Edit to write it.'; return; }
    msg.textContent = ''; run.disabled = true; spin.hidden = false; box.setAttribute('aria-busy', 'true');
    try {
      const { auth } = await sdk();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in first.');
      const r = await fetch('/api/haiku', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, text }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || typeof out.text !== 'string') throw new Error(out.error || `Refused (${r.status})`);
      before = text; box.value = out.text; undo.hidden = false;
    } catch (e) {
      msg.textContent = e instanceof TypeError ? 'Offline: try again.' : /** @type {Error} */ (e).message;
    } finally { run.disabled = false; spin.hidden = true; box.removeAttribute('aria-busy'); }
  });

  $('open-haiku-w').addEventListener('click', () => { $('haiku-panel-body').append(body); panel.showModal(); });
  panel.addEventListener('close', () => page.append(body));
  $('haiku-close').addEventListener('click', () => panel.close());

  return {
    fill,
    /** shown for the owner and admins only @param {boolean} on */
    allow(on) {
      for (const id of ['open-haiku', 'open-haiku-w']) $(id).hidden = !on;
      if (!on) { leave(); box.value = before = ''; undo.hidden = true; }
    },
  };
}
