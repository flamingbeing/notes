// Vite, as a check only (README, "Switch to Vite in one PR"): nothing ships from it. `npx vite build` builds app/ into
// dist/ with the same layout the Worker serves (index.html, public/ at the root), and CI runs the whole browser suite
// on dist/ too, so the switch stays one small PR. Everything the import map names stays external: the page still
// loads core, Firebase (vendored) and register.js through the map, at the versions it pins.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Where each local module's source is, for builds that bundle core from source (tools/vite-pieces.mjs); this build
// keeps them external like the rest of core. `node tools/add.mjs <recipe>` writes the lines after the mark.
export const SOURCE_ALIAS = {
  '@core/search': 'app/public/search/index.js',
  '@core/drive': 'app/public/drive/index.js',
};

export default defineConfig({
  root: 'app',
  base: './',
  logLevel: 'warn',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // both pages: the classic one and the Ionic trial's (ionic/, its own import map), as the Worker serves them
    rollupOptions: {
      input: { main: fileURLToPath(new URL('app/index.html', import.meta.url)), ionic: fileURLToPath(new URL('app/ionic/index.html', import.meta.url)) },
      external: id => /^(@core\/|@vendor\/|firebase\/|app-update\/|https:\/\/|marked$|dompurify$|fflate$|xlsx$)/.test(id),
    },
  },
});
