// Runs before Ionic loads (module scripts run in page order): Ionic's config (Material look on every device, swipe from
// the left edge to go back, as on iOS), and this device's light or dark choice before the first paint.
window.Ionic = { config: { mode: 'md', swipeBackEnabled: true, hardwareBackButton: true } };

export const THEME_KEY = 'notes:ionic:theme';
/** @returns {'auto' | 'light' | 'dark'} */
export function themeChoice() {
  try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}
const dark = matchMedia('(prefers-color-scheme: dark)');
// Ionic's own dark palette is a class on <html> (palettes/dark.class.css); ionic.css lays the app's colours over it
export function applyTheme(choice = themeChoice()) {
  const on = choice === 'dark' || (choice === 'auto' && dark.matches);
  document.documentElement.classList.toggle('ion-palette-dark', on);
  document.querySelector('meta[name=theme-color]:not([media])')?.remove();
  const meta = Object.assign(document.createElement('meta'), { name: 'theme-color', content: on ? '#1e1e1e' : '#ffffff' });
  if (choice !== 'auto') document.head.append(meta);
}
dark.addEventListener('change', () => applyTheme());
applyTheme();
