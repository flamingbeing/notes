// Sign-in, roles and sync for the app, on the shared engine's modules: createApp({ config, modules: [auth(), sync(),
// update()] }) from app-sync (an exact version from core.anawj.com, named once in index.html's import map).
//
// Firestore layout (rules in firestore.app.rules):
//   members/{uid}              { role: admin | member | viewer, v }   the role doc (source of truth; admins change it
//                              through the Worker's /api/members/, which revokes a removed person's access)
//   spaces/{s}                 { name, owner, members: { uid: owner | edit | view }, memberIds, emails, invited }
//                              a shared space (written only by the Worker, worker/spaces.js; spaces.js here lists them)
//   spaces/{s}/notes/{id}      { path, title, body, links, tags, aliases, daily?, updatedAt, serverAt, _edits }
//                              a note (notes/model.js); s is the person's uid (their vault) or a shared space's id
//   spaces/{s}/bin/{coll:id}   { id, kind, data, deletedAt, … }       a deleted note's last version (delete to bin)
//   spaces/{s}/files/{id}      { name, type, size, w?, h?, thumb?, taken?, state, item? }  a photo or file (S4)
//                              (@core/files: its bytes are in the Worker's R2 bucket under <s>/<id>, worker/files.js)
//   spaces/{s}/settings/{uid}  the person's account options (@core/settings)
//
// One space is open at a time (app-sync's scope): the one last open on this device for this account (the vault at
// first). switchTo() sends every unsent save first and refuses while any are left (an account switch wipes only the
// open scope's outbox safely); the other shared spaces are read-only watches, for [[Space/Note]] links and so a space
// the person was taken out of leaves this device. Account options always save to the vault (kinds.settings).
//
// Roles reach the rules as custom claims ({ g: { _: role }, v }), a cache of the role doc: the Worker's /api/claims
// writes them. The auth module reads the role doc live (claims.watch) and asks for new claims whenever its v is ahead
// of the token's; the page then shows what the token says.
//
// Every save goes to a durable outbox first (the sync module's write queue), then to the server in a transaction; a
// note saved on another device meanwhile is merged line by line (notes/model.js mergeNote); lines changed on both
// sides keep the other device's text in the note and this device's as a conflict copy (a new note, never lost); one the server refuses
// waits in a list until it is retried or discarded. Sign-out keeps this device's copy and its unsent saves (they send
// when the same account signs in again); another account signing in wipes them first (refused while any are unsent),
// and "Forget this device" wipes them on purpose.
import { createApp } from '@core/app';
import { auth } from '@core/auth';
import { resolveAttachment, uniqueName } from './notes/attach.js';
import { sync, leaveEntry } from '@core/sync';
import { update } from '@core/update';
import { files } from '@core/files';
import { settings } from '@core/settings';
import * as register from 'app-update/register.js';
import { firebaseConfig, APP } from './config.js';
import { emulator, configured, roleOf, needsClaims } from './shell/roles.js';
import { OPTIONS, SETTINGS_COLL } from './settings/options.js';
import { mergeNote, conflictCopy, withDerived, sizeOf, dailyNote } from './notes/model.js';
import { forgetDrive } from '@core/drive';
import { noteOf } from './bin/bin.js';
import { renamePlan, linkIndex } from './notes/links.js';
import { spacesOf, spacesApi, cachedSpaces } from './spaces/spaces.js';

export { usingEmulator } from './shell/roles.js';
export const COLL = 'notes';
/** what the page says when the server refused a save at once (its copy waits in the refused list) */
export const REFUSED = 'The server refused that. A copy is kept in the refused list.';
export const FILES = 'files';

/** @typedef {import('./notes/model.js').Note} Note */
/** @typedef {import('@core/files').FileRecord & { item?: string, path?: string, _deleted?: boolean }} Attachment */
/** @typedef {{ uid: string, email: string, name: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */
/** @typedef {import('./spaces/spaces.js').Space} Space */
/** @typedef {{ id: string, name: string, role: 'owner' | 'edit' | 'view' }} OpenSpace  the vault: id = uid, name '', role owner */
/** @typedef {{ phase: Phase, user?: User, role?: string, space?: OpenSpace, spaces?: Space[] }} State */

/** @type {Promise<{ A: typeof import('firebase/auth'), F: typeof import('firebase/firestore'), auth: any, db: any, emulator: boolean }> | null} */
let fb = null;
// The Firebase SDK, loaded once for every module (the import map names its version).
export function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    // the emulator project is always demo-<name> (tools/fill.mjs keeps it in step with the tests), never the live one
    const cfg = emulator ? { apiKey: 'demo-key', projectId: 'demo-notes', authDomain: 'localhost', appId: 'demo' }
      : { ...firebaseConfig, authDomain: firebaseConfig.authDomain || APP.host };
    const a = app.initializeApp(cfg);
    const auth = A.getAuth(a);
    const db = F.getFirestore(a);   // no SDK offline cache: the engine keeps the device copy and the outbox
    if (emulator) {
      F.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
      A.connectAuthEmulator(auth, `http://127.0.0.1:${emulator.auth}`, { disableWarnings: true });
    }
    return { A, F, auth, db, emulator: !!emulator };
  })();
  fb.catch(() => { fb = null; });
  return fb;
}

// Tests only (?emulator): sign in as a made-up Google account.
/** @param {string} email */
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { A, auth } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })));
}

// This phone's name for the popup and conflict copies ('Phone', 'Tablet', 'Computer'), from the browser.
export function deviceName() {
  try {
    const ua = navigator.userAgent || '';
    return /iPad|Tablet/.test(ua) ? 'Tablet' : /iPhone|Android.*Mobile|Mobile/.test(ua) ? 'Phone' : 'Computer';
  } catch { return ''; }
}

/** @param {Record<string, unknown>} rec */
const binCopy = ({ serverAt, ...rest }) => JSON.parse(JSON.stringify(rest));
// the space last open on this device, per account (a space no longer in the cached list opens the vault)
const OPEN = (/** @type {string} */ uid) => `notes:open:${uid}`;
/** @param {string} uid */
const savedOpen = uid => {
  let s = '';
  try { s = localStorage.getItem(OPEN(uid)) || ''; } catch { /* storage off */ }
  return cachedSpaces(uid).some(x => x.id === s) ? s : uid;
};
/** @param {string} uid @param {string} s */
const keepOpen = (uid, s) => { try { if (s === uid) localStorage.removeItem(OPEN(uid)); else localStorage.setItem(OPEN(uid), s); } catch { /* storage off */ } };
// this device's own lists (switch of account, or "Forget this device")
const forgetLists = async () => {
  try { for (const k of Object.keys(localStorage)) if (/^notes:(spaces|open):/.test(k)) localStorage.removeItem(k); } catch { /* storage off */ }
  await forgetDrive();
};
/**
 * @typedef {object} Hooks
 * @property {(s: State) => void} onState
 * @property {(notes: Note[], changed: Set<string>) => void} onList  the notes as this device has them, with its unsent
 *   saves laid over; changed: the ids whose copy changed since the last call (none the first time)
 * @property {(copy: Note) => void} [onConflict]  a note clashed with another device's edit: this device's text was
 *   saved as this new note
 * @property {(files: Attachment[]) => void} [onFiles]  the open space's attachments changed
 * @property {(name: string) => void} [onRemoved]  the person was taken out of a space (or it was deleted): its notes left
 *   this device
 */
// the time in a conflict copy's title, in SGT (the owner's zone) whatever the device's
/** @param {Date} d */
export const sgtTime = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(',', '');
/** what the page says for a note too big to save */
export const TOO_BIG = 'This note is too big to save (1 MB at most). Split it into smaller notes.';
/** @typedef {NonNullable<Awaited<ReturnType<typeof start>>>} Started */

// start({ canReload }) -> the modules' apis (for the UI kit) and the app's actions, or null when the app isn't set up.
// canReload: with a service worker, the app's own "nothing open" answer for the update's reload (it also waits for
// unsent saves); none: no update module. Nothing shows until follow(hooks).
/** @param {{ canReload?: (() => boolean | Promise<boolean>) | null }} o */
export async function start({ canReload = null }) {
  if (!configured) return null;
  let claimsStatus = 0, unsent = 0;
  // the open space (app-sync's scope): the person's uid (their vault) or a shared space's id
  let space = '';
  /** @type {() => Promise<void>} */
  let show = async () => {};
  /** @type {Hooks | null} */
  let hooks = null;
  const modules = [
    auth({
      // roles: the role doc, read live, against the token's claims; /api/claims writes new ones
      claims: {
        url: '/api/claims', watch: true, doc: (/** @type {User} */ u) => ['members', u.uid],
        behind: (/** @type {any} */ doc, /** @type {any} */ claims) => needsClaims(claims, doc),
        onClaims: (/** @type {{ status: number }} */ { status }) => { if (status) claimsStatus = status; void show(); },
      },
    }),
    sync({
      colls: [COLL, FILES, SETTINGS_COLL], path: (/** @type {string} */ space, /** @type {string} */ coll) => ['spaces', space, coll],
      // account options go to the vault (the doc is named by the uid) whatever space is open
      kinds: { [COLL]: COLL, [FILES]: FILES, [SETTINGS_COLL]: { coll: SETTINGS_COLL, path: (/** @type {string} */ _s, /** @type {string} */ coll, /** @type {any} */ r) => ['spaces', r.id, coll] } },
      scope: (/** @type {User} */ u) => (space = savedOpen(u.uid)), device: deviceName(), wake: true,
      forget: { extra: forgetLists },
      // a delete writes the note's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
      // the other devices drop the note from it, and data keeps the deleted version)
      // merge: notes merge line by line (mergeNote; a clash is kept as a conflict, which follow() turns into a copy)
      // held: (settings and files) a same-field clash is kept on the phone that made the save until its person chooses (never overwritten);
      // edits: each write records who changed each field and when, for the popup
      // commitRetry: a send refused with permission-denied just after sign-in (the role check still catching up) is tried
      // once more after 500 ms, as app-sync advises for rules that read a document another write is creating
      backend: { merge: { [COLL]: mergeNote }, stampMode: 'server', writeId: false, held: true, edits: '_edits', commitRetry: { codes: ['permission-denied'], delay: 500 },
        onCommit: (/** @type {any} */ { scope, coll, before, after, at, fields }) => (coll === COLL || coll === FILES) && !after && before
          ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [] },
      hub: { bin: 'bin' }, stores: { metaOnly: ['bin'] },
      // a save the server refused is set aside (kept, with its code) until the person retries or discards it
      onRefused: () => 'archive',
    }),
    // photos and files (S4 attaches them to notes): the records sync in FILES, the bytes go to /api/files (in the
    // space, like the notes; the date a photo was taken is kept, its place is not)
    files({ collection: FILES, scope: (/** @type {{ uid: string }} */ u) => space || u.uid, exif: true }),
    settings({ options: OPTIONS, collection: SETTINGS_COLL, scope: (/** @type {{ uid: string }} */ u) => u.uid }),
    ...(canReload ? [update({ register, app: 'app', sw: 'sw.js', canReload })] : []),
  ];
  const app = createApp({ config: { name: APP.name, sdk }, modules });
  await app.ready;
  const { auth: fa } = await sdk();

  app.status$((/** @type {{ unsent: number }} */ st) => { unsent = st.unsent; });

  /** @type {(() => void) | null} */
  let offList = null;
  /** @type {Attachment[]} the open space's attachments, as this device has them */
  let atts = [];
  /** @type {(() => void) | null} */
  let offFiles = null;
  let seq = 0;
  // the token Firestore has been told about: its own token listener (added when the SDK started, so before this one)
  // runs in the same notification and restarts its connection with the new token. A list listen sent before that goes
  // out with the old token, the rules refuse it, and the engine doesn't listen again; so the list waits for this.
  let tokenSeen = '';
  fa.onIdTokenChanged(async (/** @type {any} */ u) => { tokenSeen = u ? await u.getIdToken().catch(() => '') : ''; void show(); });
  /** @type {(() => void) | null} */
  let offSettings = null;
  const stopList = () => { offList?.(); offList = null; offFiles?.(); offFiles = null; atts = []; };
  const attachmentsOf = (/** @type {string} */ noteId) => atts.filter(a => a.item === noteId);
  // the token as it is now decides what the page shows (after sign-in, and after every claims ask); the newest call wins
  /** @type {Note[]} */
  let notes = [];
  /** @type {ReturnType<typeof linkIndex>} the open space's links and backlinks, rebuilt with each list */
  let index = linkIndex([]);
  let uid = '';
  // the spaces the person is in (a live list), and a read-only watch of each one not open: its notes, for links
  /** @type {ReturnType<typeof spacesOf> | null} */
  let mine = null;
  /** @type {Space[]} */
  let spaces = [];
  /** @type {Map<string, { off: () => void, notes: Note[], index: ReturnType<typeof linkIndex> }>} */
  const others = new Map();
  const api = spacesApi(sdk);
  /** @returns {OpenSpace} */
  const openSpace = () => {
    if (space === uid) return { id: uid, name: '', role: 'owner' };
    const sp = spaces.find(x => x.id === space);
    return { id: space, name: sp?.name || '', role: sp?.role || 'view' };
  };
  const watchOthers = () => {
    for (const [sid, w] of others) if (sid === space || !spaces.some(x => x.id === sid)) { w.off(); others.delete(sid); }
    for (const sp of spaces) {
      if (sp.id === space || others.has(sp.id)) continue;
      const w = { off: () => {}, notes: /** @type {Note[]} */ ([]), index: linkIndex([]) };
      others.set(sp.id, w);
      w.off = app.sync.watch(sp.id, COLL, (/** @type {Note[]} */ list) => { w.notes = list.filter(x => !x._deleted); w.index = linkIndex(w.notes); });
    }
  };
  const stopSpaces = () => { mine?.stop(); mine = null; for (const w of others.values()) w.off(); others.clear(); spaces = []; };
  // taken out of a space (or it was deleted): its notes leave this device; the open one gives way to the vault
  // (called before watchOthers stops the removed spaces' watches: their note ids are taken first)
  /** @param {string[]} removed @param {Space[]} before */
  const leave = async (removed, before) => {
    const held = new Map(removed.map(sid => [sid, others.get(sid)?.notes.map(n => n.id) || []]));
    for (const sid of removed) {
      const name = before.find(x => x.id === sid)?.name || 'a space';
      let ids = held.get(sid) || [];
      if (sid === space) {
        ids = notes.map(n => n.id);
        // its unsent notes and files can never be sent now (account options go to the vault: they stay)
        for (const x of app.sync.queue.entries()) if ((x.kind === COLL || x.kind === FILES) && x.state !== 'synced' && x.state !== 'archived') await app.sync.queue.discard(x.key).catch(() => {});
        await go(uid);
      }
      others.get(sid)?.off(); others.delete(sid);
      await app.sync.hub.drop(sid, COLL, ids);
      hooks?.onRemoved?.(name);
    }
  };
  // a note's save that clashed with another device's edit (state conflict): this device's newest text for it is saved
  // as a conflict copy, then its saves are set aside, so the note shows the other device's text (never resent: a
  // resend would merge into it as new lines). The copy's id comes from the save's key: a retry makes no second copy.
  let copying = false;
  const copyConflicts = async () => {
    if (copying || !space) return;
    copying = true;
    try {
      for (const c of app.sync.conflicts(COLL)) {
        const chain = app.sync.queue.entries().filter((/** @type {any} */ x) => x.kind === COLL && x.record?.id === c.id && (x.state === 'conflict' || x.state === 'pending'));
        const last = chain[0];   // entries() is newest first
        if (!last) continue;
        const copy = conflictCopy(/** @type {Note} */ (last.record), { key: c.key, device: deviceName(), at: sgtTime(new Date(c.at || Date.now())) });
        await app.sync.save(COLL, space, copy, null).catch(() => {});
        await app.sync.queue.archive(last.key);
        hooks?.onConflict?.(copy);
      }
    } finally { copying = false; }
  };
  app.sync.queue.onChange(() => { void copyConflicts(); });
  // open another space (no checks: switchTo checks)
  /** @param {string} sid */
  const go = async sid => {
    stopList(); notes = []; index = linkIndex([]);
    space = sid; keepOpen(uid, sid);
    await app.sync.open(sid);
    watchOthers();
    await show();
  };
  show = async () => {
    if (!hooks) return;
    const { onState, onList } = hooks;
    const n = ++seq, u = fa.currentUser, me = app.auth.user();
    if (!u || !me || me.uid !== u.uid) { stopList(); offSettings?.(); offSettings = null; stopSpaces(); uid = ''; space = ''; onState({ phase: 'signed-out' }); return; }
    if (claimsStatus === 503) { onState({ phase: 'not-set-up' }); return; }
    const t = await u.getIdTokenResult(), role = roleOf(t.claims);
    if (n !== seq) return;
    if (role && t.token !== tokenSeen) return;   // a new token Firestore hasn't seen yet: onIdTokenChanged calls back
    const user = { uid: me.uid, email: me.email, name: me.name };
    if (!role) { stopList(); offSettings?.(); offSettings = null; stopSpaces(); onState({ phase: 'no-access', user, role: '' }); return; }
    if (uid !== me.uid) {
      stopList(); stopSpaces(); uid = me.uid;
      if (!space) space = savedOpen(uid);
    }
    mine ??= spacesOf({ sdk, uid, onList: (list, { removed }) => {
      const before = spaces;
      spaces = list;
      if (removed.length) void leave(removed, before);
      watchOthers();
      void show();
    } });
    onState({ phase: 'ready', user, role, space: openSpace(), spaces });
    offSettings ??= app.settings.follow();   // the account's options, heard from other devices (listening needs the role)
    let first = true;
    offList ??= app.sync.watch(space, COLL, (/** @type {Note[]} */ list, /** @type {{ changed?: string[] }} */ meta) => {
      notes = list.filter(x => !x._deleted);
      index = linkIndex(notes);
      onList(notes, new Set(first ? [] : meta?.changed || []));
      first = false;
    });
    offFiles ??= app.sync.watch(space, FILES, (/** @type {Attachment[]} */ list) => { atts = list.filter(x => !x._deleted); hooks?.onFiles?.(atts); });
    void copyConflicts();
  };
  app.auth.onUser(() => { claimsStatus = 0; void show(); });

  /** @param {string} method @param {string} uid @param {unknown} [body] @returns {Promise<string>} */
  const membersCall = async (method, uid, body) => {
    try {
      const token = await fa.currentUser?.getIdToken();
      if (!token) return 'Sign in first.';
      const r = await fetch(`/api/members/${encodeURIComponent(uid)}`, { method, headers: { Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return r.ok ? '' : (await r.json().catch(() => ({}))).error || `Refused (${r.status})`;
    } catch { return 'Offline: try again.'; }
  };
  /** @param {Promise<unknown>} saving */
  const refusal = saving => saving.then(() => '', e => (e instanceof Error && e.message) || 'The server refused it');
  /** @param {Note} record @param {Note | null} base -> '' or why not */
  const put = (record, base) => {
    const r = withDerived(record);
    return sizeOf(r.body) === 'too-big' ? Promise.resolve(TOO_BIG) : refusal(app.sync.save(COLL, space, r, base));
  };
  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  /** saves in rounds of 50 @param {Note[]} list @returns {Promise<number>} how many were not saved */
  const saveRounds = async list => {
    let refused = 0;
    for (let i = 0; i < list.length; i += 50) {
      const part = list.slice(i, i + 50);
      const recs = part.map(n => withDerived(n)).filter(r => sizeOf(r.body) !== 'too-big');
      refused += part.length - recs.length;
      const done = await app.sync.saveMany(COLL, space, recs);
      refused += done.filter((/** @type {{ status: string }} */ r) => r.status === 'rejected').length;
    }
    return refused;
  };
  return {
    // the modules' apis, for the UI kit's parts (update: with a service worker only, else null)
    auth: app.auth, sync: app.sync, settings: app.settings, update: app.update || null, files: app.files,
    // the whole app's status (sync and files): { state, count, unsent }
    /** @param {(st: { state: string, count: number, unsent: number }) => void} fn */
    status$: fn => app.status$(fn),
    // from now on: onState with what the page shows, onList with the notes once they are shown
    /** @param {Hooks} h */
    follow(h) { hooks = h; void show(); },
    /** the notes as last shown */
    notes: () => notes,
    // Saves resolve to '' when stored or queued, or to the reason when refused at once (app-sync rejects then; the copy
    // waits in the refused list, so the page says so rather than fail) or too big.
    // a new note: { note, refused } (refused: '' or why not)
    /** @param {{ title: string, body?: string, path?: string }} n @returns {Promise<{ note: Note, refused: string }>} */
    async create(n) {
      const note = withDerived({ id: id(), title: n.title, body: n.body || '', path: n.path || '' });
      return { note, refused: await put(note, null) };
    },
    // base: the copy the edit started from (the merge's base)
    /** @param {Note} note @param {Partial<Note>} patch @returns {Promise<string>} */
    edit: (note, patch) => put({ ...note, ...patch }, note),
    // a new title, and every [[link]] to the old one in this space rewritten (the old title kept as an alias); patch:
    // the note's other edits, saved with it
    /** @param {Note} note @param {string} title @param {Partial<Note>} [patch] @returns {Promise<string>} */
    async rename(note, title, patch = {}) {
      const edited = withDerived({ ...note, ...patch });
      if (sizeOf(edited.body) === 'too-big') return TOO_BIG;
      const plan = renamePlan(notes.map(n => (n.id === note.id ? edited : n)), edited, title);
      if (!plan.length) return '';
      const [self, ...rest] = plan;
      // this note on its own copy (the base the person started from), the others on theirs
      const mine = await put(self.record, note);
      if (mine) return mine;
      const done = await app.sync.saveMany(COLL, space, rest.map(p => p.record));
      const no = done.find((/** @type {{ status: string }} */ r) => r.status === 'rejected');
      return no ? 'Some links could not be updated; the server refused it.' : '';
    },
    // the note a [[link]] means (title, then alias, then folder/title), or null; the notes linking to a note
    /** @param {string} target @returns {Note | null} */
    find: target => index.resolve(target),
    /** @param {string} noteId @returns {Note[]} */
    backlinks: noteId => index.backlinks(noteId),
    // today's daily note (or the given date's): made if it isn't there, one id per date so two devices make one note
    /** @param {string} iso @param {string} [folder] @returns {Promise<{ note: Note, refused: string }>} */
    async daily(iso, folder = '') {
      const have = notes.find(x => x.id === dailyNote(iso).id);
      if (have) return { note: have, refused: '' };
      const note = dailyNote(iso, folder);
      return { note, refused: await put(note, null) };
    },
    /** @param {Note} note */
    remove: async note => {
      void app.sync.hub.drop(space, COLL, [note.id]);
      await app.sync.save(COLL, space, { id: note.id, _deleted: true }, note);
    },
    // one note, live from the server: cb(note) when its copy changes, cb(null) once the server says it is gone -> stop()
    /** @param {string} noteId @param {(note: Note | null) => void} cb @returns {() => void} */
    watchNote: (noteId, cb) => app.sync.watchDoc(['spaces', space, COLL, noteId], cb),
    // Attachments of the open space: the list, the one a reference means, add (kept on the device at once, uploaded when
    // online), remove, and a URL to show one. add -> { att, refused }: refused is '' or why not
    attachments: () => atts,
    /** @param {string} noteId */
    attachmentsOf,
    /** @param {string} ref @returns {Attachment | null} */
    resolveAttachment: ref => resolveAttachment(atts, ref),
    /** @param {Note} note @param {Blob} file @param {string} name  @returns {Promise<{ att: Attachment | null, refused: string }>} */
    async attach(note, file, name) {
      const named = new File([file], uniqueName(atts, name), { type: file.type });
      try {
        const { record } = await app.files.add(named, { scope: space, extra: { item: note.id } });
        return { att: /** @type {Attachment} */ (record), refused: '' };
      } catch (e) { return { att: null, refused: (e instanceof Error && e.message) || 'The file could not be added' }; }
    },
    // Import: notes saved in rounds of 50 (new ids, so never over an existing note), files kept with their vault folder
    // as `path`. importNotes -> how many were not saved; importFile -> '' or why not
    /** @param {{ title: string, path: string, body: string }[]} list @returns {Promise<number>} */
    importNotes: list => saveRounds(list.map(n => ({ id: id(), title: n.title, body: n.body, path: n.path }))),
    // Restore: notes the backup holds that this space does not (their own ids; the caller checked none is here) -> how many were not saved
    /** @param {Record<string, any>[]} list @returns {Promise<number>} */
    addNotes: list => saveRounds(/** @type {Note[]} */ (list)),
    // true once the server's copy has been heard (a restore waits for it: before that the list may be weeks old)
    serverCopyIn: () => !!app.sync.facts().confirmed,
    /** @param {Blob} file @param {string} name @param {string} path @returns {Promise<string>} */
    async importFile(file, name, path) {
      try { await app.files.add(new File([file], name, { type: file.type }), { scope: space, extra: { path } }); return ''; } catch (e) { return (e instanceof Error && e.message) || 'The file could not be added'; }
    },
    // the bytes of an attachment (for an export)
    /** @param {Attachment} a @returns {Promise<Uint8Array>} */
    async attachmentBytes(a) {
      return new Uint8Array(await (await app.files.blob(a.id, { scope: space })).arrayBuffer());
    },
    /** @param {Attachment} a */
    removeAttachment: a => app.files.remove(a, { scope: space }),
    /** @param {Attachment} a @param {boolean} [thumb] */
    attachmentUrl: (a, thumb = false) => app.files.url(a.id, { scope: space, thumb: thumb && !!a.thumb }),
    // Spaces. The open one, and the ones the person is in (as last heard)
    /** @returns {OpenSpace} */
    space: () => openSpace(),
    /** @returns {Space[]} */
    spaces: () => spaces,
    // the person's own notes (their vault): its space id is their uid ('' signed out)
    vault: () => uid,
    // open another space (sid) or the vault (the uid): every unsent save is sent first -> '' or why not
    /** @param {string} sid @returns {Promise<string>} */
    async switchTo(sid) {
      if (!uid || sid === space) return '';
      if (sid !== uid && !spaces.some(x => x.id === sid)) return 'You aren’t in that space.';
      if (!(await app.sync.flush())) return 'Some changes aren’t sent yet; try again when online.';
      await go(sid);
      return '';
    },
    // a [[Space/Note]] link to a note in another space the person is in (the first folder of the link is the space's
    // name) -> { note, space } or null. The open space's own notes come first (app.find).
    /** @param {string} target @returns {{ note: Note, space: string } | null} */
    findElsewhere(target) {
      const cut = target.indexOf('/');
      if (cut < 1) return null;
      const name = target.slice(0, cut).trim().toLowerCase(), rest = target.slice(cut + 1);
      for (const sp of spaces) {
        if (sp.name.trim().toLowerCase() !== name) continue;
        const note = others.get(sp.id)?.index.resolve(rest);
        if (note) return { note, space: sp.id };
      }
      return null;
    },
    // the Worker's calls (only it writes space docs); the list follows by itself
    /** @param {string} name -> '' or why not */
    newSpace: name => api.create(name).then(() => '', e => e.message),
    spacesApi: api,
    // move a note to another space (or the vault): sent first, then moved by the Worker in one commit -> '' or why not
    /** @param {Note} note @param {string} to */
    async move(note, to) {
      if (!(await app.sync.flush())) return 'Some changes aren’t sent yet; try again when online.';
      if (attachmentsOf(note.id).some(a => a.state !== 'stored')) return 'Its attachments are still uploading; try again when they have finished.';
      try { await api.move(space, note.id, to); } catch (e) { return /** @type {Error} */ (e).message; }
      await app.sync.hub.drop(space, COLL, [note.id]);
      return '';
    },
    // The bin: the notes deleted in the last 30 days (a delete writes the entry, onCommit). list -> entries (with docId);
    // restore -> '' or why not (the note comes back with its own id; its entry goes); purge deletes entries for good
    bin: {
      /** @returns {Promise<{ docId: string, id: string, kind?: unknown, deletedAt: number, data?: any }[]>} */
      async list() {
        const { F, db } = await sdk();
        return (await F.getDocs(F.collection(db, 'spaces', space, 'bin'))).docs.map(/** @param {any} d */ d => ({ ...d.data(), docId: d.id }));
      },
      /** @param {Record<string, any>} entry */
      async restore(entry) {
        const note = noteOf(entry, COLL);
        if (!note) return 'That note can’t be restored.';
        if (notes.some(n => n.id === note.id)) {   // already back (restored elsewhere): drop the stale entry, never overwrite
          await this.purge([entry]).catch(() => {});
          return 'That note is already back.';
        }
        const why = await put(/** @type {Note} */ (note), null);
        if (why) return why;
        return await this.purge([entry]).then(() => '', () => 'Restored, but its bin entry could not be removed.');
      },
      /** @param {Record<string, any>[]} entries */
      async purge(entries) {
        const { F, db } = await sdk();
        await Promise.all(entries.map(e => F.deleteDoc(F.doc(db, 'spaces', space, 'bin', e.docId))));
      },
    },
    // Feedback: messages to the owner in feedback/{id} (any role writes one; admins list and mark them), not synced
    feedback: {
      /** @param {string} text */
      async send(text) {
        const { F, db } = await sdk(), user = app.auth.user();
        if (!user) throw new Error('Sign in first.');
        const fid = id();
        await F.setDoc(F.doc(db, 'feedback', fid), { id: fid, text, uid: user.uid, by: user.email || '', at: Date.now(), done: false });
      },
      /** @returns {Promise<{ id: string, text: string, by: string, at: number, done: boolean }[]>} */
      async list() {
        const { F, db } = await sdk();
        return (await F.getDocs(F.collection(db, 'feedback'))).docs.map(/** @param {any} d */ d => /** @type {{ id: string, text: string, by: string, at: number, done: boolean }} */ (d.data())).sort((/** @type {{ at: number }} */ a, /** @type {{ at: number }} */ b) => b.at - a.at);
      },
      /** @param {string} fid @param {boolean} done */
      async setDone(fid, done) {
        const { F, db } = await sdk();
        await F.updateDoc(F.doc(db, 'feedback', fid), { done });
      },
    },
    // admins: set someone's app role, or remove them (they lose access at once; their sessions end). -> '' or the reason
    members: {
      /** @param {string} uid @param {'admin' | 'member' | 'viewer'} role */
      setRole: (uid, role) => membersCall('PUT', uid, { role }),
      /** @param {string} uid */
      remove: uid => membersCall('DELETE', uid),
    },
    // Sign-out keeps this device's copy and unsent saves. -> how many are still unsent (they send at the next sign-in)
    async signOut() { await app.auth.signOut(); return unsent; },
  };
}
