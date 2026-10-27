// Which of a backup's settings a restore may apply: only those the person has not changed on this account (still at
// their default), so a restore never overwrites a choice. Pure (tested in app/test/backup.unit.test.mjs).

/** @param {unknown} file  the settings file the backup holds (@core/settings' writeFile)
 * @param {(key: string) => unknown} current  the value now @param {Record<string, { default?: unknown }>} options
 * @returns {object | null}  the same file with only those settings, or null when none would change */
export function settingsToAdd(file, current, options) {
  const f = /** @type {{ settings?: Record<string, unknown> } | null} */ (file);
  if (!f || typeof f !== 'object' || !f.settings || typeof f.settings !== 'object') return null;
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(a) === JSON.stringify(b);
  const keep = Object.entries(f.settings).filter(([k, v]) => k in options && same(current(k), options[k].default) && !same(v, options[k].default));
  return keep.length ? { ...f, settings: Object.fromEntries(keep) } : null;
}
