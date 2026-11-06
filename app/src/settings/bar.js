// The tab bar as arranged on this device (Settings → Tab bar; the kit's arrangeTabs reads the tabs option): painted at
// start and whenever the arrangement or the tabs the app has change. Here, not in the Settings sheet, so the sheet can
// load later (settings-sheet.js) while the bar is right from the first frame.
import { arrangeTabs, applyTabs } from '@core/ui';
import { $ } from '../shell/dom.js';

// the tab bar's tabs, in the default order (index.html's [data-tab-id]); Settings always stays (the tabs off the bar are
// listed at the top of its menu). Haiku is a tab only while its module is on (haiku-tab.js shows its button).
export const TABS = [{ id: 'notes', label: 'Notes' }, { id: 'folders', label: 'Folders' }, { id: 'haiku', label: 'Haiku' }, { id: 'settings', label: 'Settings' }];
export const RULES = { max: 5, fixed: ['settings'] };
export const tabButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ ($('tabbar').querySelector(`[data-tab-id="${id}"]`));
/** the tabs the app has now (Haiku only while it is on) */
export const available = () => TABS.filter(t => t.id !== 'haiku' || !tabButton('haiku')?.hidden);
/** @type {Set<() => void>} more to redraw when the bar changes (the Settings sheet's arranger and its "Off the tab bar") */
export const repaints = new Set();

/** @param {import('app-ui/settings/types').SettingsApi} settings */
export function tabBar(settings) {
  const arranged = () => arrangeTabs(available().map(t => t.id), settings.get('tabs'), RULES);
  const paintBar = () => { applyTabs($('tabbar'), arranged()); repaints.forEach(f => f()); };
  settings.watch('tabs', paintBar);
  const haikuTab = tabButton('haiku');
  if (haikuTab) new MutationObserver(paintBar).observe(haikuTab, { attributes: true, attributeFilter: ['hidden'] });
  paintBar();
  return { arranged };
}
