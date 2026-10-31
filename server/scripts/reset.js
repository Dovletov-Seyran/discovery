// npm run reset — очистить сцену и прогресс игроков (пользователи и мир остаются).
// Сервер должен быть остановлен: иначе он перезапишет базу своим состоянием из памяти.
import { CONFIG } from '../../shared/config.js';

try {
  const res = await fetch(`http://127.0.0.1:${CONFIG.PORT}/api/health`, { signal: AbortSignal.timeout(700) });
  if (res.ok) {
    console.error(`Сервер на :${CONFIG.PORT} запущен — остановите его (Ctrl+C) и повторите. В dev-режиме можно /reset в чате.`);
    process.exit(1);
  }
} catch {
  // не отвечает — значит, остановлен
}

const { resetProgress, closeDb } = await import('../db.js');
resetProgress();
closeDb();
console.log('Прогресс сброшен: сцена, состояние игроков, память агентов. Пользователи и мир сохранены.');
