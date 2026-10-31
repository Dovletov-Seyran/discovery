import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

// index.html (the game, Фронт 2) may not exist yet; world-dev.html is the stand-alone world page.
const pages = ['index.html', 'world-dev.html'].filter((p) => existsSync(new URL(p, import.meta.url)));

export default defineConfig({
  server: {
    host: true,
    // content/*.json lives next to client/
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2022',
    rollupOptions: { input: Object.fromEntries(pages.map((p) => [p.replace('.html', ''), p])) },
  },
});
