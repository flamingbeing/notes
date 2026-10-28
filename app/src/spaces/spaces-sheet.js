// Shared spaces on the page: the switcher above the list (#space: the person's own notes, then each space they are in),
// New space (#space-new-sheet), and the members sheet (#space-sheet) for the open space: who is in it and their role,
// invites not yet taken up, invite by email, rename, leave, delete. Only the owner sees the controls that change the
// space (the Worker checks again); every change comes back through the live list of spaces (spaces.js), which redraws.
import { confirmModal } from '@core/ui';
import { $, input, dialog } from '../shell/dom.js';

/** @typedef {import('../cloud.js').State} State */
/** @typedef {import('./spaces.js').Space} Space */

const ROLE_WORDS = /** @type {Record<string, string>} */ ({ owner: 'owner', edit: 'can edit', view: 'can view' });
const opt = (/** @type {string} */ value, /** @type {string} */ label) => Object.assign(document.createElement('option'), { value, textContent: label });

/** @param {import('../cloud.js').Started} app @param {(message: string) => unknown} toast */
export function spacesSheet(app, toast) {
  const sheet = dialog('space-sheet'), make = dialog('space-new-sheet');
  const pick = /** @type {HTMLSelectElement} */ ($('space'));
  const msg = $('space-msg');
  // Members and New space are in the Folders tab (phone) and the side bar (wider)
  const all = (/** @type {string} */ sel) => /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(sel));
  const spaceOpen = all('#space-open, [data-space-open]'), spaceNew = all('#space-new, [data-space-new]');
  let uid = '';
  /** @type {Space | null} the open space (null: the person's own notes) */
  let open = null;

  // an action on the Worker: the sheet says what went wrong, or `done` on success
  /** @param {() => Promise<unknown>} fn @param {string} [done] */
  const act = async (fn, done = '') => {
    msg.textContent = '';
    try { await fn(); if (done) toast(done); return true; } catch (e) { msg.textContent = /** @type {Error} */ (e).message; return false; }
  };
  const button = (/** @type {string} */ label, /** @type {() => void} */ onClick, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  };

  const drawSheet = () => {
    const sp = open;
    if (!sp) { if (sheet.open) sheet.close(); return; }
    const owner = sp.role === 'owner';
    $('space-title').textContent = sp.name || 'Space';
    $('space-rename').hidden = !owner;
    if (owner && document.activeElement !== input('space-name')) input('space-name').value = sp.name;
    $('space-invite').hidden = !owner;
    $('space-leave').hidden = owner;
    $('space-delete').hidden = !owner;
    const people = Object.entries(sp.members).sort(([a, ra], [b, rb]) => (ra === 'owner' ? -1 : rb === 'owner' ? 1 : (sp.emails[a] || a).localeCompare(sp.emails[b] || b)));
    $('space-people').replaceChildren(...people.map(([who, role]) => {
      const li = document.createElement('li'), name = document.createElement('span');
      name.textContent = `${sp.emails[who] || who}${who === uid ? ' (you)' : ''}`;
      li.append(name);
      if (owner && role !== 'owner') {
        const sel = /** @type {HTMLSelectElement} */ (document.createElement('select'));
        sel.setAttribute('aria-label', `Role of ${sp.emails[who] || who}`);
        sel.append(opt('edit', ROLE_WORDS.edit), opt('view', ROLE_WORDS.view));
        sel.value = role;
        sel.addEventListener('change', () => void act(() => app.spacesApi.setRole(sp.id, who, sel.value), 'Role changed').then(ok => { if (!ok) sel.value = role; }));
        li.append(sel, button('Remove', async () => {
          if (!await confirmModal(`Take ${sp.emails[who] || 'them'} out of “${sp.name}”? The space’s notes leave their devices.`, { title: 'Remove', danger: true, yes: 'Remove' })) return;
          await act(() => app.spacesApi.removeMember(sp.id, who), 'Removed');
        }, 'danger'));
      } else {
        const r = document.createElement('span');
        r.className = 'small'; r.textContent = ROLE_WORDS[role] || role;
        li.append(r);
      }
      return li;
    }));
    const pending = Object.entries(sp.invited || {});
    $('space-pending').replaceChildren(...pending.map(([key, inv]) => {
      const li = document.createElement('li'), name = document.createElement('span');
      name.textContent = `${inv.email} (${ROLE_WORDS[inv.role] || inv.role}, joins at first sign-in)`;
      li.append(name);
      if (owner) li.append(button('Take back', () => void act(() => app.spacesApi.uninvite(sp.id, key), 'Invite taken back')));
      return li;
    }));
    $('space-pending-box').hidden = pending.length === 0;
  };

  /** the page's state: the switcher and (when open) the members sheet follow it @param {State} s */
  const draw = s => {
    uid = s.user?.uid || '';
    const spaces = s.spaces || [], here = s.space?.id || uid;
    open = spaces.find(x => x.id === here) || null;
    pick.replaceChildren(opt(uid, 'My notes'), ...spaces.map(x => opt(x.id, x.role === 'view' ? `${x.name} (view only)` : x.name)));
    pick.value = here;
    pick.hidden = spaces.length === 0;
    for (const b of spaceOpen) b.hidden = !open;
    for (const b of spaceNew) b.hidden = !(s.role === 'admin' || s.role === 'member');
    if (sheet.open) drawSheet();
  };

  pick.addEventListener('change', async () => {
    const was = app.space().id, why = await app.switchTo(pick.value);
    if (why) { toast(why); pick.value = was; }
  });
  for (const b of spaceOpen) b.addEventListener('click', () => { msg.textContent = ''; drawSheet(); sheet.showModal(); });
  $('space-close').addEventListener('click', () => sheet.close());

  for (const b of spaceNew) b.addEventListener('click', () => { input('space-new-name').value = ''; $('space-new-msg').textContent = ''; make.showModal(); });
  $('space-new-form').addEventListener('submit', async e => {
    if (/** @type {SubmitEvent} */ (e).submitter?.id !== 'space-new-make') return;
    e.preventDefault();
    const name = input('space-new-name').value.trim();
    if (!name) return;
    const why = await app.newSpace(name);
    if (why) { $('space-new-msg').textContent = why; return; }
    make.close();
    toast(`Made “${name}”. Choose it above to open it.`);
  });

  $('space-rename').addEventListener('submit', e => {
    e.preventDefault();
    const name = input('space-name').value.trim();
    if (open && name && name !== open.name) void act(() => app.spacesApi.rename(/** @type {Space} */ (open).id, name), 'Renamed');
  });
  $('space-invite').addEventListener('submit', async e => {
    e.preventDefault();
    if (!open) return;
    const sid = open.id, email = input('invite-email').value.trim(), role = /** @type {HTMLSelectElement} */ ($('invite-role')).value;
    /** @type {{ added?: string, pending?: boolean }} */
    let r = {};
    if (await act(async () => { r = await app.spacesApi.invite(sid, email, role); })) {
      input('invite-email').value = '';
      toast(r.pending ? `Invited; ${email} joins at their first sign-in.` : `${email} is in.`);
    }
  });
  $('space-leave').addEventListener('click', async () => {
    const sp = open;
    if (!sp || !await confirmModal(`Leave “${sp.name}”? Its notes leave this device.`, { title: 'Leave space', danger: true, yes: 'Leave' })) return;
    if (await act(() => app.spacesApi.removeMember(sp.id, uid))) sheet.close();
  });
  $('space-delete').addEventListener('click', async () => {
    const sp = open;
    if (!sp || !await confirmModal(`Delete “${sp.name}” and every note and file in it, for everyone? This can’t be undone.`, { title: 'Delete space', danger: true, yes: 'Delete' })) return;
    if (await act(async () => { msg.textContent = 'Deleting…'; await app.spacesApi.remove(sp.id); }, 'Space deleted')) sheet.close();
  });

  return { draw };
}
