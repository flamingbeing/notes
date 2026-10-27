// The backup as a .json.gz file and back, with the browser's own gzip (no library). Reads a plain .json too.
import { checkBackup } from './backup.js';

/** @param {ReadableWritablePair<Uint8Array, Uint8Array>} stream @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
async function through(stream, bytes) {
  return new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(stream)).arrayBuffer());
}
const isGzip = (/** @type {Uint8Array} */ b) => b[0] === 0x1f && b[1] === 0x8b;

/** @param {import('./types').Backup} data @returns {Promise<Uint8Array>} */
export const packBackup = data => through(new CompressionStream('gzip'), new TextEncoder().encode(JSON.stringify(data)));

/** @param {Uint8Array} bytes @returns {Promise<import('./types').Backup>} */
export async function unpackBackup(bytes) {
  let text;
  try { text = new TextDecoder().decode(isGzip(bytes) ? await through(new DecompressionStream('gzip'), bytes) : bytes); } catch { throw new Error('That file can’t be opened (not a backup).'); }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That isn’t a backup (not JSON).'); }
  return checkBackup(data);
}

/** @param {Date} [now] @returns {string} */
export const backupName = (now = new Date()) => `notes-backup-${now.toISOString().slice(0, 10)}.json.gz`;
