// npm run reset — очистить сцену и прогресс игроков (пользователи остаются). Сервер должен быть остановлен.
import { resetProgress, closeDb } from '../db.js';

resetProgress();
closeDb();
console.log('Прогресс сброшен: game_state, player_state, agent_memory. Пользователи сохранены.');
