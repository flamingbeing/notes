// Feedback's pure parts: a private message to the owner (feedback/{id}, written by any member, read by admins).
export const MAX_FEEDBACK = 2000;

/** @param {unknown} text -> the text kept, or '' when there is none */
export const cleanFeedback = text => String(text ?? '').trim().slice(0, MAX_FEEDBACK);
/** @param {{ id?: string, text: string, by?: string, at: number }} f a to-do line to copy into a task list */
export const asTask = f => `- [ ] ${f.text.replace(/\s*\n\s*/g, ' ')} (feedback${f.by ? ` from ${f.by}` : ''}, ${new Date(f.at).toISOString().slice(0, 10)})`;
