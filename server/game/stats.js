// Счётчики для /api/health и защиты: сколько чанков отдано каждому игроку.
const served = new Map(); // userId → число отданных чанков

export const chunkStats = {
  add(userId, n = 1) { served.set(userId, (served.get(userId) ?? 0) + n); },
  of(userId) { return served.get(userId) ?? 0; },
  total() { let s = 0; for (const n of served.values()) s += n; return s; },
};
