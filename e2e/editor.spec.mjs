// The note editor (S2): CodeMirror loads only with a note, live preview hides the Markdown off the cursor's line,
// [[ offers notes, pasted HTML becomes Markdown, saves happen by themselves, the read view is cleaned, and the quick
// switcher and command palette reach notes. Made-up notes only.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, add, openNote, serverHas, uniq, fillBody, drawer } from './fixtures.mjs';

const VENDOR = /\/vendor\/(codemirror|marked|dompurify)\//;
const content = page => page.locator('#edit-cm .cm-content');
const ready = page => expect(page.locator('html')).toHaveAttribute('data-editor', 'ready');

test('the list loads no editor; a note does, with live preview off the cursor’s line', async ({ phone }) => {
  const page = await phone();
  const asked = [];
  page.on('request', r => { if (VENDOR.test(r.url())) asked.push(r.url()); });
  await signIn(page, 'member');
  await expect(page.locator('#list-view')).toBeVisible();
  expect(asked).toEqual([]);
  const t = uniq('live');
  await add(page, t);

  await openNote(page, t);
  await ready(page);
  expect(asked.some(u => u.includes('/codemirror/'))).toBe(true);
  await expect(page.locator('#edit-body')).toBeHidden();
  await fillBody(page, '# Plan\nSome **bold** words and a [[Fake target]]\n- [ ] made-up task');
  // the cursor is at the start (line 1): line 2's marks are hidden, line 1 shows the raw heading
  await expect(content(page).locator('.cm-line').nth(0)).toHaveText('# Plan');
  await expect(content(page).locator('.cm-line').nth(1)).toHaveText('Some bold words and a Fake target');
  await expect(content(page).locator('.cm-strong')).toHaveText('bold');
  await expect(content(page).locator('input.cm-task')).toHaveCount(1);
  // the cursor on line 2: its Markdown shows, line 1's goes
  await content(page).locator('.cm-line').nth(1).click({ position: { x: 2, y: 5 } });
  await expect(content(page).locator('.cm-line').nth(1)).toHaveText('Some **bold** words and a [[Fake target]]');
  await expect(content(page).locator('.cm-line').nth(0)).toHaveText('Plan');
  // ticking the box writes [x]
  await content(page).locator('input.cm-task').click();
  await expect(page.locator('#edit-body')).toHaveValue(/- \[x\] made-up task/);
});

test('typing [[ picks a note; the link opens it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('from'), other = uniq('Zebra target');
  expect(await page.evaluate(t => window.starter.add(t, 'made-up text'), other)).toBe('');
  await add(page, t);
  await openNote(page, t);
  await ready(page);
  await content(page).click();
  await page.keyboard.type('See [[' + other.slice(0, 8));
  const option = page.locator('.cm-tooltip-autocomplete li', { hasText: other });
  await option.click();
  await expect(page.locator('#edit-body')).toHaveValue(`See [[${other}]]`);
  // off the link's line, a click on it opens the note (its text is saved first)
  await content(page).focus();
  await page.keyboard.press('Enter');
  await content(page).locator('.cm-wikilink').click();
  await expect(page.locator('#edit-text')).toHaveValue(other);
  await serverHas(`See [[${other}]]`, { body: true });
});

test('pasting HTML gives Markdown', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('paste');
  await add(page, t);
  await openNote(page, t);
  await ready(page);
  await content(page).click();
  await content(page).evaluate(el => {
    const data = new DataTransfer();
    data.setData('text/html', '<h2>Fake heading</h2><p>Some <b>bold</b> and <a href="https://example.com/">a link</a></p><ul><li>one</li><li>two</li></ul>');
    data.setData('text/plain', 'Fake heading Some bold and a link one two');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#edit-body')).toHaveValue('## Fake heading\n\nSome **bold** and [a link](https://example.com/)\n\n- one\n- two');
});

test('typing saves by itself after a pause, and on leaving the sheet', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('auto');
  await add(page, t);
  await openNote(page, t);
  await ready(page);
  await content(page).click();
  await page.keyboard.type('quietly saved');
  await serverHas('quietly saved', { body: true });
  await expect(page.locator('#edit')).toBeVisible();
  await page.keyboard.type(' and closed');
  await page.waitForTimeout(300);   // (an Escape while the [[ suggestions are still being looked for closes them instead)
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit')).toBeHidden();
  await serverHas('quietly saved and closed', { body: true });
});

test('the read view draws the Markdown and leaves out scripts and styles', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('read'), other = uniq('Read target');
  expect(await page.evaluate(t => window.starter.add(t, ''), other)).toBe('');
  await add(page, t);
  await openNote(page, t);
  await ready(page);
  await fillBody(page, `# Title\n\n**bold** [[${other}|the other note]] <img src=x onerror="window.bad=1"> <span style="color:red">red</span> <script>window.bad=2</script>\n\n[out](https://example.com/)`);
  await page.click('#edit-mode');
  const read = page.locator('#edit-read');
  await expect(read.locator('h1')).toHaveText('Title');
  await expect(read.locator('strong')).toHaveText('bold');
  await expect(read.locator('script, [onerror], [style]')).toHaveCount(0);
  await expect(read.locator('a[href="https://example.com/"]')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  await read.locator('a.wikilink').click();
  await expect(page.locator('#edit-text')).toHaveValue(other);
});

test('the quick switcher opens a note; the palette runs a command', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('Alpha note'), b = uniq('Bravo note');
  for (const title of [a, b]) expect(await page.evaluate(t => window.starter.add(t, 'made-up'), title)).toBe('');
  await expect(page.locator('#items')).toContainText(b);
  await drawer(page, '#go-to');
  await expect(page.locator('#picker')).toBeVisible();
  await page.fill('#picker-q', b.slice(0, 9));
  await expect(page.locator('#picker-list [role=option]').first()).toContainText(b);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-text')).toHaveValue(b);
  // Ctrl+O from inside the note
  await page.keyboard.press('Control+o');
  await page.fill('#picker-q', a.slice(0, 9));
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-text')).toHaveValue(a);
  // the palette: line numbers on (a device option)
  await page.keyboard.press('Control+p');
  await page.fill('#picker-q', 'line numbers');
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-cm .cm-gutters')).toBeVisible();
  // the switcher offers to make a note that isn't there
  const c = uniq('Charlie new');
  await page.keyboard.press('Control+o');
  await page.fill('#picker-q', c);
  await expect(page.locator('#picker-list [role=option]').last()).toContainText('Make a note');
  await page.locator('#picker-list [role=option]').last().click();
  await expect(page.locator('#edit-text')).toHaveValue(c);
  await serverHas(c);
});

for (const [theme, dark] of [['light', ''], ['dark', ''], ['dark', 'oled']]) {
  test(`the editor, read view and switcher pass axe: ${theme}${dark ? ' ' + dark : ''}`, async ({ phone }) => {
    const page = await phone();
    await signIn(page, 'member');
    await page.getByLabel('Theme').selectOption(theme);
    if (dark) await page.getByLabel('Dark style').selectOption(dark);
    const t = uniq('axe');
    await add(page, t);
    await openNote(page, t);
    await ready(page);
    await fillBody(page, '# Heading\n\nSome **bold**, `code`, #tag and a [[Missing note]]\n\n- [ ] made-up task\n> a quote');
    await content(page).click();
    expect(await AxeBuilder(page)).toEqual([]);
    await page.click('#edit-mode');
    expect(await AxeBuilder(page)).toEqual([]);
    await page.keyboard.press('Control+o');
    await expect(page.locator('#picker')).toBeVisible();
    expect(await AxeBuilder(page)).toEqual([]);
  });
}
