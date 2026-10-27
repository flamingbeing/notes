// @core/drive (incubating here, in notes; it moves into app-sync once a second kind of app wants it): notes to Google Drive,
// one Markdown file each, from the existing Google sign-in with the drive.file permission. Named exports only and nothing
// runs on import, so a build keeps only what a page uses.
//   driveToken   the permission, asked by popup when it runs out (token.js)
//   driveRemote  Drive's REST calls: read a file, write it only if unchanged (remote.js)
//   runSync      one tap: every changed note out (sync.js); block.js, paths.js, store.js hold the parts
export { driveToken } from './token.js';
export { driveRemote, DRIVE_SCOPE, FOLDER } from './remote.js';
export { runSync } from './sync.js';
export { planFile, fingerprint, wrapBlock, extractBlock, replaceBlock } from './block.js';
export { notePaths } from './paths.js';
export { idbStore, memoryStore } from './store.js';
