// npm run reset — очистить сцену и прогресс игроков (пользователи и мир остаются).
// Сервер должен быть остановлен: иначе он перезапишет базу своим состоянием из памяти.
import { connect } from 'node:net';
import { CONFIG } from '../../shared/config.js';

// Кто-то слушает порт — значит, сервер запущен (по http или https, неважно)
const busy = await new Promise((resolve) => {
  const s = connect(CONFIG.PORT, '127.0.0.1');
  s.setTimeout(700);
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('timeout', () => { s.destroy(); resolve(false); });
  s.once('error', () => resolve(false));
});
if (busy) {
  console.error(`Сервер на :${CONFIG.PORT} запущен — остановите его (Ctrl+C) и повторите. В dev-режиме можно /reset в чате.`);
  process.exit(1);
}

const { resetProgress, closeDb } = await import('../db.js');
resetProgress();
closeDb();
console.log('Прогресс сброшен: сцена, состояние игроков, память агентов. Пользователи и мир сохранены.');
