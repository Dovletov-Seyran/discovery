import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import islandLod from './src/world/islandLodPlugin.js';

// HTTPS=1 (npm run dev:https): сервер на https/wss со своим CA — прокси ходит туда без проверки сертификата
const SERVER = `${process.env.HTTPS === '1' ? 'https' : 'http'}://localhost:${process.env.PORT || 3000}`;
const to = (extra = {}) => ({ target: SERVER, secure: false, ...extra });

// index.html (the game, Фронт 2) may not exist yet; world-dev.html is the stand-alone world page.
const pages = ['index.html', 'world-dev.html', 'intro-dev.html', 'admin.html'].filter((p) => existsSync(new URL(p, import.meta.url)));

// /admin в dev — та же страница, что в сборке отдаёт сервер (server/http.js)
const adminRoute = () => ({
  name: 'admin-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => { if (req.url === '/admin' || req.url === '/admin/') req.url = '/admin.html'; next(); });
  },
});

export default defineConfig({
  plugins: [islandLod(), adminRoute()], // far view of La Gomera (src/world/islandLod.js); /admin
  server: {
    host: true, // доступно по LAN
    port: 5173,
    proxy: {
      '/api': to(),
      '/ws': to({ ws: true }),
      '/audio/rt': to(), // реплики, сгенерированные на лету; /audio/vo лежит в public
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
