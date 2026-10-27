// One REAL refresh call with a bogus token against the app's identity endpoint, Referer as the site restriction needs.
// Expect 400 INVALID_REFRESH_TOKEN (the key and referer were accepted); a 403 means the referer fix regressed. No live token used.
import { refreshIdToken, KEY_REFERER } from '../mcp/lib/auth.mjs';
import { API_KEY } from '../mcp/config.mjs';
try {
  await refreshIdToken({ apiKey: API_KEY, refreshToken: `bogus-${Date.now()}` });
  console.log('real FAIL: bogus token was accepted'); process.exit(1);
} catch (e) {
  if (e.status === 400 && /INVALID_REFRESH_TOKEN/.test(e.code || e.message)) { console.log(`real PASS 400 INVALID_REFRESH_TOKEN (referer ${KEY_REFERER})`); }
  else { console.log(`real FAIL status=${e.status} ${String(e.message).slice(0, 200)}`); process.exit(1); }
}
