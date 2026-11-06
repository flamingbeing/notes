// Daily notes by date, for the right sidebar's Calendar and the daily note commands (pure: the unit tests read it in
// Node; plain Date maths, no date library). Dates are 'YYYY-MM-DD' in this device's calendar, as notes/model.js isoDay.
import { isoDay } from '../notes/model.js';

/** @typedef {import('../notes/model.js').Note} Note */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** the date a daily note is for ('' : not a daily note) @param {Note} n */
export const dayOf = n => {
  if (!n || n._deleted) return '';
  if (typeof n.daily === 'string' && ISO.test(n.daily)) return n.daily;
  const m = /^day-(\d{4}-\d{2}-\d{2})$/.exec(n.id || '');
  if (m) return m[1];
  return ISO.test(n.title || '') ? n.title : '';
};

/** every date with a daily note -> that note (the first found) @param {Note[]} notes */
export function dailyMap(notes) {
  /** @type {Map<string, Note>} */
  const out = new Map();
  for (const n of notes) { const d = dayOf(n); if (d && !out.has(d)) out.set(d, n); }
  return out;
}

/**
 * the daily note nearest before (dir -1) or after (dir 1) a date, or none
 * @param {Note[]} notes @param {string} iso @param {-1 | 1} dir @returns {Note | undefined}
 */
export function nearestDaily(notes, iso, dir) {
  let best = '';
  /** @type {Note | undefined} */
  let note;
  for (const [d, n] of dailyMap(notes)) {
    if (dir < 0 ? d < iso && d > best : d > iso && (!best || d < best)) { best = d; note = n; }
  }
  return note;
}

/**
 * a month's grid, Monday first: whole weeks from the one holding the 1st to the one holding the last day
 * @param {number} year @param {number} month  0 (January) to 11
 * @param {string} [today]  'YYYY-MM-DD'
 * @returns {{ title: string, year: number, month: number, days: { iso: string, day: number, inMonth: boolean, today: boolean }[] }}
 */
export function monthGrid(year, month, today = isoDay()) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;   // (days of the week before, from Monday)
  const inMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + inMonth) / 7);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(year, month, 1 - lead + i);
    const iso = isoDay(d);
    days.push({ iso, day: d.getDate(), inMonth: d.getMonth() === first.getMonth(), today: iso === today });
  }
  return { title: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`, year: first.getFullYear(), month: first.getMonth(), days };
}
