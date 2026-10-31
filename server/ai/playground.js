// Песочница ИИ: чат с агентами в браузере, без игры.
// npm run playground → http://<ip>:3100  (TTS=0 — без голоса)
import { createServer } from 'node:http';
import { readFileSync, createReadStream, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { networkInterfaces } from 'node:os';
import { AI } from './config.js';
import { loadAgents } from './agents.js';
import { resetMemory } from './memory.js';
import { talk, init, status } from './index.js';

const PORT = Number(process.env.PORT) || 3100;
const page = readFileSync(new URL('./playground.html', import.meta.url));

const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    if (req.method === 'GET' && url.pathname === '/agents') {
      const agents = [...loadAgents().values()].map((a) => ({ id: a.id, name: a.name, reactions: Object.keys(a.reactions || {}) }));
      return json(res, 200, agents);
    }
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, await status());
    if (req.method === 'POST' && url.pathname === '/talk') {
      const { userId = 'guest', npc, text, hintId, context } = await body(req);
      return json(res, 200, await talk({ userId: String(userId), npc, text: String(text || '').slice(0, 300), hintId, context }));
    }
    if (req.method === 'POST' && url.pathname === '/reset') {
      const { userId = 'guest', npc } = await body(req);
      resetMemory(String(userId), npc);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith(`${AI.AUDIO_URL}/`)) {
      const file = join(AI.AUDIO_DIR, basename(url.pathname));
      if (!existsSync(file)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      return createReadStream(file).pipe(res);
    }
    json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

const ips = Object.values(networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i.address);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Песочница ИИ: http://localhost:${PORT}${ips.map((ip) => `  http://${ip}:${PORT}`).join('')}`);
  console.log('Загружаю модель и голос…');
  init().then(() => console.log('Готово.'));
});
