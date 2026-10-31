// Заглушка точки входа — её заменит Фронт 2.
import { CONFIG } from '../../shared/config.js';

document.getElementById('ui').textContent = `1492 · сервер :${CONFIG.PORT}`;
