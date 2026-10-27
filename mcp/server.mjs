#!/usr/bin/env node
// Notes MCP server: reads your own notes (and shared spaces), adds, appends to, overwrites and deletes them. See README.md.
//   node server.mjs login    sign in with the code from the app (Settings → Connect MCP), asked for at a hidden prompt
//   node server.mjs login --google   sign in with Google in the browser (only with a client in config.mjs)
//   node server.mjs logout   delete the stored token
//   node server.mjs          run the MCP server on stdio (Claude Desktop / Claude Code start it); not signed in yet,
//                            the first tool call opens the browser to sign in (no terminal needed)

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLIENT_ID, CLIENT_SECRET, API_KEY, PROJECT_ID, APP_URL, isConfigured } from './config.mjs';
import { login, loginWithCode, makeSession, deleteToken, defaultTokenFile, NotSignedInError, openBrowser } from './lib/auth.mjs';
import { makeFirestore } from './lib/firestore.mjs';
import { makeNotesSource } from './lib/source.mjs';
import { defineTools, callTool, READ_ONLY } from './lib/tools.mjs';

const SELF = fileURLToPath(import.meta.url);
const VERSION = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const log = m => process.stderr.write(m + '\n');

// Not signed in (or the sign-in expired): the tool call that finds out starts the browser sign-in itself and answers
// at once with the address, so it works from Claude Desktop with no terminal. One sign-in at a time.
let signingIn = null;
async function startSignIn(why) {
  if (!isConfigured()) return new Error(`${why} Sign in with a code: in the Notes app open Settings → Advanced → Connect MCP, copy the code, then run:\nnode "${SELF}" login\nand paste it.`);
  const started = !signingIn;
  if (started) {
    let url = '';
    signingIn = {
      done: login({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiKey: API_KEY, log, open: (u, l) => { url = u; openBrowser(u, l); } })
        .then(({ email }) => log(`Signed in as ${email}.`), e => log(`Sign-in did not finish: ${e.message}`))
        .finally(() => { signingIn = null; }),
      url: () => url,
    };
  }
  // login() opens the listener first; the address is there a moment later
  for (let i = 0; i < 20 && signingIn && !signingIn.url(); i++) await new Promise(r => setTimeout(r, 50));
  const url = signingIn ? signingIn.url() : '';
  return new Error(`${why} ${started ? 'A browser window is opening' : 'A browser window is waiting'} for you to sign in to Notes with Google (the account you use for Notes).`
    + (url ? ` If it didn't open, go to:\n${url}\n` : ' ')
    + 'Once the page says you are signed in, ask again. (Or, with the code from Notes → Settings → Connect MCP, in a terminal: node "' + SELF + '" login)');
}

// The signed-in person's notes (makeNotesSource), made when first needed and kept while the session lasts.
let current = null;
async function source() {
  if (current) return current;
  let session;
  try { session = makeSession({ apiKey: API_KEY, appUrl: APP_URL }); }
  catch (e) { if (e instanceof NotSignedInError) throw await startSignIn('Not signed in to Notes yet.'); throw e; }
  const firestore = makeFirestore({ projectId: PROJECT_ID, getIdToken: f => session.getIdToken(f), onDenied: () => session.renewClaims() });
  return (current = makeNotesSource({ firestore, uid: await session.uid() }));
}

// A sign-in that expired mid-use: forget the session, so the next call starts a new sign-in.
const signInProblem = async e => {
  if (!(e instanceof NotSignedInError)) return e;
  current = null;
  return startSignIn(`Notes sign-in problem: ${e.message}.`);
};

async function serve() {
  const [{ McpServer }, { StdioServerTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('@modelcontextprotocol/sdk/server/stdio.js'),
  ]);
  const server = new McpServer({ name: 'notes', version: VERSION }, {
    instructions: 'The signed-in person\'s own Notes (Markdown notes with [[links]] and #tags, in folders) and the shared spaces they are in. '
      + 'Reading and adding (create_note, append_to_note) are direct. update_note overwrites and delete_note deletes (to the bin, so the app can restore it): '
      + 'call them first without confirm, show the user the preview, and call again with confirm: true only after the user agrees. '
      + 'Never put patient details in a note.',
  });
  for (const tool of defineTools(source)) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.shape, annotations: tool.annotations || READ_ONLY },
      args => callTool(tool, args, signInProblem));
  }
  await server.connect(new StdioServerTransport());
  log(`notes MCP server running (token file ${defaultTokenFile()})`);
}

// The code is a credential, so it is read at a prompt that does not echo it (and never from the command line, where it
// would reach `ps` and the shell history). Piped input works too: echo "$CODE" | node server.mjs login
async function askCode() {
  const { createInterface } = await import('node:readline');
  const { Writable } = await import('node:stream');
  let muted = false;
  const output = new Writable({ write(chunk, _enc, cb) { if (!muted) process.stderr.write(chunk); cb(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY, historySize: 0 });
  return new Promise(resolve => {
    rl.question('Paste the code from Notes (Settings → Advanced → Connect MCP): ', answer => { rl.close(); process.stderr.write('\n'); resolve(answer.trim()); });
    muted = true;
  });
}

async function main(cmd) {
  if (cmd === 'login') {
    const google = process.argv[3] === '--google';
    if (google && !isConfigured()) { log('No Google client is set in config.mjs: use the code from the app instead (node server.mjs login).'); process.exit(1); }
    const code = google ? '' : await askCode();
    if (!google) {
      if (!code) { log('No code given.'); process.stdin.pause(); process.exitCode = 1; return; }
      const { email } = await loginWithCode({ code, apiKey: API_KEY, projectId: PROJECT_ID });
      log(`Signed in as ${email}. Token saved to ${defaultTokenFile()} (only on this computer).`);
      log('Restart Claude Desktop or Claude Code if it was already running.');
      return;
    }
    const { email } = await login({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, apiKey: API_KEY });
    log(`Signed in as ${email}. Token saved to ${defaultTokenFile()} (only on this computer).`);
    log('Restart Claude Desktop or Claude Code if it was already running.');
    return;
  }
  if (cmd === 'logout') {
    log(deleteToken() ? `Signed out: deleted ${defaultTokenFile()}.` : 'Not signed in (no token file).');
    log('To end it everywhere: Notes → Settings → Disconnect MCP (a code stays valid until then). Google sign-in: Google Account → Security → Third-party access.');
    return;
  }
  if (cmd && cmd !== 'serve') {
    log('Usage: node server.mjs [login [--google] | logout]   (no argument: run the MCP server on stdio)');
    process.exit(2);
  }
  await serve();
}

// exitCode, not exit(): exiting while stdin is still closing after the code prompt aborts Node on Windows (libuv async.c assertion).
main(process.argv[2]).catch(e => { log(`Error: ${e && e.message ? e.message : e}`); process.stdin.pause(); process.exitCode = 1; });
