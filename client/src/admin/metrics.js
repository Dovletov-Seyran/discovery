// Вкладка «Метрики»: клиенты (fps, ping, draw calls, чанки, память) и сервер (процессор, память, такт,
// сообщения, чанки). Клиенты присылают client_stats раз в 2 с, сервер хранит по 60 точек на игрока.
import { api } from './api.js';
import { escape, fmt, ago, spark, level, ROLE_NAMES } from './ui.js';

const STALE_MS = 6000; // отчёта дольше — клиент молчит (вкладка свёрнута или связь пропала)

function serverCards(s) {
  const h = s.history, last = h.at(-1) ?? {}, col = (k) => h.map((x) => x[k]);
  const card = (title, value, sub, graph, cls = '') => `<article class="card ${cls}"><h3>${title}</h3><p class="value">${value}</p><p class="sub">${sub}</p>${graph}</article>`;
  return [
    card('Процессор', fmt(last.cpu, 0, '%'), 'одного ядра', spark(col('cpu'), { max: 100 }), level(last.cpu, 60, 90)),
    card('Память', fmt(last.rss, 0, ' МБ'), `куча JS ${fmt(last.heap, 0, ' МБ')}`, spark(col('rss'))),
    card('Такт', fmt(last.tick, 1, ' Гц'), `цель ${s.tickTarget} Гц · задержка цикла p99 ${fmt(last.lag, 1, ' мс')}`, spark(col('tick'), { max: s.tickTarget * 1.2 }), level(last.tick, s.tickTarget * 0.8, s.tickTarget * 0.5, true)),
    card('Сообщения', `${fmt(last.msgIn, 0)} / ${fmt(last.msgOut, 0)}`, `в секунду: входящие / исходящие · ${fmt(last.kbIn, 1)} / ${fmt(last.kbOut, 1)} КБ/с`, spark(col('msgOut'))),
    card('Чанки', fmt(last.chunks, 1, '/с'), `отдано всего ${s.chunksServed}`, spark(col('chunks'))),
    card('Игра', escape(s.scene.id), `игроков ${s.players.connected} из ${s.players.max} · работает ${ago(s.uptime * 1000)}`, ''),
    card('ИИ', s.ai.ollama ? 'на связи' : 'нет связи', `модель ${escape(s.ai.model ?? '—')} · голос ${s.ai.tts ? 'есть' : 'нет'}`, '', s.ai.ollama ? 'ok' : 'bad'),
  ].join('');
}

function clientRows(list, now) {
  if (!list.length) return '<tr><td colspan="8" class="empty">Никто не подключён</td></tr>';
  return list.map((c) => {
    const h = c.history, last = h.at(-1), fresh = last && now - last.at < STALE_MS;
    const col = (k) => h.map((x) => x[k]);
    const state = !c.connected ? '<span class="dot off"></span>не в сети' : fresh ? '<span class="dot on"></span>в игре' : '<span class="dot idle"></span>нет отчётов';
    return `<tr>
      <td><strong>${escape(c.name)}</strong><br><span class="sub">${escape(ROLE_NAMES[c.role] ?? 'без роли')} · ${escape(c.zone ?? '—')}</span></td>
      <td>${state}${last ? `<br><span class="sub">${ago(now - last.at)} назад</span>` : ''}</td>
      <td class="num ${level(last?.fps, 45, 25, true)}">${fmt(last?.fps, 0)}${spark(col('fps'), { max: 75, width: 90 })}</td>
      <td class="num ${level(last?.ping, 80, 200)}">${fmt(last?.ping, 0, ' мс')}${spark(col('ping'), { width: 90 })}</td>
      <td class="num">${fmt(last?.calls, 0)}</td>
      <td class="num">${fmt(last?.chunks, 0)} · ${fmt(last?.pct, 1, '%')}</td>
      <td class="num">${fmt(last?.mem, 0, ' МБ')}</td>
      <td class="num">${c.chunks}</td>
    </tr>`;
  }).join('');
}

export const metricsTab = {
  id: 'metrics',
  title: 'Метрики',
  every: 2000,
  mount(el) {
    el.innerHTML = `<section><h2>Сервер</h2><div class="cards" id="server-cards"></div></section>
      <section><h2>Клиенты</h2><div class="table-wrap"><table>
        <thead><tr><th>Игрок</th><th>Состояние</th><th>FPS</th><th>Ping</th><th>Draw calls</th><th>Чанки · кеш</th><th>Память</th><th>Чанков у сервера</th></tr></thead>
        <tbody id="client-rows"></tbody></table></div>
        <p class="hint">Отчёт клиента — раз в 2 с. FPS ниже 25 и ping выше 200 мс подсвечены. Память — только в Chrome.</p></section>`;
    return {
      async refresh() {
        const [s, c] = await Promise.all([api('GET', '/server'), api('GET', '/clients')]);
        el.querySelector('#server-cards').innerHTML = serverCards(s);
        el.querySelector('#client-rows').innerHTML = clientRows(c.clients, c.serverNow);
      },
    };
  },
};
