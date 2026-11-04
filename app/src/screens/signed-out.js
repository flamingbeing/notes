// The signed-out screen (#signed-out): the kit's sign-in screen, with "Forget this device".
import { signInScreen } from '@core/ui';
import { sectionScreen } from '../shell/dom.js';

/**
 * @param {import('../cloud.js').Started} app
 * @param {{ onForget: (ok: boolean) => void }} o  told whether this device was forgotten
 */
export function signedOutScreen(app, { onForget }) {
  signInScreen(/** @type {HTMLElement} */ (document.getElementById('signed-out')), {
    name: 'Notes',
    tagline: 'Plain-text notes with links, tags and daily notes.',
    icon: 'icons/icon.svg',
    accent: '#c99a45',
    auth: app.auth,
    onForget,
  });
  return sectionScreen('signed-out');
}
