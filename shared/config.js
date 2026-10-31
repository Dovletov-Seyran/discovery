// Общие настройки клиента и сервера. Меняем, предупредив в общем чате.
// globalThis.process: в браузере process нет, обычный process?.env упал бы с ReferenceError.
const env = globalThis.process?.env ?? {};

export const CONFIG = {
  PORT: Number(env.PORT) || 3000,
  TICK_HZ: 15,                 // снимки и движение
  CHUNK_SIZE: 32,              // метры
  LOAD_RADIUS: 2,              // клиент: 5×5 чанков
  SERVER_RADIUS: 3,            // сервер отдаёт чанки не дальше
  CACHE_FRACTION: 0.10,        // лимит кеша клиента
  MAX_SPEED: 7,                // м/с, бег
  INTERACT_DIST: 3,            // м
  DEMO_MODE: env.DEMO === '1',
  DEV: env.DEV === '1',

  // Сеть
  AUTH_TIMEOUT_MS: 3000,       // нет auth за это время — закрываем
  PING_INTERVAL_MS: 10000,
  MAX_MSG_BYTES: 4096,
  CHAT_MAX_LEN: 300,
  NPC_TALK_COOLDOWN_MS: 2000,
  TRADE_COOLDOWN_MS: 1000,
  SCARE_COOLDOWN_MS: 20000,    // «Бу!»
  MAX_CHUNK_KEYS: 30,          // ключей в одном chunk_req

  // Игроки и сохранение
  DISCONNECT_GRACE_MS: 60000,  // отключённый игрок столько остаётся в партии
  SAVE_DELAY_MS: 2000,         // отложенная запись player_state
  SAVE_INTERVAL_MS: 10000,     // периодическое сохранение всех

  // Сцены
  SCENE_START_DELAY_MS: 1500,  // startAt = now + это, чтобы все начали одновременно
  TOD_INTERVAL_MS: 2000,
};
