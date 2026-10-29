// A search result's passage (made-up text): the first searched word, marked, with about two lines around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snippetOf } from '../src/notes/snippet.js';

const w = text => ({ text, phrase: false });

test('the first searched word, from where a word starts, with text either side', () => {
  const s = snippetOf('# Trip\nPack the **blue** bag. Then call the garage about the tyres before Friday.', [w('gar')]);
  assert.deepEqual(s, { before: '…Pack the blue bag. Then call the ', match: 'garage', after: ' about the tyres before Friday.' });
});

test('a long note: a few words before the match, an ellipsis at each cut', () => {
  const body = 'alpha '.repeat(40) + 'needle ' + 'omega '.repeat(40);
  const s = snippetOf(body, [w('needle')]);
  assert.equal(s.match, 'needle');
  assert.ok(s.before.startsWith('…') && s.after.endsWith('…'));
  assert.ok(s.before.length < 50 && (s.before + s.match + s.after).length < 130);
});

test('the earliest of several words; a phrase anywhere; case does not matter', () => {
  assert.equal(snippetOf('one Two three', [w('three'), w('two')]).match, 'Two');
  assert.equal(snippetOf('a bluebird sang', [{ text: 'bird sa', phrase: true }]).match, 'bird sa');
});

test('a word only inside another word, or not there at all: no passage', () => {
  assert.equal(snippetOf('a bluebird sang', [w('bird')]), null);
  assert.equal(snippetOf('nothing here', [w('zebra')]), null);
  assert.equal(snippetOf('anything', []), null);
});

test('characters that mean something in a pattern are just text', () => {
  assert.equal(snippetOf('cost is 3+4 (approx)', [{ text: '3+4 (', phrase: true }]).match, '3+4 (');
});
