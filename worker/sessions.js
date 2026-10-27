// POST /api/sessions/revoke: ends every sign-in of the caller's account (Identity Toolkit validSince), so each Firebase
// refresh token, the page's and any code from Settings → Connect MCP, stops working; ID tokens already issued run out
// within the hour. Firebase has no way to end one refresh token only, so "Disconnect MCP" and "sign out everywhere" are
// the same call. Only the caller's own account (from their ID token, the same check as /api/claims).
// handleSessions(request, { admin, verify, origin }) -> { ok: true }, or { error } with 401/403/405/503.
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...headers } });

export async function handleSessions(request, { admin: adm, verify, origin } = {}) {
  if (new URL(request.url).pathname !== '/api/sessions/revoke') return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405, { Allow: 'POST' });
  if (!adm || typeof verify !== 'function') return json({ error: 'Sessions are not set up yet.' }, 503);
  const from = request.headers.get('Origin');
  if (origin && from && from !== origin) return json({ error: 'Wrong origin.' }, 403);
  const idToken = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/)?.[1];
  if (!idToken) return json({ error: 'Sign in first.' }, 401);
  let token;
  try { token = await verify(idToken); } catch { return json({ error: 'Sign in again.' }, 401); }
  try { await adm.revokeSessions(token.sub); } catch (e) {
    console.error('revoke sessions failed', e?.message);
    return json({ error: 'Couldn’t disconnect. Try again.' }, 500);
  }
  return json({ ok: true });
}
