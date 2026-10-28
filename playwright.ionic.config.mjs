// The Ionic trial's smoke test (e2e/ionic.smoke.mjs, docs/decisions/0020-ionic-trial.md): Chromium and WebKit, each at a
// phone's 390 px and a computer's 1280 px. npx playwright test -c playwright.ionic.config.mjs
import config, { PORT } from './playwright.config.mjs';

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };
const chromium = process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {};
export default {
  ...config,
  testMatch: 'ionic.smoke.mjs',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-390', use: { browserName: 'chromium', ...chromium, ...phone } },
    { name: 'chromium-1280', use: { browserName: 'chromium', ...chromium, ...desktop } },
    { name: 'webkit-390', use: { browserName: 'webkit', ...phone } },
    { name: 'webkit-1280', use: { browserName: 'webkit', ...desktop } },
  ],
};
