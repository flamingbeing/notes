// The bin's pure parts: a deleted note's entry ({ id, kind, data, deletedAt }, written by the delete itself, cloud.js
// onCommit) is kept 30 days, can be restored, then is purged.
export const BIN_DAYS = 30;
const DAY = 864e5;

/** @param {number} deletedAt @param {number} [now] */
export const daysLeft = (deletedAt, now = Date.now()) => Math.max(0, Math.ceil((deletedAt + BIN_DAYS * DAY - now) / DAY));
/** @param {{ deletedAt?: unknown }} entry @param {number} [now] */
export const isExpired = (entry, now = Date.now()) => {
  const at = Number(entry.deletedAt);
  return Number.isFinite(at) && at > 0 && at <= now && at < now - BIN_DAYS * DAY;   // no date, or one in the future: kept, never purged
};
/** @param {{ deletedAt: number }} entry @param {number} [now] */
export function binLabel(entry, now = Date.now()) {
  const ago = Math.max(0, Math.floor((now - entry.deletedAt) / DAY)), left = daysLeft(entry.deletedAt, now);
  return `deleted ${ago === 0 ? 'today' : ago === 1 ? '1 day ago' : `${ago} days ago`} · ${left} ${left === 1 ? 'day' : 'days'} left`;
}
/** the note an entry holds, ready to save again (the server's stamps and the delete mark left off), or null
 * @param {{ kind?: unknown, data?: any }} entry @param {string} coll the notes' collection */
export function noteOf(entry, coll) {
  const d = entry?.data;
  if (entry?.kind !== coll || !d || typeof d.id !== 'string' || !d.id || typeof d.title !== 'string') return null;
  const { serverAt, updatedAt, _deleted, _edits, ...note } = d;
  return note;
}
/** the entries to show (notes only), newest delete first, and the ones past 30 days to purge
 * @param {{ id: string, kind?: unknown, deletedAt: number, data?: any }[]} entries @param {string} coll @param {number} [now] */
export function sortBin(entries, coll, now = Date.now()) {
  const live = entries.filter(e => !isExpired(e, now));
  return { show: live.filter(e => noteOf(e, coll)).sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0)), purge: entries.filter(e => isExpired(e, now)) };
}
