// The MCP tools, each a zod input shape and a handler returning text.
// getSource() -> makeNotesSource(...) for the signed-in person (injected, so tests need no network).
// Reading and adding are direct; overwriting and deleting are two calls: without confirm they only show the change.

import { z } from 'zod';
import { filterNotes, formatNoteList, searchNotes, formatSearch, findNote, formatNote, DEFAULT_LIMIT, MAX_LIMIT } from './notes.mjs';
import { buildNewNote, buildAppend, buildUpdate, describeUpdate } from './write.mjs';

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// adds to the notes (a new one, or text on the end of one)
export const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// overwrites or deletes (a delete goes to the bin, so it can be restored in the app)
export const REPLACES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const space = z.string().max(100).optional().describe('A shared space (name or id from list_spaces). Left out: your own notes');
const limit = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Most rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`);
const ref = z.string().min(1).max(500).describe('The note\'s id, or its title (a "folder/Title" when two share one)');
const folder = z.string().max(500).describe('Folder, e.g. "work/ideas" (no leading or trailing slash); empty for the top level');
const confirm = z.boolean().optional().describe('false or left out: only preview, nothing changes. true: do it. Show the preview to the user and confirm only after they agree.');
const PREVIEW = name => `\n\nPreview only: nothing has changed yet. Show this to the user; once they agree, call ${name} again with the same arguments and confirm: true.`;

const STALE = /FAILED_PRECONDITION|ABORTED|ALREADY_EXISTS/;
const changedMeanwhile = e => e && STALE.test(e.code || '');

export function defineTools(getSource, { now = () => Date.now() } = {}) {
  const where = async name => { const src = await getSource(); return { src, sp: await src.resolve(name) }; };

  // the note now stored (one read, with its version); errors name what was asked
  async function stored(src, sp, reference) {
    const found = findNote(await src.notes(sp), reference);
    if (found.error) throw new Error(found.error);
    const current = await src.note(sp, found.note.id);
    if (!current) throw new Error(`The note "${reference}" is gone (deleted since it was listed).`);
    return current;
  }

  return [
    {
      name: 'list_spaces',
      title: 'List spaces',
      description: 'Your own notes and the shared spaces you are in, with your role in each (owner, edit or view).',
      shape: {},
      annotations: READ_ONLY,
      async run() {
        const src = await getSource();
        return (await src.spaces()).map(s => `- ${s.name}${s.vault ? ' (your own notes, the default)' : ` (id ${s.id}, ${s.role})`}`).join('\n');
      },
    },
    {
      name: 'list_notes',
      title: 'List notes',
      description: 'List notes, newest first, optionally one folder (with its subfolders) or one #tag.',
      shape: { space, folder: folder.optional(), tag: z.string().max(100).optional().describe('A tag, with or without #'), limit },
      annotations: READ_ONLY,
      async run(args) {
        const { src, sp } = await where(args.space);
        return formatNoteList(filterNotes(await src.notes(sp), args), `notes in ${sp.name}`);
      },
    },
    {
      name: 'search_notes',
      title: 'Search notes',
      description: 'Find notes whose title, aliases, tags, folder or text contain every word given (any case; "quoted phrase" stays whole). Titles first.',
      shape: { text: z.string().min(1).max(500), space, limit },
      annotations: READ_ONLY,
      async run({ text, space: name, limit: n }) {
        const { src, sp } = await where(name);
        return formatSearch(searchNotes(await src.notes(sp), text, n), text);
      },
    },
    {
      name: 'read_note',
      title: 'Read a note',
      description: 'The full text of one note, by id or title.',
      shape: { note: ref, space },
      annotations: READ_ONLY,
      async run({ note, space: name }) {
        const { src, sp } = await where(name);
        const found = findNote(await src.notes(sp), note);
        if (found.error) throw new Error(found.error);
        return formatNote(found.note, { space: sp.vault ? '' : sp.name });
      },
    },
    {
      name: 'create_note',
      title: 'Create a note',
      description: 'Add a new note (Markdown; [[links]] and #tags work as in the app). Never replaces an existing note.',
      shape: { title: z.string().min(1).max(300), body: z.string().max(900_000).optional(), folder: folder.optional(), space },
      annotations: ADDS,
      async run({ title, body, folder: dir, space: name }) {
        const { src, sp } = await where(name);
        const { id, record } = buildNewNote({ title, body, folder: dir }, now());
        await src.create(sp, id, record);
        return `Created "${record.title}" in ${sp.name} (id ${id}).`;
      },
    },
    {
      name: 'append_to_note',
      title: 'Add text to a note',
      description: 'Put text on a new line at the end of an existing note; what is there stays.',
      shape: { note: ref, text: z.string().min(1).max(100_000), space },
      annotations: ADDS,
      async run({ note, text, space: name }) {
        const { src, sp } = await where(name);
        for (let attempt = 0; ; attempt++) {
          const current = await stored(src, sp, note);
          try {
            await src.replace(sp, current.id, buildAppend(current, text, now()), current._updateTime);
            return `Added to "${current.title}" in ${sp.name} (id ${current.id}).`;
          } catch (e) {
            if (!changedMeanwhile(e) || attempt) throw changedMeanwhile(e) ? new Error('The note keeps changing (another device is saving it); try again in a moment.') : e;
          }
        }
      },
    },
    {
      name: 'update_note',
      title: 'Overwrite a note',
      description: 'Replace a note\'s text, and/or its title or folder; only what is given changes. Overwrites: a new title keeps the old one as an alias, but links in other notes are not rewritten. To add text, use append_to_note.',
      shape: { note: ref, body: z.string().max(900_000).optional(), title: z.string().min(1).max(300).optional(), folder: folder.optional(), space, confirm },
      annotations: REPLACES,
      async run({ note, body, title, folder: dir, space: name, confirm: yes }) {
        if (body === undefined && title === undefined && dir === undefined) throw new Error('Nothing to change: give body, title or folder.');
        const { src, sp } = await where(name);
        const current = await stored(src, sp, note);
        const record = buildUpdate(current, { title, body, folder: dir }, now());
        const what = `"${current.title}" in ${sp.name} (id ${current.id})`;
        if (yes !== true) return `Would overwrite ${what}:\n${describeUpdate(current, record)}${PREVIEW('update_note')}`;
        try { await src.replace(sp, current.id, record, current._updateTime); }
        catch (e) { throw changedMeanwhile(e) ? new Error(`${what} changed since you read it; read it again and redo the change.`) : e; }
        return `Overwrote ${what}.`;
      },
    },
    {
      name: 'delete_note',
      title: 'Delete a note',
      description: 'Delete a note. It goes to the app\'s bin (Settings → Bin), the same as deleting in the app, so it can be restored there.',
      shape: { note: ref, space, confirm },
      annotations: REPLACES,
      async run({ note, space: name, confirm: yes }) {
        const { src, sp } = await where(name);
        const current = await stored(src, sp, note);
        const what = `"${current.title}" in ${sp.name} (id ${current.id}, ${current.body.length} characters)`;
        if (yes !== true) return `Would delete ${what}; it would go to the bin.${PREVIEW('delete_note')}`;
        try { await src.remove(sp, current, now()); }
        catch (e) { throw changedMeanwhile(e) ? new Error(`${what} changed since you read it; read it again first.`) : e; }
        return `Deleted ${what}; it is in the bin.`;
      },
    },
  ];
}

// Runs a tool and wraps its text (or error) as an MCP result; explain(e) may turn an error into a better one.
export async function callTool(tool, args, explain = async e => e) {
  try {
    return { content: [{ type: 'text', text: await tool.run(args || {}) }] };
  } catch (e) {
    const err = await explain(e);
    return { isError: true, content: [{ type: 'text', text: err && err.message ? err.message : String(err) }] };
  }
}
