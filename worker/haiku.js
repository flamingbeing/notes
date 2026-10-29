// The Haiku tab: POST /api/haiku { prompt, text } -> { text }. Owner or admin only (it spends the owner's Anthropic
// credits): a verified sign-in whose role, read fresh from members/ as the service account (members.js), is admin and
// not revoked. Claude Haiku gets the prompt as its system prompt and the pasted text as the one user message, and its
// reply goes back to the page in place of the text. Nothing is stored or logged here: the text can hold anything the
// owner pastes, so neither the prompt nor the text ever reaches a log line.
//
// The Anthropic key is a Worker secret (ANTHROPIC_API_KEY), never in a file. Without it the route answers 503 with a
// plain message. Local (the tests): a canned reply, no network.
import { loadClaims } from './members.js';

export const MODEL = 'claude-haiku-5-5';
export const MAX_TEXT = 30000, MAX_PROMPT = 20000;
const PATH = '/api/haiku';

const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** the canned reply on localhost, so the page's Run and Undo can be tested without a key @param {string} text */
export const canned = text => `[Haiku test reply]\n${text.trim()}`;

/**
 * The Messages API call. -> (system, text) => { text, stop } (stop: the reply's stop_reason)
 * @param {any} env @param {typeof fetch} [fetchFn]
 */
export const anthropic = (env, fetchFn = fetch) => async (/** @type {string} */ system, /** @type {string} */ text) => {
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: text }] }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const out = /** @type {any} */ (await r.json());
  // only the text blocks, joined (a reply can carry other kinds of block)
  const blocks = Array.isArray(out?.content) ? out.content : [];
  return { text: blocks.filter((/** @type {any} */ b) => b?.type === 'text').map((/** @type {any} */ b) => String(b.text || '')).join(''), stop: String(out?.stop_reason || '') };
};

/**
 * deps = { verify(idToken), admin (claims.js admin or null), ask(system, text) -> { text, stop }, or null when the key
 * is not set, local }. Exported with its seams for worker/test/haiku.test.mjs.
 * @param {Request} request @param {any} deps
 */
export async function handleHaiku(request, { verify, admin: adm, ask, local = false, origin }) {
  if (new URL(request.url).pathname !== PATH) return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'POST.' }, 405);
  const from = request.headers.get('Origin');
  if (origin && from && from !== origin) return json({ error: 'Wrong origin.' }, 403);
  const idToken = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/)?.[1];
  if (!idToken) return json({ error: 'Sign in first.' }, 401);
  if (!adm || typeof verify !== 'function') return json({ error: 'Haiku isn’t set up yet.' }, 503);
  let token;
  try { token = await verify(idToken); } catch { return json({ error: 'Sign in again.' }, 401); }
  try {
    const mine = await loadClaims({ uid: token.sub, token, admin: adm });
    if (mine?.g._ !== 'admin' || await adm.getDoc(`revoked/${token.sub}`)) return json({ error: 'Owner only.' }, 403);
  } catch { return json({ error: 'Couldn’t check your role. Try again.' }, 502); }
  let body;
  try { body = /** @type {any} */ (await request.json()); } catch { return json({ error: 'Send JSON.' }, 400); }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!prompt) return json({ error: 'Pick a prompt first.' }, 400);
  if (!text.trim()) return json({ error: 'Paste some text first.' }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: `The prompt is too long (at most ${MAX_PROMPT} characters).` }, 400);
  if (text.length > MAX_TEXT) return json({ error: `The text is too long (at most ${MAX_TEXT} characters).` }, 400);
  if (local) return json({ text: canned(text) });
  if (!ask) return json({ error: 'Haiku isn’t set up yet: the Worker needs its ANTHROPIC_API_KEY secret.' }, 503);
  try {
    const out = await ask(prompt, text);
    if (out.stop === 'refusal') return json({ error: 'Haiku declined to answer this one.' }, 502);
    if (out.stop === 'max_tokens') return json({ error: 'Haiku’s reply was cut off: try a shorter text.' }, 502);
    if (!out.text.trim()) return json({ error: 'Haiku sent back nothing. Try again.' }, 502);
    return json({ text: out.text });
  } catch (e) {
    console.error('haiku failed', /** @type {any} */ (e)?.message);   // the status only, never the text
    return json({ error: 'Couldn’t reach Haiku. Try again.' }, 502);
  }
}
