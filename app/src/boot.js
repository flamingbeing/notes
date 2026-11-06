// Runs first, before anything else on the page. Installable, never prompted: the browser's own install banner is
// cancelled and its prompt kept for Settings > About > Install this app (app-ui install.js), so it shows only on a tap
// (the manifest, icons and service worker stay). Then this device's theme, before the first paint, so a chosen look
// never flashes the default one.
import { applyTheme } from '@core/theme';
import { APP } from './config.js';

addEventListener('beforeinstallprompt', e => { e.preventDefault(); /** @type {any} */ (globalThis).coreInstallPrompt = e; });
// The layout (Settings, this device): 'vault' (the default) or 'classic', on <html data-layout> for the CSS and app.js;
// the Vault layout has its own accent. (public/snap.js sets it too, earlier, as it paints the kept list only in Classic.)
let layout = 'vault';
try { layout = JSON.parse(localStorage.getItem('notes:settings:settings/device') || '{}')?.values?.layout === 'classic' ? 'classic' : 'vault'; } catch { /* storage off: the default */ }
document.documentElement.dataset.layout = layout;
applyTheme({ accent: layout === 'vault' ? '#9873f6' : APP.accent, look: 'e', surface: 'ink' });
