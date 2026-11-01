// Админ-панель /admin: вход по ADMIN_TOKEN, вкладки, опрос сервера.
// Вкладка — { id, title, every (мс между обновлениями), mount(el) → { refresh() } }.
// Сейран добавляет «Агенты»: свой модуль с такой вкладкой и строчка в TABS.
import './admin.css';
import { api, ApiError, hasToken, setToken } from './api.js';
import { escape } from './ui.js';
import { metricsTab } from './metrics.js';
import { universeTab } from './universe.js';
import { controlsTab } from './controls.js';

const TABS = [metricsTab, universeTab, controlsTab];

const root = document.querySelector('#admin');
let active = null, timer = null;

function login(message = '') {
  stop();
  root.innerHTML = `<form class="login" id="login">
    <p class="overline">1492 · АДМИНКА</p>
    <h1>Вход</h1>
    <label for="token">Токен администратора</label>
    <input id="token" type="password" autocomplete="current-password" required autofocus>
    <button class="primary">Войти</button>
    <p class="error" role="alert">${escape(message)}</p>
    <p class="hint">Токен задаётся переменной окружения <code>ADMIN_TOKEN</code> при запуске сервера. Без неё админка выключена.</p>
  </form>`;
  root.querySelector('#login').onsubmit = async (e) => {
    e.preventDefault();
    setToken(root.querySelector('#token').value.trim());
    await start();
  };
}

// Причины отказа сервера понятными словами
function explain(e) {
  if (!(e instanceof ApiError)) return 'Сервер недоступен';
  if (e.status === 401) return 'Неверный токен';
  return e.message;
}

async function start() {
  try {
    await api('GET', '/server');
  } catch (e) {
    setToken('');
    return login(explain(e));
  }
  root.innerHTML = `<header class="bar"><p class="brand">1492 · Админка</p>
      <nav>${TABS.map((t) => `<button data-tab="${t.id}">${escape(t.title)}</button>`).join('')}</nav>
      <span id="status" class="sub"></span><button id="logout" class="quiet">Выйти</button></header>
    <div id="tab" class="tab"></div>`;
  root.querySelector('nav').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) open(b.dataset.tab); };
  root.querySelector('#logout').onclick = () => { setToken(''); login(); };
  let first = TABS[0].id;
  try { first = TABS.some((t) => t.id === localStorage.getItem('discovery.admin.tab')) ? localStorage.getItem('discovery.admin.tab') : first; } catch { /* без запоминания вкладки */ }
  open(first);
}

function stop() { clearTimeout(timer); timer = null; active = null; }

function open(id) {
  stop();
  const tab = TABS.find((t) => t.id === id) ?? TABS[0];
  try { localStorage.setItem('discovery.admin.tab', tab.id); } catch { /* см. выше */ }
  root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab.id ? 'page' : 'false'));
  const el = root.querySelector('#tab');
  el.innerHTML = '';
  const view = tab.mount(el), me = (active = {});
  const status = (text, bad = false) => { const s = root.querySelector('#status'); if (s) { s.textContent = text; s.classList.toggle('bad', bad); } };
  const tick = async () => {
    try {
      await view.refresh();
      status(`обновлено ${new Date().toLocaleTimeString('ru')}`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status === 403)) { setToken(''); return login(explain(e)); }
      status(`${explain(e)} — повтор через ${tab.every / 1000} с`, true);
    }
    if (active === me) timer = setTimeout(tick, tab.every);
  };
  tick();
}

if (hasToken()) start(); else login();
