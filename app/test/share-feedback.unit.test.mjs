import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShare, appendShare } from '../src/share/share-in.js';
import { cleanFeedback, asTask, MAX_FEEDBACK } from '../src/feedback/feedback.js';

test('parseShare: title, text and link', () => {
  assert.deepEqual(parseShare({ title: 'T', text: 'words', url: 'https://x.test/a' }), { title: 'T', body: 'words\n\nhttps://x.test/a' });
  assert.deepEqual(parseShare({ text: 'see https://x.test/a', url: 'https://x.test/a' }), { title: 'see https://x.test/a', body: 'see https://x.test/a' });
  assert.deepEqual(parseShare({}), { title: 'Shared', body: '' });
});
test('appendShare', () => { assert.equal(appendShare('', 'a'), 'a\n'); assert.equal(appendShare('x\n\n', 'a'), 'x\n\na\n'); });
test('feedback text is trimmed and capped; a task line is one line', () => {
  assert.equal(cleanFeedback('  hi \n'), 'hi');
  assert.equal(cleanFeedback('x'.repeat(MAX_FEEDBACK + 9)).length, MAX_FEEDBACK);
  assert.equal(asTask({ text: 'a\n b', by: 'me@x.test', at: Date.UTC(2026, 9, 27) }), '- [ ] a b (feedback from me@x.test, 2026-10-27)');
});
