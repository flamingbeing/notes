// Sign-in, roles and sync for the app, on the shared engine's modules: createApp({ config, modules: [auth(), sync(),
// update()] }) from app-sync (an exact version from core.anawj.com, named once in index.html's import map).
//
// Firestore layout (rules in firestore.app.rules):
//   members/{uid}              { role: admin | member | viewer, v }   the role doc (source of truth; admins write it)
//   spaces/{s}                 { name, owner, members: { uid: owner | edit | view }, memberIds }  a shared space (S3)
//   spaces/{s}/notes/{id}      { path, title, body, links, tags, aliases, daily?, updatedAt, serverAt, _edits }
//                              a note (notes/model.js); s is the person's uid (their vault) or a shared space's id
//   spaces/{s}/bin/{coll:id}   { id, kind, data, deletedAt, … }       a deleted note's last version (delete to bin)
//   spaces/{s}/files/{id}      { name, type, size, w?, h?, thumb?, taken?, state, item? }  a photo or file (S4)
//                              (@core/files: its bytes are in the Worker's R2 bucket under <s>/<id>, worker/files.js)
//   spaces/{s}/settings/{uid}  the person's account options (@core/settings)
//
// One space is open at a time (app-sync's scope): S1 opens the person's vault at each sign-in; shared spaces come in
// S3 (switching flushes first; other spaces are read-only watches).
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
import { sync, leaveEntry } from '@core/sync';
import { update } from '@core/update';
import { files } from '@core/files';
import { settings } from '@core/settings';
import * as register from 'app-update/register.js';
import { firebaseConfig, APP } from './config.js';
import { emulator, configured, roleOf, needsClaims } from './roles.js';
import { OPTIONS, SETTINGS_COLL } from './options.js';
import { mergeNote, conflictCopy, withDerived, sizeOf, dailyNote } from './notes/model.js';
import { renamePlan } from './notes/links.js';

export { usingEmulator } from './roles.js';
export const COLL = 'notes';
/** what the page says when the server refused a save at once (its copy waits in the refused list) */
export const REFUSED = 'The server refused that. A copy is kept in the refused list.';
export const FILES = 'files';

/** @typedef {import('./notes/model.js').Note} Note */
/** @typedef {import('@core/files').FileRecord & { item?: string, _deleted?: boolean }} Attachment */
/** @typedef {{ uid: string, email: string, name: string }} User */
/** @typedef {'not-set-up' | 'signed-out' | 'no-access' | 'ready'} Phase */
/** @typedef {{ phase: Phase, user?: User, role?: string }} State */

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
/**
 * @typedef {object} Hooks
 * @property {(s: State) => void} onState
 * @property {(notes: Note[], changed: Set<string>) => void} onList  the notes as this device has them, with its unsent
 *   saves laid over; changed: the ids whose copy changed since the last call (none the first time)
 * @property {(copy: Note) => void} [onConflict]  a note clashed with another device's edit: this device's text was
 *   saved as this new note
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
      scope: (/** @type {User} */ u) => u.uid, device: deviceName(), wake: true,
      // a delete writes the note's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
      // the other devices drop the note from it, and data keeps the deleted version)
      // merge: notes merge line by line (mergeNote; a clash is kept as a conflict, which follow() turns into a copy)
      // held: (settings and files) a same-field clash is kept on the phone that made the save until its person chooses (never overwritten);
      // edits: each write records who changed each field and when, for the popup
      // commitRetry: a send refused with permission-denied just after sign-in (the role check still catching up) is tried
      // once more after 500 ms, as app-sync advises for rules that read a document another write is creating
      backend: { merge: { [COLL]: mergeNote }, stampMode: 'server', writeId: false, held: true, edits: '_edits', commitRetry: { codes: ['permission-denied'], delay: 500 },
        onCommit: (/** @type {any} */ { scope, coll, before, after, at, fields }) => coll === COLL && !after && before
          ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [] },
      hub: { bin: 'bin' }, stores: { metaOnly: ['bin'] },
      // a save the server refused is set aside (kept, with its code) until the person retries or discards it
      onRefused: () => 'archive',
    }),
    // photos and files (S4 attaches them to notes): the records sync in FILES, the bytes go to /api/files (in the
    // space, like the notes; the date a photo was taken is kept, its place is not)
    files({ collection: FILES, scope: (/** @type {{ uid: string }} */ u) => u.uid, exif: true }),
    settings({ options: OPTIONS, collection: SETTINGS_COLL, scope: (/** @type {{ uid: string }} */ u) => u.uid }),
    ...(canReload ? [update({ register, app: 'app', sw: 'sw.js', canReload })] : []),
  ];
  const app = createApp({ config: { name: APP.name, sdk }, modules });
  await app.ready;
  const { auth: fa } = await sdk();

  app.status$((/** @type {{ unsent: number }} */ st) => { unsent = st.unsent; });

  /** @type {(() => void) | null} */
  let offList = null;
  let seq = 0;
  // the token Firestore has been told about: its own token listener (added when the SDK started, so before this one)
  // runs in the same notification and restarts its connection with the new token. A list listen sent before that goes
  // out with the old token, the rules refuse it, and the engine doesn't listen again; so the list waits for this.
  let tokenSeen = '';
  fa.onIdTokenChanged(async (/** @type {any} */ u) => { tokenSeen = u ? await u.getIdToken().catch(() => '') : ''; void show(); });
  /** @type {(() => void) | null} */
  let offSettings = null;
  const stopList = () => { offList?.(); offList = null; offSettings?.(); offSettings = null; };
  // the token as it is now decides what the page shows (after sign-in, and after every claims ask); the newest call wins
  /** @type {Note[]} */
  let notes = [];
  let vault = '';
  // a note's save that clashed with another device's edit (state conflict): this device's newest text for it is saved
  // as a conflict copy, then its saves are set aside, so the note shows the other device's text (never resent: a
  // resend would merge into it as new lines). The copy's id comes from the save's key: a retry makes no second copy.
  let copying = false;
  const copyConflicts = async () => {
    if (copying || !vault) return;
    copying = true;
    try {
      for (const c of app.sync.conflicts(COLL)) {
        const chain = app.sync.queue.entries().filter((/** @type {any} */ x) => x.kind === COLL && x.record?.id === c.id && (x.state === 'conflict' || x.state === 'pending'));
        const last = chain[0];   // entries() is newest first
        if (!last) continue;
        const copy = conflictCopy(/** @type {Note} */ (last.record), { key: c.key, device: deviceName(), at: sgtTime(new Date(c.at || Date.now())) });
        await app.sync.save(COLL, vault, copy, null).catch(() => {});
        await app.sync.queue.archive(last.key);
        hooks?.onConflict?.(copy);
      }
    } finally { copying = false; }
  };
  app.sync.queue.onChange(() => { void copyConflicts(); });
  show = async () => {
    if (!hooks) return;
    const { onState, onList } = hooks;
    const n = ++seq, u = fa.currentUser, me = app.auth.user();
    if (!u || !me || me.uid !== u.uid) { stopList(); vault = ''; onState({ phase: 'signed-out' }); return; }
    if (claimsStatus === 503) { onState({ phase: 'not-set-up' }); return; }
    const t = await u.getIdTokenResult(), role = roleOf(t.claims);
    if (n !== seq) return;
    if (role && t.token !== tokenSeen) return;   // a new token Firestore hasn't seen yet: onIdTokenChanged calls back
    const user = { uid: me.uid, email: me.email, name: me.name };
    if (!role) { stopList(); onState({ phase: 'no-access', user, role: '' }); return; }
    if (vault !== me.uid) { stopList(); vault = me.uid; }
    onState({ phase: 'ready', user, role });
    offSettings ??= app.settings.follow();   // the account's options, heard from other devices (listening needs the role)
    let first = true;
    offList ??= app.sync.watch(vault, COLL, (/** @type {Note[]} */ list, /** @type {{ changed?: string[] }} */ meta) => {
      notes = list.filter(x => !x._deleted);
      onList(notes, new Set(first ? [] : meta?.changed || []));
      first = false;
    });
    void copyConflicts();
  };
  app.auth.onUser(() => { claimsStatus = 0; void show(); });

  /** @param {Promise<unknown>} saving */
  const refusal = saving => saving.then(() => '', e => (e instanceof Error && e.message) || 'The server refused it');
  /** @param {Note} record @param {Note | null} base -> '' or why not */
  const put = (record, base) => {
    const r = withDerived(record);
    return sizeOf(r.body) === 'too-big' ? Promise.resolve(TOO_BIG) : refusal(app.sync.save(COLL, vault, r, base));
  };
  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
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
    /** @param {{ title: string, body?: string, path?: string }} n @returns {Promise<string>} */
    create: n => put({ id: id(), title: n.title, body: n.body || '', path: n.path || '' }, null),
    // base: the copy the edit started from (the merge's base)
    /** @param {Note} note @param {Partial<Note>} patch @returns {Promise<string>} */
    edit: (note, patch) => put({ ...note, ...patch }, note),
    // a new title, and every [[link]] to the old one in this space rewritten (the old title kept as an alias)
    /** @param {Note} note @param {string} title @returns {Promise<string>} */
    async rename(note, title) {
      const plan = renamePlan(notes, note, title);
      if (!plan.length) return '';
      const done = await app.sync.saveMany(COLL, vault, plan.map(p => p.record));
      const no = done.find((/** @type {{ status: string }} */ r) => r.status === 'rejected');
      return no ? 'Some links could not be updated; the server refused it.' : '';
    },
    // today's daily note (or the given date's): made if it isn't there, one id per date so two devices make one note
    /** @param {string} iso @param {string} [folder] @returns {Promise<Note>} */
    async daily(iso, folder = '') {
      const have = notes.find(x => x.id === dailyNote(iso).id);
      if (have) return have;
      const n = dailyNote(iso, folder);
      await put(n, null);
      return n;
    },
    /** @param {Note} note */
    remove: async note => {
      void app.sync.hub.drop(vault, COLL, [note.id]);
      await app.sync.save(COLL, vault, { id: note.id, _deleted: true }, note);
    },
    // one note, live from the server: cb(note) when its copy changes, cb(null) once the server says it is gone -> stop()
    /** @param {string} noteId @param {(note: Note | null) => void} cb @returns {() => void} */
    watchNote: (noteId, cb) => app.sync.watchDoc(['spaces', vault, COLL, noteId], cb),
    // Sign-out keeps this device's copy and unsent saves. -> how many are still unsent (they send at the next sign-in)
    async signOut() { await app.auth.signOut(); return unsent; },
  };
}
