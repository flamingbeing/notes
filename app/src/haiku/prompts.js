// The Haiku tab's pure parts (no imports, so app/test/haiku.unit.test.mjs runs them): the prompts are the notes in the
// Prompts folder, listed by title; a note's text is its prompt, without a first line that only repeats the title.

export const FOLDER = 'Prompts';
// used while the Prompts folder is empty
export const BUILT_IN = {
  id: '',
  title: 'Tidy this text',
  body: 'Tidy the text you are given: fix spelling, punctuation and spacing, and lay it out clearly. Keep every fact, number, '
    + 'name and abbreviation exactly as written, and add nothing. Reply with the tidied text only, with no comment before or after it.',
};

/** @typedef {{ id: string, title?: unknown, body?: unknown, path?: unknown }} PromptNote */

/** the notes in Prompts/ (or a folder inside it), by title @param {PromptNote[]} notes @returns {PromptNote[]} */
export const promptNotes = notes => notes
  .filter(n => { const p = String(n.path || '').toLowerCase().replace(/^\/+|\/+$/g, ''); return p === 'prompts' || p.startsWith('prompts/'); })
  .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));

/** a prompt note's text, as sent: a first line that is only the title (or "# title") left out @param {PromptNote} note */
export function promptText(note) {
  const lines = String(note.body || '').split('\n');
  const title = String(note.title || '').trim();
  if (title && lines[0].replace(/^#+\s*/, '').trim() === title) lines.shift();
  return lines.join('\n').trim();
}
