// HTTP: /api/*, статика клиента (client/dist) и аудио /audio/rt/ (data/audio/rt).
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../shared/config.js';
import { DATA_DIR } from './db.js';
import * as auth from './auth.js';
import * as ai from './game/ai-bridge.js';
import { players } from './game/players.js';
import { chunkStats } from './game/stats.js';

const CLIENT_DIST = fileURLToPath(new URL('../client/dist/', import.meta.url));
const DEV_PAGE = fileURLToPath(new URL('./dev/', import.meta.url));
const SHARED = fileURLToPath(new URL('../shared/', import.meta.url));
const AUDIO_RT = join(DATA_DIR, 'audio', 'rt');
const MAX_BODY = 4096;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        // Дальше не копим, остаток дочитываем вхолостую, чтобы клиент получил ответ 413
        req.removeAllListeners('data');
        req.resume();
        reject(new Error('too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

// Файл внутри root или null (защита от ../).
function resolveFile(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  const full = normalize(join(base, rel));
  if (!full.startsWith(base)) return null;
  try {
    const st = statSync(full);
    return st.isFile() ? { full, size: st.size } : null;
  } catch { return null; }
}

function sendFile(res, file, cache) {
  res.writeHead(200, {
    'Content-Type': MIME[extname(file.full).toLowerCase()] || 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': cache,
  });
  createReadStream(file.full).pipe(res);
}

async function handleApi(req, res, path) {
  if (req.method === 'GET' && path === '/api/health') {
    const s = ai.status();
    return sendJson(res, 200, {
      ok: true, ollama: !!s.ollama, tts: !!s.tts, model: s.model ?? null,
      players: players.connectedCount(), chunksServed: chunkStats.total(),
      chunks: players.connected().map((p) => ({ name: p.name, served: chunkStats.of(p.id), loaded: p.chunks?.size ?? 0 })),
      demo: CONFIG.DEMO_MODE, dev: CONFIG.DEV,
    });
  }
  if (req.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
    let body;
    try { body = await readJson(req); } catch (e) {
      if (e.message === 'too_large') return sendJson(res, 413, { error: 'too_large', message: 'Слишком большой запрос' });
      return sendJson(res, 400, { error: 'bad_request', message: 'Некорректный запрос' });
    }
    const result = path === '/api/register' ? await auth.register(body) : await auth.login(body);
    return sendJson(res, result.status, result.body);
  }
  sendJson(res, 404, { error: 'not_found' });
}

export async function handleHttp(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) return await handleApi(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method' });

    if (path.startsWith('/audio/rt/')) {
      const file = resolveFile(AUDIO_RT, path.slice('/audio/rt/'.length));
      return file ? sendFile(res, file, 'no-cache') : sendJson(res, 404, { error: 'not_found' });
    }

    // Dev-страница для проверки сервера без клиента: /dev/ (только DEV=1)
    if (CONFIG.DEV && (path === '/dev' || path.startsWith('/dev/') || path.startsWith('/shared/'))) {
      if (path === '/dev') { res.writeHead(302, { Location: '/dev/' }); return res.end(); }
      const file = path.startsWith('/shared/')
        ? resolveFile(SHARED, path.slice('/shared/'.length))
        : resolveFile(DEV_PAGE, path === '/dev/' ? 'index.html' : path.slice('/dev/'.length));
      return file ? sendFile(res, file, 'no-cache') : sendJson(res, 404, { error: 'not_found' });
    }

    const file = resolveFile(CLIENT_DIST, path === '/' ? 'index.html' : path.slice(1));
    if (file) return sendFile(res, file, path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');

    // SPA: всё остальное без расширения → index.html
    const index = !extname(path) && resolveFile(CLIENT_DIST, 'index.html');
    if (index) return sendFile(res, index, 'no-cache');
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end('<meta charset="utf-8"><p>Клиент не собран: <code>npm run build</code> или dev-сервер Vite на :5173.</p>');
    }
    sendJson(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[http]', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
    else res.destroy();
  }
}
