import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const SERVER = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
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
  build: { outDir: 'dist', emptyOutDir: true },
});
