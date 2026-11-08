import {ROLES,escape} from './content.js';

export {loginView} from './auth-view.js';

export function lobbyView(players, you, connected) {
  const local=players.find(player=>player.id===you.id);
  return `<main class="lobby-screen">
    <header class="screen-header"><span class="wordmark">Открытие 1492</span><button id="logout" class="quiet-button">Выйти</button></header>
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
      <header class="hud-header"><span class="wordmark">Открытие 1492</span><button id="menu-button" class="quiet-button">Меню <kbd>Esc</kbd></button></header>
      <aside id="quest" class="quest" hidden></aside><div id="party" class="party"></div>
      <div id="crosshair" class="crosshair" hidden></div><div id="prompt" class="interact-prompt" hidden></div>
      <div id="world-status" class="world-status">Мир не подключён</div>
      <div id="preview-controls" class="preview-controls" hidden><span class="overline">ПРОВЕРКА UI</span><button data-preview="pickup">Предмет</button><button data-preview="dialogue">Диалог</button><button data-preview="astrolabe">Астролябия</button><button data-preview="quest">Задание</button></div>
      <div class="hud-dock" id="hud-dock"><div id="vitals" class="vitals" hidden></div><div id="control-hint" class="control-hint" hidden></div><div id="equipment" class="equipment" hidden></div>
      <footer class="hud-footer"><button id="inventory-button" class="quiet-button">Снаряжение <span id="item-count">0</span><kbd>Tab</kbd></button><button id="journal-button" class="quiet-button">Журнал <kbd>J</kbd></button><span><kbd>Enter</kbd> Чат</span></footer></div>
      <div id="chat-log" class="chat-log" aria-live="polite"></div>
      <form id="chat-form" class="chat-form" hidden><input aria-label="Сообщение команде" maxlength="300" placeholder="Сообщение…"><button class="quiet-button">Отправить</button></form>
      <pre id="debug" class="debug" hidden></pre>
    </div>
    <aside id="scene-progress" class="scene-progress" role="status" aria-live="off" hidden></aside><div id="modal" class="modal-layer" hidden></div><div id="notice" class="notice" role="status" hidden></div>`;
}
