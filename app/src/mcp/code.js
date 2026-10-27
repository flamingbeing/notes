// The sign-in code Settings shows for the Notes MCP server: "nmcp1." + base64url of { p: project id, r: Firebase refresh
// token }. The server (mcp/) reads it with decodeCode; the project id lets it refuse a code from another app.
// Pure, no browser or Node APIs beyond btoa/atob-free base64url, so both sides share it.
const PREFIX = 'nmcp1.';

/** @param {string} s */
const toB64url = s => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** @param {string} s */
const fromB64url = s => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

/** @param {{ projectId: string, refreshToken: string }} c -> the code to paste */
export const encodeCode = ({ projectId, refreshToken }) => PREFIX + toB64url(JSON.stringify({ p: projectId, r: refreshToken }));

/** @param {string} code -> { projectId, refreshToken }; throws Error('...') when it is not a code from Notes */
export function decodeCode(code) {
  const text = String(code || '').trim();
  if (!text.startsWith(PREFIX)) throw new Error('That is not a Notes code (it starts with "nmcp1."). Copy it again from Settings → Connect MCP.');
  let o;
  try { o = JSON.parse(fromB64url(text.slice(PREFIX.length))); } catch { o = null; }
  if (!o || typeof o.p !== 'string' || !o.p || typeof o.r !== 'string' || !o.r) throw new Error('That code is damaged or cut short. Copy it again from Settings → Connect MCP.');
  return { projectId: o.p, refreshToken: o.r };
}
