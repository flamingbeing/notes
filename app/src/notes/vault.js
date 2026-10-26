// Vault import and export, pure (no DOM, no zip library; tested in app/test/vault.unit.test.mjs).
//
// An Obsidian vault is a folder: `.md` files are notes (the folder is the note's `path`, the file name its title) and
// everything else is an attachment (kept with its folder as `path`). Import never overwrites: a note or file that is
// already in the space (same folder and name) is skipped and listed, so running it twice adds nothing.

import { MAX_BYTES } from './model.js';

export const MAX_FILE_BYTES = 100_000_000;   // the Worker's upload limit (worker/files.js)
export const MAX_ENTRIES = 5000;
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', '.stfolder', '__MACOSX', 'node_modules']);
const SKIP_FILES = /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

/** @typedef {{ path: string, size: number }} Entry  an entry of the folder or zip: its path and byte size */
/** @typedef {{ path: string, name: string, size: number, from: string }} PlanFile */
/** @typedef {{ path: string, title: string, size: number, from: string }} PlanNote */
/** @typedef {{ from: string, why: string }} Skip */

/** a path from a folder or zip -> clean segments, or null if it could escape the vault (zip-slip) or is empty @param {string} p */
export function safeSegments(p) {
  const s = String(p).replace(/\\/g, '/');
  if (/^([a-zA-Z]:|\/)/.test(s) || s.includes('\0')) return null;
  const parts = s.split('/').filter(x => x !== '' && x !== '.');
  if (!parts.length || parts.includes('..')) return null;
  return parts;
}

/**
 * What an import would do: { notes, files, skipped }. `entries`: every file found; `existing`: the space's notes
 * ({ title, path }) and attachments ({ name, path }). A single top folder shared by all entries (a vault zipped as a
 * folder) is dropped, so the notes land at the root, not under the vault's name.
 * @param {Entry[]} entries @param {{ notes: { title: string, path?: string }[], files: { name: string, path?: string }[] }} existing
 * @returns {{ notes: PlanNote[], files: PlanFile[], skipped: Skip[] }}
 */
export function planImport(entries, existing) {
  /** @type {Skip[]} */ const skipped = [];
  /** @type {{ e: Entry, parts: string[] }[]} */ const ok = [];
  if (entries.length > MAX_ENTRIES) return { notes: [], files: [], skipped: [{ from: '(everything)', why: `more than ${MAX_ENTRIES} files` }] };
  for (const e of entries) {
    const parts = safeSegments(e.path);
    if (!parts) { skipped.push({ from: e.path, why: 'unsafe path' }); continue; }
    ok.push({ e, parts });
  }
  const root = ok.length && ok.every(x => x.parts.length > 1 && x.parts[0] === ok[0].parts[0]) ? ok[0].parts[0] : '';
  const haveNote = new Set(existing.notes.map(n => key(n.path ? `${n.path}/${n.title}` : n.title)));
  const haveFile = new Set(existing.files.map(f => key(f.path ? `${f.path}/${f.name}` : f.name)));
  /** @type {PlanNote[]} */ const notes = [];
  /** @type {PlanFile[]} */ const files = [];
  for (const { e, parts: all } of ok) {
    const parts = root ? all.slice(1) : all;
    const from = e.path;
    const name = parts[parts.length - 1], dirs = parts.slice(0, -1);
    if (dirs.some(d => SKIP_DIRS.has(d))) { skipped.push({ from, why: 'app folder' }); continue; }
    if (SKIP_FILES.test(name) || (name.startsWith('.') && !/\.md$/i.test(name))) { skipped.push({ from, why: 'hidden file' }); continue; }
    const path = dirs.join('/');
    if (/\.md$/i.test(name)) {
      const title = name.replace(/\.md$/i, '').trim();
      if (!title) { skipped.push({ from, why: 'no name' }); continue; }
      if (e.size > MAX_BYTES) { skipped.push({ from, why: 'too big for a note' }); continue; }
      const k = key(path ? `${path}/${title}` : title);
      if (haveNote.has(k)) { skipped.push({ from, why: 'already there' }); continue; }
      haveNote.add(k);
      notes.push({ path, title, size: e.size, from });
    } else {
      if (e.size > MAX_FILE_BYTES) { skipped.push({ from, why: 'too big' }); continue; }
      const k = key(path ? `${path}/${name}` : name);
      if (haveFile.has(k)) { skipped.push({ from, why: 'already there' }); continue; }
      haveFile.add(k);
      files.push({ path, name, size: e.size, from });
    }
  }
  return { notes, files, skipped };
}

/** @param {string} s */
const key = s => s.toLowerCase();

/** the dry-run line: "3 notes, 2 files; 4 skipped (2 already there, 2 app folder)" @param {{ notes: unknown[], files: unknown[], skipped: Skip[] }} plan */
export function summary(plan) {
  const n = plan.notes.length, f = plan.files.length, s = plan.skipped.length;
  const why = new Map();
  for (const x of plan.skipped) why.set(x.why, (why.get(x.why) || 0) + 1);
  const plural = (/** @type {number} */ c, /** @type {string} */ w) => `${c} ${w}${c === 1 ? '' : 's'}`;
  return `${plural(n, 'note')}, ${plural(f, 'file')}` + (s ? `; ${s} skipped (${[...why].map(([w, c]) => `${c} ${w}`).join(', ')})` : '');
}

/** a note's file name in an export: `Title.md`, with characters a file system refuses replaced @param {string} title */
export const fileNameFor = title => (title.replace(/[\\/:*?"<>|\0]/g, '-').replace(/^\.+/, '').trim() || 'Untitled') + '.md';

/**
 * The files an export holds: { path, text } per note and { path, att } per attachment, each at its folder, no two at
 * one path (a clash gets " (2)"). @template {{ name: string, path?: string }} A
 * @param {{ title: string, path?: string, body: string }[]} notes @param {A[]} atts
 * @returns {({ path: string, text: string } | { path: string, att: A })[]}
 */
export function exportFiles(notes, atts) {
  const used = new Set();
  /** @param {string} dir @param {string} name */
  const place = (dir, name) => {
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let p = dir ? `${dir}/${name}` : name;
    for (let i = 2; used.has(key(p)); i++) p = (dir ? dir + '/' : '') + `${stem} (${i})${ext}`;
    used.add(key(p));
    return p;
  };
  const cleanDir = (/** @type {string | undefined} */ d) => (d || '').split('/').map(x => x.replace(/[\\:*?"<>|\0]/g, '-')).filter(x => x && x !== '.' && x !== '..').join('/');
  return [
    ...notes.map(n => ({ path: place(cleanDir(n.path), fileNameFor(n.title)), text: n.body })),
    ...atts.map(a => ({ path: place(cleanDir(a.path), a.name.replace(/[\\/]/g, '-')), att: a })),
  ];
}

