// The notes the write tools save, built the way the app builds them (app/src/notes/model.js withDerived: links and
// tags worked out from the body), and the bin entry the app writes when it deletes one. Pure: tests need no network.

import crypto from 'node:crypto';
import { withDerived, sizeOf } from '../../app/src/notes/model.js';
import { keyOf } from '../../app/src/notes/parse.js';

export const TITLE_MAX = 300;   // firestore.app.rules

const stripId = ({ id, serverAt, _updateTime, ...rest }) => rest;
const newId = () => crypto.randomUUID().replace(/-/g, '');

function check(rec) {
  if (!rec.title) throw new Error('A note needs a title.');
  if (rec.title.length > TITLE_MAX) throw new Error(`The title is longer than ${TITLE_MAX} characters.`);
  if (/[\n\r]/.test(rec.title)) throw new Error('A title is one line.');
  if (sizeOf(rec.body) === 'too-big') throw new Error('The note would be over the 1 MiB a note can hold; split it.');
  return rec;
}

/** @param {{ title: string, body?: string, folder?: string }} a @param {number} at -> { id, record } */
export function buildNewNote({ title, body = '', folder = '' }, at) {
  const rec = withDerived({ title, body, path: folder, aliases: [], updatedAt: at });
  return { id: newId(), record: check(/** @type {any} */ (rec)) };
}

// A title is one note's name within a folder ([[links]] and the tools find notes by it), so a second one is refused.
/** @param {any[]} notes @param {string} title @param {string} folder @param {string} [exceptId] */
export function checkTitleFree(notes, title, folder, exceptId) {
  const key = keyOf(title);
  const clash = notes.find(n => n.id !== exceptId && (n.path || '') === folder && keyOf(n.title) === key);
  if (clash) throw new Error(`A note called "${clash.title}" already exists${folder ? ` in "${folder}"` : ' at the top level'} (id ${clash.id}); pick another title or use update_note or append_to_note.`);
}

// text goes on a line of its own after what is there
export const appendedBody = (body, text) => (body && !body.endsWith('\n') ? `${body}\n` : body || '') + text;

/** @param {any} note @param {string} text @param {number} at */
export const buildAppend = (note, text, at) =>
  check(/** @type {any} */ (withDerived({ ...stripId(note), body: appendedBody(note.body, text), updatedAt: at })));

// Overwrite: only what is given changes. A new title keeps the old one as an alias (as the app's rename does), so
// [[links]] written elsewhere still find the note.
/** @param {any} note @param {{ title?: string, body?: string, folder?: string }} change @param {number} at */
export function buildUpdate(note, { title, body, folder }, at) {
  const keep = stripId(note);
  const renamed = title !== undefined && title.trim() !== note.title;
  const aliases = renamed && !(note.aliases || []).includes(note.title) ? [...(note.aliases || []), note.title] : note.aliases || [];
  return check(/** @type {any} */ (withDerived({
    ...keep,
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(folder !== undefined ? { path: folder } : {}),
    aliases, updatedAt: at,
  })));
}

// A deleted note's last version (app/src/cloud.js onCommit): { id: 'notes:<id>', kind, data, deletedAt, updatedAt }
/** @param {any} note @param {number} at */
export function binEntry(note, at) {
  return { id: `notes:${note.id}`, kind: 'notes', data: { id: note.id, ...stripId(note) }, deletedAt: at, updatedAt: at };
}

// Short, exact description of a change for the preview
/** @param {any} note @param {any} rec */
export function describeUpdate(note, rec) {
  const lines = [];
  if (rec.title !== note.title) lines.push(`title: "${note.title}" -> "${rec.title}"`);
  if ((rec.path || '') !== (note.path || '')) lines.push(`folder: "${note.path || ''}" -> "${rec.path || ''}"`);
  if (rec.body !== note.body) lines.push(`text: ${note.body.length} -> ${rec.body.length} characters (the old text is replaced)`);
  return lines.length ? lines.join('\n') : 'nothing changes';
}
