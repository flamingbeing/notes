// The phone bar's spec (e2e/bar.spec.mjs) at 360 px in Chromium and WebKit. The main run (playwright.config.mjs) already
// has it in Chromium; CI's Ionic job installs WebKit, so this one runs here: npx playwright test -c playwright.bar.config.mjs
import config, { PORT } from './playwright.config.mjs';

const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const chromium = process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {};
export default {
  ...config,
  testMatch: 'bar.spec.mjs',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-360', use: { browserName: 'chromium', ...chromium, ...phone } },
    { name: 'webkit-360', use: { browserName: 'webkit', ...phone } },
  ],
};
