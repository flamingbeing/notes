// The Cloudflare Worker for this repo's address. It serves the repo's files (the static assets, bound as ASSETS),
// decides which folder an address may see (routes.js), adds the security headers (headers.js), answers /api/claims
// (claims.js from app-devkit, roles from members.js), /api/sessions/revoke (sessions.js: Disconnect MCP), /api/members/ (admins set and remove roles, members.js),
// /api/files/ (files.js, the R2 bucket bound as FILES) and /api/spaces (spaces.js: shared spaces, invites, moves), and
// passes Firebase's sign-in helper pages on to the project.
// wrangler.jsonc: "run_worker_first" sends every request here; FIREBASE_PROJECT is a var there, the service account
// (SA_EMAIL, SA_KEY) are Worker secrets.
import { resolve, publicFile } from './routes.js';
import { securityHeaders } from './headers.js';
import { admin, handleClaims, verifyIdToken } from './claims.js';
import { handleFiles } from './files.js';
import { loadClaims, handleMembers } from './members.js';
import { handleSessions } from './sessions.js';
import { handleCspReport } from './csp-report.js';
import { handleSpaces, spaceAccess } from './spaces.js';
import { store } from './store.js';

const NOINDEX = 'noindex, nofollow';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const local = LOCAL.test(url.hostname);
    const project = env.FIREBASE_PROJECT || '';
    const finish = res => withHeaders(res, { project, local });

    if (url.pathname === '/api/claims') return finish(await claims(request, env, url, local, project));
    if (url.pathname.startsWith('/api/files/')) return finish(await files(request, env, url, local, project));
    if (url.pathname === '/api/csp') return finish(await handleCspReport(request));
    if (url.pathname.startsWith('/api/sessions/')) return finish(await sessions(request, env, url, local, project));
    if (url.pathname.startsWith('/api/members/')) return finish(await members(request, env, url, local, project));
    if (url.pathname === '/api/spaces' || url.pathname.startsWith('/api/spaces/')) return finish(await spaces(request, env, url, local, project));
    if (request.method !== 'GET' && request.method !== 'HEAD') return finish(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } }));
    // Firebase's sign-in helper pages, from the project's own Firebase address, so sign-in never leaves this one
    if (/^\/__\/(auth|firebase)\//.test(url.pathname) && project && !local) {
      const res = await fetch(new Request(`https://${project}.firebaseapp.com${url.pathname}${url.search}`, request));
      return withHeaders(new Response(res.body, res), { project, local, framedBySelf: true, helper: true });
    }
    const r = resolve(url.hostname, url.pathname);
    if (r.redirect) return finish(redirect(url, r.redirect));
    if (r.notFound) return finish(notFound());

    // a folder (address ending in "/") serves its index.html
    let file = r.file;
    if (file === '' || file.endsWith('/')) file += 'index.html';
    let res = await asset(env, url, file);
    if (res.status === 404 && publicFile(file)) {
      const pub = await asset(env, url, publicFile(file));
      if (pub.status !== 404) { res = pub; file = publicFile(file); }
    }
    if (res.status === 404 && !/\.[^/]+$/.test(file)) {
      // no such file, but a folder of that name: send the browser to the address with a "/" (as GitHub Pages does)
      const dir = await asset(env, url, file + '/index.html');
      if (dir.status === 200) return finish(redirect(url, url.pathname + '/'));
    }
    if (res.status === 404) return finish(notFound());
    res = new Response(res.body, res);
    // service workers must always be checked fresh, or phones keep an old app for a day
    if (/(^|\/)sw\.js$/.test(file)) res.headers.set('Cache-Control', 'no-cache');
    return finish(res);
  },
};

// The real project with the service account in Worker secrets; on localhost with EMULATOR set (the e2e server only)
// the emulators, which need no account and accept only a demo- project.
function adminFor(env, local, project) {
  if (local && env.EMULATOR) return admin({ project, emulator: { auth: env.AUTH_EMULATOR, firestore: env.FIRESTORE_EMULATOR } });
  if (env.SA_EMAIL && env.SA_KEY && project) return admin({ project, sa: { email: env.SA_EMAIL, key: env.SA_KEY } });
  return null;
}
// store.js's calls (atomic field writes, lists, email lookup) on the same project and access token as the admin
function storeFor(env, local, adm) {
  if (!adm) return null;
  const emulator = local && env.EMULATOR ? { auth: env.AUTH_EMULATOR, firestore: env.FIRESTORE_EMULATOR } : undefined;
  return store({ project: adm.project, emulator, accessToken: () => adm.accessToken(), getDoc: path => adm.getDoc(path) });
}
function claims(request, env, url, local, project) {
  const adm = adminFor(env, local, project), st = storeFor(env, local, adm);
  return handleClaims(request, { admin: adm, loadClaims: o => loadClaims({ ...o, store: st }), origin: url.origin, limit: env.CLAIMS_LIMIT, emulator: !!(local && env.EMULATOR) });
}

// The same ID token check as /api/claims (the emulators' unsigned tokens only on localhost with EMULATOR set), and the
// rules' revoked/{uid} gate, read as the service account (without one, no roles are ever issued).
function files(request, env, url, local, project) {
  const emulator = !!(local && env.EMULATOR);
  const verify = project ? idToken => verifyIdToken(idToken, { project, emulator }) : null;
  const adm = project ? adminFor(env, local, project) : null;
  const revoked = adm ? async (/** @type {string} */ uid) => !!(await adm.getDoc(`revoked/${uid}`)) : null;
  // a shared space's files: by membership of the space (its doc, read as the service account); without one, vault only
  const access = adm ? spaceAccess(adm) : undefined;
  return handleFiles(request, { bucket: env.FILES, verify, revoked, origin: url.origin, access });
}
function spaces(request, env, url, local, project) {
  const emulator = !!(local && env.EMULATOR);
  const verify = project ? idToken => verifyIdToken(idToken, { project, emulator }) : null;
  const adm = project ? adminFor(env, local, project) : null;
  return handleSpaces(request, { verify, store: storeFor(env, local, adm), bucket: env.FILES || null, origin: url.origin });
}

// Role changes and removals, as the service account; the same ID token check as /api/claims.
function members(request, env, url, local, project) {
  const emulator = !!(local && env.EMULATOR);
  const verify = project ? (/** @type {string} */ idToken) => verifyIdToken(idToken, { project, emulator }) : null;
  return handleMembers(request, { admin: project ? adminFor(env, local, project) : null, verify, origin: url.origin });
}

// End every sign-in of the caller's own account (Settings → Disconnect MCP), as the service account.
function sessions(request, env, url, local, project) {
  const emulator = !!(local && env.EMULATOR);
  const verify = project ? (/** @type {string} */ idToken) => verifyIdToken(idToken, { project, emulator }) : null;
  return handleSessions(request, { admin: project ? adminFor(env, local, project) : null, verify, origin: url.origin });
}

function withHeaders(res, opts) {
  const out = new Response(res.body, res);
  for (const [k, v] of securityHeaders(opts)) out.headers.set(k, v);
  out.headers.set('X-Robots-Tag', NOINDEX);
  return out;
}

const asset = (env, url, file) => env.ASSETS.fetch(new Request(new URL('/' + file, url), { method: 'GET' }));
const redirect = (url, path) => Response.redirect(new URL(path + url.search, url).toString(), 301);
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
