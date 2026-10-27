// Share-in's pure parts: what a share from another app (the manifest's share_target, sw.js) turns into.

/** the parts of a share as the text of a note: its title, and a body of the text and the link
 * @param {{ title?: unknown, text?: unknown, url?: unknown }} s @returns {{ title: string, body: string }} */
export function parseShare(s) {
  const text = String(s.text ?? '').trim(), url = String(s.url ?? '').trim();
  // some apps put the link inside the text: it is not said twice
  const body = [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n\n');
  const title = String(s.title ?? '').trim() || body.split('\n')[0].slice(0, 80) || 'Shared';
  return { title, body };
}
/** a note's body with a share added at the end @param {string} body @param {string} add */
export const appendShare = (body, add) => (body.trim() ? `${body.replace(/\s+$/, '')}\n\n${add}\n` : `${add}\n`);
