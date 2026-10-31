import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AI } from './config.js';

// Память агента о конкретном игроке:
//   told    — id карточек фактов, которые агент уже рассказал;
//   turns   — последние реплики дословно ({ role, content, at });
//   summary — сжатое резюме всех более ранних разговоров (от лица агента);
//   lastAt, lastScene — когда и где говорили в последний раз (чтобы узнать вернувшегося игрока).
// Хранилище — JSON-файл (agent-cli, песочница) или SQLite через setStore() (сервер, таблица agent_memory:
// всё, кроме told, лежит в колонке history одним JSON-объектом — схема таблицы не меняется).

function fileStore(file) {
  let data = {};
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  const key = (userId, agentId) => `${userId}:${agentId}`;
  return {
    load: (userId, agentId) => data[key(userId, agentId)],
    save: (userId, agentId, mem) => {
      data[key(userId, agentId)] = mem;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 1));
    },
    reset: (userId, agentId) => {
      delete data[key(userId, agentId)];
      writeFileSync(file, JSON.stringify(data, null, 1));
    },
  };
}

let store = fileStore(AI.MEMORY_FILE);

export function setStore(s) {
  store = s;
}

export function loadMemory(userId, agentId) {
  const raw = store.load(userId, agentId);
  const h = raw?.history;
  // Старый формат: history — просто массив последних реплик
  const conv = Array.isArray(h) ? { turns: h } : h ?? {};
  return {
    told: raw?.told ?? [],
    turns: conv.turns ?? [],
    summary: conv.summary ?? '',
    lastAt: conv.lastAt ?? null,
    lastScene: conv.lastScene ?? null,
    visits: conv.visits ?? 0,
  };
}

export function saveMemory(userId, agentId, mem) {
  store.save(userId, agentId, {
    told: mem.told,
    history: { turns: mem.turns.slice(-AI.MEMORY_KEEP_TURNS), summary: mem.summary, lastAt: mem.lastAt, lastScene: mem.lastScene, visits: mem.visits },
  });
}

export function resetMemory(userId, agentId) {
  store.reset?.(userId, agentId);
}

// Реплики, которые пора сжать в резюме: всё, что старше последних MEMORY_RECENT_TURNS
export function turnsToCompress(mem) {
  if (mem.turns.length <= AI.MEMORY_COMPRESS_AT) return [];
  return mem.turns.slice(0, mem.turns.length - AI.MEMORY_RECENT_TURNS);
}
