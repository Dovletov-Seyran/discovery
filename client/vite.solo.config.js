// Одиночная сборка для itch.io (npm run build:solo -w client → client/dist-solo):
// игровой сервер работает прямо в странице (src/solo), сохранения — в браузере, ИИ нет (заготовленные фразы).
// Пути относительные (base './'): архив можно открыть с любого адреса.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import islandLod from './src/world/islandLodPlugin.js';
import soloServer from './src/solo/vite-plugin.js';

export default defineConfig({
  base: './',
  plugins: [soloServer(), islandLod()],
  define: { 'import.meta.env.VITE_SOLO': JSON.stringify('1') },
  server: { port: 5174, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: {
    target: 'es2022',
    outDir: 'dist-solo',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { index: 'index.html' } },
  },
});
