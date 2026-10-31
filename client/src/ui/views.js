import {ROLES,escape} from './content.js';

export function loginView(preview) {
  return `<main class="login-screen">
    <div class="title-block"><span class="overline">DISCOVERY</span><h1>1492</h1><div class="title-rule"><i></i></div></div>
    <form id="login-form" class="login-form">
      <h2>${preview?'Проверка интерфейса':'Вход'}</h2>
      <label for="login-name">Имя</label><input id="login-name" name="login" autocomplete="username" minlength="3" maxlength="20" required>
      ${preview?'':'<label for="login-password">Пароль</label><input id="login-password" type="password" name="password" autocomplete="current-password" minlength="4" required>'}
      <p id="login-error" class="error" role="alert"></p>
      <button class="primary" id="login-submit">${preview?'Продолжить':'Войти'}</button>
      ${preview?'':'<button type="button" id="register" class="quiet-button">Создать аккаунт</button>'}
    </form>
    <footer class="login-footer">${preview?'<a href="/">Вход на сервер</a>':'<a href="/?offline=1">Проверка UI</a>'}</footer>
  </main>`;
}

export function lobbyView(players, you, connected) {
  const local=players.find(player=>player.id===you.id);
  return `<main class="lobby-screen">
    <header class="screen-header"><span class="wordmark">1492</span><button id="logout" class="quiet-button">Выйти</button></header>
    <section class="lobby-content"><span class="overline">ЭКИПАЖ</span><h2>Выберите роль</h2>
      <div class="role-list">${ROLES.map((role,index)=>{
        const owner=players.find(player=>player.role===role.id&&player.id!==you.id);
        const selected=local?.role===role.id;
        return `<button class="role-option ${selected?'selected':''}" data-role="${role.id}" aria-pressed="${selected}" ${owner||!connected?'disabled':''}>
          <span class="role-number">0${index+1}</span><span class="role-info"><strong>${role.name}</strong><span>${escape(owner?owner.name:role.description)}</span></span><span class="selection-mark" aria-hidden="true">${selected?'◆':'◇'}</span>
        </button>`;
      }).join('')}</div>
      <div class="crew-list">${players.map(player=>`<span>${escape(player.name)}<small>${player.connected===false?'нет связи':player.ready?'готов':''}</small></span>`).join('')}</div>
      <button id="ready" class="primary" ${!local?.role||!connected?'disabled':''}>${local?.ready?'Не готов':'Готов'}</button>
    </section>
  </main>`;
}

export function shellView() {
  return `<div id="connection" class="connection" role="status" hidden></div><div id="screen"></div>
    <div id="hud" hidden>
      <header class="hud-header"><span class="wordmark">1492</span><button id="menu-button" class="quiet-button">Меню <kbd>Esc</kbd></button></header>
      <aside id="quest" class="quest" hidden></aside><div id="party" class="party"></div>
      <div id="crosshair" class="crosshair" hidden></div><div id="prompt" class="interact-prompt" hidden></div>
      <div id="world-status" class="world-status">Мир не подключён</div>
      <div id="preview-controls" class="preview-controls" hidden><span class="overline">ПРОВЕРКА UI</span><button data-preview="pickup">Предмет</button><button data-preview="dialogue">Диалог</button><button data-preview="astrolabe">Астролябия</button><button data-preview="quest">Задание</button></div>
      <footer class="hud-footer"><button id="inventory-button" class="quiet-button">Снаряжение <span id="item-count">0 / 8</span><kbd>Tab</kbd></button><span><kbd>Enter</kbd> Чат</span></footer>
      <div id="chat-log" class="chat-log" aria-live="polite"></div>
      <form id="chat-form" class="chat-form" hidden><input aria-label="Сообщение команде" maxlength="300" placeholder="Сообщение…"><button class="quiet-button">Отправить</button></form>
      <pre id="debug" class="debug" hidden></pre>
    </div>
    <div id="modal" class="modal-layer" hidden></div><div id="notice" class="notice" role="status" hidden></div>`;
}
