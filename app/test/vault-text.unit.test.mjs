import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingsOf, plainHeading } from '../src/vault-ui/outline.js';
import { counts, countText, readable } from '../src/vault-ui/count.js';
import { monthGrid, dayOf, nearestDaily, dailyMap } from '../src/vault-ui/month.js';

test('headingsOf: levels, lines and depth; closing hashes dropped', () => {
  const h = headingsOf('# Plan\n\ntext\n\n## Beds ##\n### North\n## Tasks\n#not a heading\n####### seven');
  assert.deepEqual(h.map(x => [x.level, x.text, x.line, x.depth]), [
    [1, 'Plan', 0, 0], [2, 'Beds', 4, 1], [3, 'North', 5, 2], [2, 'Tasks', 6, 1],
  ]);
});

test('headingsOf: an outline of only ## starts at depth 0; a smaller heading after a bigger one goes back out', () => {
  const h = headingsOf('## A\n#### B\n### C\n## D');
  assert.deepEqual(h.map(x => [x.text, x.depth]), [['A', 0], ['B', 1], ['C', 1], ['D', 0]]);
});

test('headingsOf: nothing inside code fences or the front matter', () => {
  const body = '---\ntitle: x\n# not\n---\n# Real\n```\n# in code\n```\n~~~~js\n## also code\n~~~\n## still code\n~~~~\n## After';
  assert.deepEqual(headingsOf(body).map(x => [x.text, x.line]), [['Real', 4], ['After', 13]]);
});

test('headingsOf: underlined headings; a rule under a list item or a blank line is no heading', () => {
  const h = headingsOf('Big one\n===\n\nSmaller\n---\n\n- item\n---\n\n---');
  assert.deepEqual(h.map(x => [x.level, x.text, x.line]), [[1, 'Big one', 0], [2, 'Smaller', 3]]);
});

test('plainHeading: links by their words, no emphasis marks', () => {
  assert.equal(plainHeading('**Bold** and [[Garden plan|the garden]] and [[Seeds]] `code` [site](https://x.test) _it_'), 'Bold and the garden and Seeds code site it');
  assert.equal(headingsOf('#').length, 0);
});

test('counts: words and characters of the text as it reads', () => {
  assert.deepEqual(counts('one two three'), { words: 3, characters: 13 });
  assert.deepEqual(counts(''), { words: 0, characters: 0 });
  // (Markdown marks are not counted; a link by its words)
  assert.deepEqual(counts('# Plan\n\n- [ ] Buy **seeds**'), counts('Plan\n\nBuy seeds'));
  assert.deepEqual(counts('See [[Garden plan|the garden]].'), counts('See the garden.'));
  assert.deepEqual(counts('See [[Garden plan]] and [site](https://example.test/a)'), counts('See Garden plan and site'));
  assert.equal(counts('![[photo.png]] word').words, 1);
  assert.equal(counts('---\ntags: [a, b]\n---\nbody text').words, 2);
  assert.equal(counts('well-known it’s 3.5 kg').words, 4);
  assert.equal(counts('漢字テスト ok').words, 6);
  assert.equal(readable('> quoted ==mark== ~~gone~~'), 'quoted mark gone');
});

test('countText: plural and singular', () => {
  assert.equal(countText('Hello'), '1 word, 5 characters');
  assert.equal(countText('a'), '1 word, 1 character');
  assert.equal(countText('one two'), '2 words, 7 characters');
  assert.equal(countText(Array(1200).fill('w').join(' ')), '1,200 words, 2,399 characters');
});

test('monthGrid: Monday first, whole weeks, the days outside the month marked', () => {
  const g = monthGrid(2026, 10, '2026-11-06');   // November 2026: the 1st is a Sunday
  assert.equal(g.title, 'November 2026');
  assert.equal(g.days.length, 42);
  assert.deepEqual(g.days[0], { iso: '2026-10-26', day: 26, inMonth: false, today: false });
  assert.equal(g.days[6].iso, '2026-11-01');
  assert.equal(g.days.find(d => d.today)?.iso, '2026-11-06');
  assert.equal(g.days.at(-1)?.iso, '2026-12-06');
  assert.equal(monthGrid(2027, 1).days.length, 28);   // February 2027 starts on a Monday
  assert.equal(monthGrid(2026, 12).title, 'January 2027');   // (a month past December rolls over)
});

test('dayOf, dailyMap and nearestDaily: daily notes by date', () => {
  const notes = /** @type {any[]} */ ([
    { id: 'day-2026-11-02', title: '2026-11-02' }, { id: 'x', title: '2026-11-05' }, { id: 'y', title: 'Plan', daily: '2026-10-30' },
    { id: 'z', title: 'Other' }, { id: 'day-2026-11-09', title: '2026-11-09', _deleted: true },
  ]);
  assert.equal(dayOf(notes[0]), '2026-11-02');
  assert.equal(dayOf(notes[3]), '');
  assert.deepEqual([...dailyMap(notes).keys()].sort(), ['2026-10-30', '2026-11-02', '2026-11-05']);
  assert.equal(nearestDaily(notes, '2026-11-05', -1)?.id, 'day-2026-11-02');
  assert.equal(nearestDaily(notes, '2026-11-02', -1)?.id, 'y');
  assert.equal(nearestDaily(notes, '2026-11-02', 1)?.id, 'x');
  assert.equal(nearestDaily(notes, '2026-11-05', 1), undefined);
});
