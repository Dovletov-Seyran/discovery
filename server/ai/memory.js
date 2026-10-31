import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AI } from './config.js';

// Память агента о конкретном игроке: что уже рассказал (told) и последние реплики (history).
// По умолчанию — JSON-файл (для agent-cli). Бэк 1 подменяет хранилище на SQLite через setStore().

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
  const mem = store.load(userId, agentId);
  return { told: mem?.told ?? [], history: mem?.history ?? [] };
}

export function saveMemory(userId, agentId, mem) {
  store.save(userId, agentId, { told: mem.told, history: mem.history.slice(-AI.HISTORY) });
}

export function resetMemory(userId, agentId) {
  store.reset?.(userId, agentId);
}
