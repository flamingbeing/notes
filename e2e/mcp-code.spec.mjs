// Settings → Advanced → Connect MCP: off by default per device; the code is shown on a tap, decodes to this project and a
// refresh token, and is wiped when the sheet closes; Disconnect (two taps) ends the account's sign-ins and signs out.
import { test, expect, signIn } from './fixtures.mjs';
import { decodeCode } from '../app/src/mcp/code.js';

const openSettings = async page => { await page.click('#open-settings'); await expect(page.locator('#settings')).toBeVisible(); };

test('on by default; the code is shown once and wiped on close', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page);
  await expect(page.locator('#opt-mcpOn')).toBeChecked();
  await page.click('#open-mcp');
  await expect(page.locator('#mcp')).toBeVisible();
  await expect(page.locator('#mcp-code')).toBeHidden();
  await page.click('#mcp-show');
  const code = await page.inputValue('#mcp-code');
  const { projectId, refreshToken } = decodeCode(code);
  expect(projectId).toBe('demo-notes');
  expect(refreshToken.length).toBeGreaterThan(10);
  await page.click('#mcp-close');
  await page.click('#open-settings');
  await page.click('#open-mcp');
  await expect(page.locator('#mcp-code')).toBeHidden();
  expect(await page.inputValue('#mcp-code')).toBe('');
});

test('Disconnect asks twice, ends the sign-ins and signs this device out', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page);
  await page.check('#opt-mcpOn');
  await page.click('#open-mcp');
  const revoke = page.waitForResponse(r => r.url().endsWith('/api/sessions/revoke'));
  await page.click('#mcp-off');
  await expect(page.locator('#mcp-off')).toContainText('Tap again');
  await page.click('#mcp-off');
  expect((await revoke).status()).toBe(200);
  await expect(page.locator('#signed-out')).toBeVisible();
});
