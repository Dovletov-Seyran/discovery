// Вкладка «Управление»: сменить сцену, сбросить прогресс, выгнать игрока, объявление всем.
import { api } from './api.js';
import { escape, ROLE_NAMES } from './ui.js';

export const controlsTab = {
  id: 'controls',
  title: 'Управление',
  every: 3000,
  mount(el) {
    el.innerHTML = `<section><h2>Сцена</h2>
        <div class="row"><select id="scene" aria-label="Сцена"></select><button id="go" class="primary">Перейти</button><span id="now" class="sub"></span></div></section>
      <section><h2>Объявление</h2>
        <form class="row" id="announce"><input id="text" maxlength="300" placeholder="Текст для всех игроков" aria-label="Объявление" required><button class="primary">Отправить всем</button></form></section>
      <section><h2>Игроки</h2><div class="table-wrap"><table><thead><tr><th>Игрок</th><th>Роль</th><th>Зона</th><th>Состояние</th><th></th></tr></thead><tbody id="players"></tbody></table></div></section>
      <section><h2>Деревня таино</h2>
        <div class="row"><span id="village" class="sub">—</span><button id="calm">Успокоить деревню</button></div></section>
      <section><h2>Сброс</h2>
        <div class="row"><button id="reset" class="danger">Сбросить прогресс</button><span class="sub">Все задания, инвентарь и сцена — с начала. Аккаунты остаются.</span></div></section>
      <div id="done" role="status" class="result"></div>`;
    const $ = (s) => el.querySelector(s);
    const done = (text, cls = 'ok') => { $('#done').className = `result ${cls}`; $('#done').textContent = text; };
    const run = async (fn, ok) => { try { await fn(); done(ok); } catch (e) { done(e.message, 'bad'); } };

    $('#go').onclick = () => {
      const id = $('#scene').value;
      if (confirm(`Перевести всех в сцену ${id}?`)) run(() => api('POST', '/scene', { id }), `Сцена: ${id}`);
    };
    $('#announce').onsubmit = (e) => {
      e.preventDefault();
      const text = $('#text').value.trim();
      if (text) run(async () => { await api('POST', '/announce', { text }); $('#text').value = ''; }, 'Объявление отправлено');
    };
    $('#calm').onclick = () => run(() => api('POST', '/combat/calm'), 'Деревня успокоена: воины ушли, обиды забыты');
    $('#reset').onclick = () => {
      if (confirm('Сбросить прогресс всех игроков и начать сначала?')) run(() => api('POST', '/reset'), 'Прогресс сброшен');
    };
    $('#players').onclick = (e) => {
      const b = e.target.closest('[data-kick]');
      if (b && confirm(`Отключить ${b.dataset.name}? Место в экипаже освободится.`)) run(() => api('POST', '/kick', { id: Number(b.dataset.kick) }), `${b.dataset.name} отключён`);
    };

    let sceneIds = '';
    return {
      async refresh() {
        const [u, c, war] = await Promise.all([api('GET', '/universe'), api('GET', '/clients'), api('GET', '/combat')]);
        const names = Object.fromEntries(c.clients.map((p) => [p.id, p.name]));
        $('#village').textContent = `${{ calm: 'спокойно', alert: 'тревога — воины на посту', fight: 'бой' }[war.level] ?? war.level}${war.offenders.length ? ` · обидчики: ${war.offenders.map((id) => names[id] ?? id).join(', ')}` : ''}${war.warriors.length ? ` · воинов ${war.warriors.filter((w) => w.state !== 'down').length} из ${war.warriors.length}` : ''}`;
        const ids = u.scenes.map((s) => s.id).join();
        if (ids !== sceneIds) {
          sceneIds = ids;
          $('#scene').innerHTML = u.scenes.map((s) => `<option value="${escape(s.id)}">${escape(s.id)} — ${escape(s.type)}</option>`).join('');
          $('#scene').value = u.scene.id;
        }
        $('#now').textContent = `сейчас: ${u.scene.id}`;
        $('#players').innerHTML = c.clients.length ? c.clients.map((p) => `<tr>
          <td><strong>${escape(p.name)}</strong></td><td>${escape(ROLE_NAMES[p.role] ?? '—')}</td><td>${escape(p.zone ?? '—')}</td>
          <td>${p.connected ? '<span class="dot on"></span>в сети' : '<span class="dot off"></span>отключился, место держится минуту'}</td>
          <td class="num"><button class="danger small" data-kick="${p.id}" data-name="${escape(p.name)}">Выгнать</button></td></tr>`).join('')
          : '<tr><td colspan="5" class="empty">Никого нет</td></tr>';
      },
    };
  },
};
