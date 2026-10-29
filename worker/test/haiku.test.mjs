import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHaiku, anthropic, canned, MODEL, MAX_TEXT, MAX_PROMPT } from '../haiku.js';

const ORIGIN = 'https://app.example.com';
// tokens: 'owner' (the default admin, no role doc), 'admin' (role doc admin), 'member', 'gone' (admin but revoked)
const verify = async t => {
  const who = { owner: { sub: 'u0', email: 'kohwenjun@gmail.com', email_verified: true }, admin: { sub: 'u1' }, member: { sub: 'u2' }, gone: { sub: 'u3' } }[t];
  if (!who) throw new Error('bad token');
  return who;
};
const docs = { 'members/u1': { role: 'admin', v: 1 }, 'members/u2': { role: 'member', v: 1 }, 'members/u3': { role: 'admin', v: 1 }, 'revoked/u3': { at: 1 } };
const admin = { getDoc: async path => docs[path] ?? null };
const call = (deps, { token = 'owner', body = { prompt: 'Tidy this.', text: 'some text' }, method = 'POST', headers = {}, path = '/api/haiku' } = {}) =>
  handleHaiku(new Request(`${ORIGIN}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), { verify, admin, origin: ORIGIN, ask: null, ...deps });

test('the owner and an admin get Haiku’s reply in place of the text', async () => {
  const seen = [];
  const ask = async (system, text) => { seen.push([system, text]); return { text: 'tidied', stop: 'end_turn' }; };
  for (const token of ['owner', 'admin']) {
    const res = await call({ ask }, { token });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'tidied' });
  }
  assert.deepEqual(seen[0], ['Tidy this.', 'some text']);
});

test('refuses: no token 401, bad token 401, member 403, revoked admin 403, wrong origin 403, GET 405', async () => {
  let asked = 0;
  const ask = async () => { asked++; return { text: 'x', stop: 'end_turn' }; };
  assert.equal((await call({ ask }, { token: '' })).status, 401);
  assert.equal((await call({ ask }, { token: 'nope' })).status, 401);
  assert.equal((await call({ ask }, { token: 'member' })).status, 403);
  assert.equal((await call({ ask }, { token: 'gone' })).status, 403);
  assert.equal((await call({ ask }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call({ ask }, { method: 'GET' })).status, 405);
  assert.equal((await call({ ask }, { path: '/api/haiku/x' })).status, 404);
  assert.equal(asked, 0);
});

test('no key or no service account: 503 with a plain message', async () => {
  const res = await call({ ask: null });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
  assert.equal((await call({ admin: null })).status, 503);
});

test('caps and empty boxes: 400', async () => {
  const ask = async () => ({ text: 'x', stop: 'end_turn' });
  assert.equal((await call({ ask }, { body: { prompt: 'p', text: 'x'.repeat(MAX_TEXT + 1) } })).status, 400);
  assert.equal((await call({ ask }, { body: { prompt: 'p'.repeat(MAX_PROMPT + 1), text: 'x' } })).status, 400);
  assert.equal((await call({ ask }, { body: { prompt: 'p', text: '  ' } })).status, 400);
  assert.equal((await call({ ask }, { body: { prompt: '', text: 'x' } })).status, 400);
  assert.equal((await call({ ask }, { body: 'not json' })).status, 400);
  assert.equal((await call({ ask }, { body: { prompt: 'p', text: 'x'.repeat(MAX_TEXT) } })).status, 200);
});

test('a cut-off reply or a refusal is said plainly, never passed on as the text', async () => {
  const cut = await call({ ask: async () => ({ text: 'half', stop: 'max_tokens' }) });
  assert.equal(cut.status, 502);
  assert.match((await cut.json()).error, /cut off/);
  const no = await call({ ask: async () => ({ text: '', stop: 'refusal' }) });
  assert.equal(no.status, 502);
  assert.match((await no.json()).error, /declined/);
  const down = await call({ ask: async () => { throw new Error('anthropic 529'); } });
  assert.equal(down.status, 502);
});

test('local: a canned reply, no network', async () => {
  const res = await call({ local: true, ask: async () => { throw new Error('no network in tests'); } });
  assert.deepEqual(await res.json(), { text: canned('some text') });
});

test('the Messages API call: model, system prompt, one user message, low effort; only text blocks joined', async () => {
  let sent;
  const fake = async (url, init) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: 'one ' }, { type: 'text', text: 'two' }], stop_reason: 'end_turn' }));
  };
  const out = await anthropic({ ANTHROPIC_API_KEY: 'k' }, fake)('the prompt', 'the text');
  assert.deepEqual(out, { text: 'one two', stop: 'end_turn' });
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'k');
  assert.deepEqual(sent.body, { model: MODEL, max_tokens: 16000, output_config: { effort: 'low' }, system: 'the prompt', messages: [{ role: 'user', content: 'the text' }] });
  await assert.rejects(anthropic({}, async () => new Response('{}', { status: 401 }))('p', 't'), /anthropic 401/);
});
