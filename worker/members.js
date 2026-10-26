// Where the app's roles live: one role doc per person, members/{uid} = { role, v }. The doc is the source of truth;
// the claims on the account (rules kit shape, single group '_') are a cache of it, written by /api/claims.
// v goes up whenever an admin changes the doc, so a page whose token carries an older v asks for new claims.
// At each claims ask, invites to shared spaces waiting for the person's verified email are taken up (spaces.js); an
// invite came from an admin, so someone not in the app yet comes in as a member.
import { acceptInvites } from './spaces.js';

export const ROLES = ['admin', 'member', 'viewer'];

export async function loadClaims({ uid, token, admin, store = null }) {
  let d = await admin.getDoc(`members/${uid}`);
  const email = token?.email_verified ? String(token.email || '') : '';
  if (store && email) {
    const joined = await acceptInvites({ uid, email, store });
    if (joined && !d) {
      d = { role: 'member', v: 1 };
      await store.write([{ path: `members/${uid}`, exists: false, set: [[['role'], d.role], [['v'], d.v]] }]);
    }
  }
  if (!d || !ROLES.includes(d.role)) return null;   // not (or no longer) a member: claims cleared
  return { g: { _: d.role }, v: Number.isInteger(d.v) ? d.v : 0 };
}
