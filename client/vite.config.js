import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import islandLod from './src/world/islandLodPlugin.js';

const SERVER = `http://localhost:${process.env.PORT || 3000}`;

// index.html (the game, Фронт 2) may not exist yet; world-dev.html is the stand-alone world page.
const pages = ['index.html', 'world-dev.html', 'intro-dev.html'].filter((p) => existsSync(new URL(p, import.meta.url)));

export default defineConfig({
  plugins: [islandLod()], // far view of La Gomera (src/world/islandLod.js)
  server: {
    host: true, // доступно по LAN
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER, ws: true },
      '/audio/rt': SERVER, // реплики, сгенерированные на лету; /audio/vo лежит в public
    },
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] }, // импорт из ../shared и ../content
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(pages.map((p) => [p.replace('.html', ''), p])) },
  },
});
