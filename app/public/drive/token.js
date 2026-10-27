// The Drive permission, asked from the existing Firebase Google sign-in (no Google script): the sign-in again by popup
// with the drive.file scope added, for the same account. The token lasts an hour, so it is asked again when it expires;
// the popup needs a tap, so this runs from a button.
import { DRIVE_SCOPE } from './remote.js';

const LIFETIME = 55 * 60 * 1000;   // Google's token lasts 60 minutes

/**
 * @param {{ A: typeof import('firebase/auth'), auth: { currentUser: any }, emulator?: boolean, now?: () => number }} o
 *   emulator: tests only (no popup; the fake Drive takes any token)
 */
export function driveToken({ A, auth, emulator = false, now = Date.now }) {
  /** @type {{ token: string, until: number } | null} */ let held = null;
  return {
    /** the token, asking by popup when there is none or it ran out @returns {Promise<string>} */
    async get() {
      if (held && now() < held.until) return held.token;
      if (emulator) { held = { token: 'emulator-token', until: now() + LIFETIME }; return held.token; }
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in first.');
      const provider = new A.GoogleAuthProvider();
      provider.addScope(DRIVE_SCOPE);
      try {
        // reauthenticate: the same account only; a different Google account is refused, not a second sign-in
        const result = await A.reauthenticateWithPopup(user, provider);
        const token = A.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
        if (!token) throw new Error('Google gave no Drive permission.');
        held = { token, until: now() + LIFETIME };
        return token;
      } catch (e) {
        const code = /** @type {{ code?: string }} */ (e).code || '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new Error('Google sign-in was closed. Tap again to allow Drive.');
        if (code === 'auth/popup-blocked') throw new Error('The browser blocked the Google window. Allow pop-ups and tap again.');
        if (code === 'auth/user-mismatch') throw new Error('Pick the same Google account you signed in with.');
        throw e;
      }
    },
    forget() { held = null; },
  };
}
