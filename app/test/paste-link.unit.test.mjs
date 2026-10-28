// Pasted addresses become titled links without tracking parameters (app/src/notes/paste-link.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { asUrl, cleanUrl, titleOf, linkFor } from '../src/notes/paste-link.js';

test('paste-link: only a lone web address counts', () => {
  assert.ok(asUrl(' https://example.com/a '));
  assert.equal(asUrl('see https://example.com'), null);
  assert.equal(asUrl('ftp://example.com'), null);
  assert.equal(asUrl('https://a.com b'), null);
});

test('paste-link: tracking parameters go, the rest stays', () => {
  assert.equal(cleanUrl(new URL('https://example.com/p?utm_source=x&id=7&fbclid=abc#top')), 'https://example.com/p?id=7#top');
  assert.equal(cleanUrl(new URL('https://example.com/p?utm_medium=a&gclid=b')), 'https://example.com/p');
  assert.equal(cleanUrl(new URL('https://youtu.be/abc?si=zzz&t=30')), 'https://youtu.be/abc?t=30');
});

test('paste-link: the title comes from the address', () => {
  assert.equal(titleOf(new URL('https://www.example.com/blog/my-first-post.html')), 'My first post (example.com)');
  assert.equal(titleOf(new URL('https://example.com/')), 'example.com');
  assert.equal(titleOf(new URL('https://example.com/p/12345')), 'example.com');
});

test('paste-link: the Markdown, with a selected label and awkward characters', () => {
  assert.equal(linkFor('https://example.com/a-b?utm_source=x'), '[A b (example.com)](https://example.com/a-b)');
  assert.equal(linkFor('https://example.com/x_(y)', 'the page'), '[the page](https://example.com/x_%28y%29)');
  assert.equal(linkFor('not a link'), null);
});
