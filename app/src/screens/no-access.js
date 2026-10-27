// The no-access screen (#no-access): signed in, but the account has no role yet; shows its id for an admin to add.
import { $, sectionScreen } from '../shell/dom.js';

export const noAccessScreen = () => sectionScreen('no-access', s => { $('uid').textContent = s.user?.uid || ''; });
