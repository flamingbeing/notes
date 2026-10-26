// Attachments in notes (app/src/notes/attach.js): which file a reference means, names, and what an embed looks like.
// Fake names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRef, resolveAttachment, uniqueName, pastedName, embedFor, fullPath, isImage } from '../src/notes/attach.js';

const att = (name, path = '', extra = {}) => ({ id: name + path, name, path, type: 'image/png', ...extra });

test('attach: references are cleaned the way Obsidian reads them', () => {
  assert.equal(cleanRef('a%20b.png'), 'a b.png');
  assert.equal(cleanRef('./img/a.png#x'), 'img/a.png');
  assert.equal(cleanRef('a.png|200'), 'a.png');
  assert.equal(cleanRef('/x//y.png'), 'x/y.png');
  assert.equal(cleanRef('%E0%A4%A'), '%E0%A4%A');   // not valid percent-encoding: left alone
});

test('attach: a reference means the full path, else a path ending in it, else the name; shortest first; deleted ones never', () => {
  const list = [att('sprout.png', 'Ideas/img'), att('sprout.png', 'img'), att('Sprout.png', 'a/b/c'), att('gone.png', '', { _deleted: true })];
  assert.equal(fullPath(resolveAttachment(list, 'sprout.png')), 'img/sprout.png');
  assert.equal(fullPath(resolveAttachment(list, 'Ideas/img/sprout.png')), 'Ideas/img/sprout.png');
  assert.equal(fullPath(resolveAttachment(list, 'img/SPROUT.png')), 'img/sprout.png');
  assert.equal(fullPath(resolveAttachment(list, './c/sprout.png')), 'a/b/c/Sprout.png');
  assert.equal(resolveAttachment(list, 'gone.png'), null);
  assert.equal(resolveAttachment(list, ''), null);
  assert.equal(resolveAttachment(list, 'nothing.png'), null);
});

test('attach: a new name is unique among the space’s own (not vault) files', () => {
  const list = [att('photo.png'), att('photo 2.png'), att('vault.png', 'img'), att('old.png', '', { _deleted: true })];
  assert.equal(uniqueName(list, 'photo.png'), 'photo 3.png');
  assert.equal(uniqueName(list, 'new.png'), 'new.png');
  assert.equal(uniqueName(list, 'old.png'), 'old.png');
  assert.equal(uniqueName(list, 'a/b.png'), 'a-b.png');
  assert.equal(uniqueName([att('README')], 'readme'), 'readme 2');
  assert.equal(uniqueName([], '  '), 'file');
});

test('attach: pasted pictures are named by time; embeds use the full path', () => {
  assert.equal(pastedName('image/png', new Date(2026, 9, 26, 21, 48, 5)), 'Pasted image 20261026-214805.png');
  assert.equal(pastedName('image/x-weird', new Date(2026, 0, 2, 3, 4, 5)), 'Pasted image 20260102-030405.bin');
  assert.equal(embedFor(att('a.png', 'img')), '![[img/a.png]]');
  assert.equal(isImage({ type: 'image/webp' }), true);
  assert.equal(isImage({ type: 'image/svg+xml' }), false);
});
