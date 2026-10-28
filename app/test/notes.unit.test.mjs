// The notes core: merge3 (ported with the logbook's tests), links and tags, the record, the merge and conflict copy,
// the link index, backlinks and rename. node --test app/test/notes.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { merge3, MINE_MARK, SPLIT_MARK, THEIRS_MARK } from '../src/notes/merge3.js';
import { linksIn, tagsIn, linkKeys, keyOf, parts } from '../src/notes/parse.js';
import { sizeOf, withDerived, dailyId, dailyNote, isoDay, nextWorkday, mergeNote, conflictCopy, WARN_BYTES, MAX_BYTES } from '../src/notes/model.js';
import { linkIndex, relink, renamePlan } from '../src/notes/links.js';

test('merge3 (the logbook\'s tests)', () => {
  // nothing changed / one side changed
  assert.deepEqual(merge3('a\nb\nc', 'a\nb\nc', 'a\nb\nc'), { text: 'a\nb\nc', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\nc', 'a\nB\nc', 'a\nb\nc'), { text: 'a\nB\nc', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\nc', 'a\nb\nc', 'a\nb\nc\nuser'), { text: 'a\nb\nc\nuser', conflicts: 0 });
  // both changed different lines: both applied
  assert.deepEqual(merge3('1\n2\n3\n4\n5', '1\nTWO\n3\n4\n5', '1\n2\n3\n4\nFIVE'), { text: '1\nTWO\n3\n4\nFIVE', conflicts: 0 });
  // the app adds a case at the end, the user annotated an earlier line
  assert.deepEqual(merge3('AB lscs\nCD hip', 'AB lscs\nCD hip\nEF knee', 'AB lscs (difficult airway)\nCD hip'), { text: 'AB lscs (difficult airway)\nCD hip\nEF knee', conflicts: 0 });
  // the app deletes a line the user didn't touch
  assert.deepEqual(merge3('a\nb\nc', 'a\nc', 'a\nb\nc\nd'), { text: 'a\nc\nd', conflicts: 0 });
  // identical changes on both sides: once
  assert.deepEqual(merge3('a\nb', 'a\nX\nb', 'a\nX\nb'), { text: 'a\nX\nb', conflicts: 0 });
  // conflicting lines: both kept, marked, the app's first
  const c = merge3('a\nb\nc', 'a\nAPP\nc', 'a\nUSER\nc');
  assert.equal(c.conflicts, 1);
  assert.equal(c.text, ['a', MINE_MARK, 'APP', SPLIT_MARK, 'USER', THEIRS_MARK, 'c'].join('\n'));
  // empty base: both sides' text is new; the same text once, different text both kept (added at the end)
  assert.deepEqual(merge3('', 'x\ny', 'x\ny'), { text: 'x\ny', conflicts: 0 });
  assert.deepEqual(merge3('', 'x', 'y'), { text: 'y\nx', conflicts: 0 });
  // both add at the end (a new case, the user's note): both kept, the user's first (under the line it is about)
  assert.deepEqual(merge3('a', 'a\nAPP', 'a\nUSER'), { text: 'a\nUSER\nAPP', conflicts: 0 });
  // the user's reflection on the day's last case stays under that case when the app adds the next one
  assert.deepEqual(merge3('[[2026-10-13]]\n1. AB lap chole', '[[2026-10-13]]\n1. AB lap chole\n\n2. CD hernia', '[[2026-10-13]]\n1. AB lap chole\n   - learnt: X'),
    { text: '[[2026-10-13]]\n1. AB lap chole\n   - learnt: X\n\n2. CD hernia', conflicts: 0 });
  // both add different lines at the same place in the middle: a clash
  assert.equal(merge3('a\nb', 'a\nX\nb', 'a\nY\nb').conflicts, 1);
  // the user deletes a line the app changed: a clash (kept both ways)
  assert.equal(merge3('a\nb\nc', 'a\nB\nc', 'a\nc').conflicts, 1);
  assert.deepEqual(merge3('', '', 'user only'), { text: 'user only', conflicts: 0 });
  assert.deepEqual(merge3('', 'app only', ''), { text: 'app only', conflicts: 0 });
  // everything emptied by the user, the app unchanged: stays empty
  assert.deepEqual(merge3('a\nb', 'a\nb', ''), { text: '', conflicts: 0 });
  // CRLF anywhere merges as \n
  assert.deepEqual(merge3('a\r\nb', 'a\r\nb\r\nc', 'a\nb'), { text: 'a\nb\nc', conflicts: 0 });
  // trailing newline: a change only there is a change like any other
  assert.deepEqual(merge3('a\nb', 'a\nb\n', 'a\nb'), { text: 'a\nb\n', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\n', 'a\nb\n', 'a\nb\nmore\n'), { text: 'a\nb\nmore\n', conflicts: 0 });
  // repeated lines don't confuse it
  assert.deepEqual(merge3('-\n-\n-', '-\nx\n-\n-', '-\n-\n-\ny'), { text: '-\nx\n-\n-\ny', conflicts: 0 });
  // a long day merges quickly
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  const t0 = Date.now();
  const r = merge3(big.join('\n'), [...big.slice(0, 1500), 'APP', ...big.slice(1500)].join('\n'), [...big.slice(0, 10), 'USER', ...big.slice(10)].join('\n'));
  assert.equal(r.conflicts, 0); assert.ok(r.text.includes('APP') && r.text.includes('USER')); assert.ok(Date.now() - t0 < 2000);
});

test('links: targets, headings, aliases, embeds; none in code', () => {
  const t = 'See [[Alpha]], [[Beta#Part 2|the beta]] and ![[Pic.png]] and [[#Local]].\n`[[NotThis]]`\n```\n[[Nor]]\n```\n[[ gamma  note ]]';
  assert.deepEqual(linksIn(t).map(l => [l.target, l.heading, l.alias, l.embed]),
    [['Alpha', '', '', false], ['Beta', 'Part 2', 'the beta', false], ['Pic.png', '', '', true], ['', 'Local', '', false], ['gamma  note', '', '', false]]);
  assert.deepEqual(linkKeys(t), ['alpha', 'beta', 'pic.png', 'gamma note']);
  assert.equal(keyOf(' Some  Note.md '), 'some note');
  // an unclosed fence runs to the end
  assert.deepEqual(linkKeys('a [[x]]\n```\n[[y]]'), ['x']);
  assert.equal(parts('').length, 0);
});

test('tags: body and front matter, not headings, numbers, links or code', () => {
  assert.deepEqual(tagsIn('# Heading\nA #todo and #Area/Work, not a#b or #123 or `#code`.\n[[x#y]] #todo'), ['todo', 'area/work']);
  assert.deepEqual(tagsIn('---\ntags: [one, "two"]\n---\nbody #three'), ['one', 'two', 'three']);
  assert.deepEqual(tagsIn('---\ntitle: x\ntags:\n  - alpha\n  - beta\n---\n'), ['alpha', 'beta']);
  assert.deepEqual(tagsIn('---\ntag: solo\n---\n#solo'), ['solo']);
  // a # in the front matter itself is not a body tag
  assert.deepEqual(tagsIn('---\ncolor: "#fff"\n---\nhi'), []);
});

test('record: derived fields, size limits, daily ids', () => {
  const n = withDerived({ id: 'a', title: ' T ', path: '/Work//Ideas/', body: 'see [[B]] #x' });
  assert.deepEqual([n.title, n.path, n.links, n.tags, n.aliases], ['T', 'Work/Ideas', ['b'], ['x'], []]);
  assert.equal(sizeOf('short'), 'ok');
  assert.equal(sizeOf('x'.repeat(WARN_BYTES + 1)), 'warn');
  assert.equal(sizeOf('x'.repeat(MAX_BYTES + 1)), 'too-big');
  assert.equal(sizeOf('é'.repeat(MAX_BYTES / 2 + 1)), 'too-big');   // bytes, not characters
  assert.equal(isoDay(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dailyId('2026-10-26'), 'day-2026-10-26');
  assert.equal(nextWorkday(new Date(2026, 9, 28)), '2026-10-29');   // Wed -> Thu
  assert.equal(nextWorkday(new Date(2026, 9, 30)), '2026-11-02');   // Fri -> Mon
  assert.equal(nextWorkday(new Date(2026, 9, 31)), '2026-11-02');   // Sat -> Mon
  assert.equal(nextWorkday(new Date(2026, 11, 31)), '2027-01-01');  // year end
  assert.deepEqual([dailyNote('2026-10-26', 'Daily').id, dailyNote('2026-10-26', 'Daily').title, dailyNote('2026-10-26').daily], ['day-2026-10-26', '2026-10-26', '2026-10-26']);
});

test('merge: both devices\' lines kept; fields by who changed them; links follow the body', () => {
  const base = withDerived({ id: 'n', title: 'Plan', path: '', body: 'one\ntwo\nthree' });
  const theirs = withDerived({ ...base, body: 'one\ntwo\nthree\n[[Later]]', path: 'Work' });
  const mine = withDerived({ ...base, body: 'ONE\ntwo\nthree', title: 'Plan v2', aliases: ['Plan'] });
  const m = mergeNote(theirs, mine, base);
  assert.equal(m.body, 'ONE\ntwo\nthree\n[[Later]]');
  assert.deepEqual([m.title, m.path, m.links, m.aliases], ['Plan v2', 'Work', ['later'], ['Plan']]);
  // a resend of what is already there changes nothing
  assert.equal(mergeNote(m, mine, base).body, m.body);
  // the same daily note made on two devices (no base): both texts, the server's first
  assert.equal(mergeNote(withDerived({ id: 'd', title: 'd', body: 'from A' }), withDerived({ id: 'd', title: 'd', body: 'from B' }), null).body, 'from A\nfrom B');
  // no server copy (new, or deleted elsewhere): this device's record
  assert.equal(mergeNote(null, mine, base).body, 'ONE\ntwo\nthree');
  // a delete wins
  assert.deepEqual(mergeNote(theirs, { id: 'n', title: '', body: '', _deleted: true }, base)._deleted, true);
});

test('merge: a clash throws write-conflict with the server copy; the conflict copy keeps this device\'s text', () => {
  const base = withDerived({ id: 'n', title: 'Plan', body: 'a\nb\nc' });
  const theirs = withDerived({ ...base, body: 'a\nTHEIRS\nc' });
  const mine = withDerived({ ...base, body: 'a\nMINE\nc', path: 'P' });
  assert.throws(() => mergeNote(theirs, mine, base), (/** @type {any} */ e) => e.code === 'write-conflict' && e.remote === theirs);
  const c = conflictCopy(mine, { key: 'notes/n/17:3', device: 'Phone', at: '26 Oct 20:15' });
  assert.equal(c.id, 'conflict-notesn173');
  assert.equal(c.title, 'Plan (conflict, Phone, 26 Oct 20:15)');
  assert.deepEqual([c.body, c.path], ['a\nMINE\nc', 'P']);
  assert.equal(conflictCopy(mine, { key: 'notes/n/17:3', device: 'Phone', at: 'x' }).id, c.id, 'same save, same copy');
});

const notes = () => [
  withDerived({ id: '1', title: 'Alpha', body: 'to [[Beta]] and [[beta#h|B]]' }),
  withDerived({ id: '2', title: 'Beta', body: 'back to [[alpha]]' }),
  withDerived({ id: '3', title: 'Gamma', path: 'Old', body: '[[Old/Gamma]] `[[Beta]]` [[Missing]]' }),
  withDerived({ id: '4', title: 'Gamma', path: 'Archive/Deep', body: 'x' }),
  withDerived({ id: '5', title: 'Renamed', aliases: ['Delta'], body: 'y' }),
  withDerived({ id: '6', title: 'Eps', body: '[[Delta]] [[Gamma]]' }),
];

test('link index: titles, paths, aliases, the shortest path for a shared title; backlinks', () => {
  const idx = linkIndex(notes());
  assert.equal(idx.resolve('beta')?.id, '2');
  assert.equal(idx.resolve('Missing'), null);
  assert.equal(idx.resolve('Gamma')?.id, '3');
  assert.equal(idx.resolve('archive/deep/gamma')?.id, '4');
  assert.equal(idx.resolve('Delta')?.id, '5');
  assert.deepEqual(idx.backlinks('2').map(n => n.id), ['1']);
  assert.deepEqual(idx.backlinks('1').map(n => n.id), ['2']);
  assert.deepEqual(idx.backlinks('5').map(n => n.id), ['6']);
  assert.deepEqual(idx.backlinks('3').map(n => n.id), ['6'], 'not itself');
});

test('rename: rewrites links in the space (heading and alias kept, code left), old title kept as an alias', () => {
  assert.equal(relink('[[Beta]] [[beta#h|B]] ![[Beta]] `[[Beta]]` [[Betamax]]', 'Beta', 'Bee'), '[[Bee]] [[Bee#h|B]] ![[Bee]] `[[Beta]]` [[Betamax]]');
  const all = notes();
  const plan = renamePlan(all, all[1], 'Bee');
  assert.deepEqual(plan.map(p => p.record.id), ['2', '1']);
  assert.deepEqual([plan[0].record.title, plan[0].record.aliases], ['Bee', ['Beta']]);
  assert.equal(plan[1].record.body, 'to [[Bee]] and [[Bee#h|B]]');
  assert.deepEqual(plan[1].record.links, ['bee']);
  assert.equal(plan[1].base, all[0]);
  assert.deepEqual(renamePlan(all, all[1], 'Beta'), []);
  // a shared title: renaming one Gamma leaves links that still mean the other alone
  const g = renamePlan(all, all[3], 'Gamma 2');
  assert.deepEqual(g.map(p => p.record.id), ['4']);
  // renaming the Gamma that [[Gamma]] meant relinks it (judged before the rename), and [[Old/Gamma]] too
  const h = renamePlan(all, all[2], 'Gamma 1');
  assert.deepEqual(h.map(p => p.record.id), ['3', '6']);
  assert.equal(h[0].record.body, '[[Old/Gamma 1]] `[[Beta]]` [[Missing]]');
  assert.equal(h[1].record.body, '[[Delta]] [[Gamma 1]]');
});
