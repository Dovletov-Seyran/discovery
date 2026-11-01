// Вкладка «Вселенная»: текущая сцена и время суток, длительности сцен, правка сцен и расстановки
// (JSON с проверкой на сервере). «Применить» записывает файл и перечитывает контент без перезапуска.
import { api, ApiError } from './api.js';
import { escape, fmt, ago } from './ui.js';

const clock = (tod) => {
  if (!Number.isFinite(tod)) return '—';
  const m = Math.round(tod * 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function sceneCard(u) {
  const s = u.scene, now = u.serverNow, ends = s.progress?.endsAt;
  return `<div class="cards">
    <article class="card"><h3>Сцена</h3><p class="value">${escape(s.id)}</p><p class="sub">${escape(s.type)} · ${escape(s.zone ?? '—')} · дальше ${escape(s.next ?? '—')}</p></article>
    <article class="card"><h3>Идёт</h3><p class="value">${s.startAt && s.startAt < now ? ago(now - s.startAt) : '—'}</p><p class="sub">${ends ? (ends > now ? `до конца ${ago(ends - now)}` : 'время вышло, ждём переход') : `фаза: ${escape(s.progress?.phase ?? '—')}`}</p></article>
    <article class="card"><h3>Время суток</h3><p class="value">${clock(s.tod)}</p><p class="sub">tod ${fmt(s.tod, 2)}</p></article>
  </div>`;
}

function sceneRows(u) {
  return u.scenes.map((s) => `<tr class="${s.id === u.scene.id ? 'current' : ''}">
    <td><strong>${escape(s.id)}</strong></td><td>${escape(s.type)}</td><td>${escape(s.zone ?? '—')}</td>
    <td class="num">${s.duration == null ? '—' : `${fmt(s.duration, s.fit ? 1 : 0)} с`}${s.fit ? `<br><span class="sub">по озвучке ${escape(s.fit)} · в файле ${s.configured} с</span>` : ''}</td>
    <td>${escape(s.advance ?? '—')}</td><td>${escape(s.next ?? '—')}</td><td class="num">${s.tod == null ? '—' : clock(s.tod)}</td>
  </tr>`).join('');
}

// Ошибка JSON с номером строки — ещё до отправки на сервер
function localCheck(text) {
  try { JSON.parse(text); return null; } catch (e) {
    const pos = Number(/position (\d+)/.exec(e.message)?.[1]);
    if (!Number.isFinite(pos)) return e.message;
    const before = text.slice(0, pos), line = before.split('\n').length, col = pos - before.lastIndexOf('\n');
    return `строка ${line}, символ ${col}: ${e.message.replace(/ in JSON at position \d+.*/, '')}`;
  }
}

export const universeTab = {
  id: 'universe',
  title: 'Вселенная',
  every: 5000,
  mount(el) {
    el.innerHTML = `<section><h2>Сейчас</h2><div id="scene-card"></div></section>
      <section><h2>Сцены</h2><div class="table-wrap"><table>
        <thead><tr><th>Сцена</th><th>Тип</th><th>Зона</th><th>Длительность</th><th>Переход</th><th>Дальше</th><th>Время</th></tr></thead>
        <tbody id="scene-rows"></tbody></table></div></section>
      <section><h2>Правка контента</h2>
        <div class="row"><select id="file"></select><span class="sub" id="file-title"></span></div>
        <textarea id="json" spellcheck="false" aria-label="Текст файла"></textarea>
        <div class="row"><button id="check">Проверить</button><button id="apply" class="primary">Применить</button><button id="reload" class="quiet">Отменить правки</button><span id="dirty" class="sub"></span></div>
        <div id="result" role="status"></div>
        <p class="hint">«Применить» записывает файл (прежняя версия — в data/admin/backup), перечитывает сцены и раскладки и рассылает игрокам новые чанки. Под <code>npm run dev</code> сервер после записи ещё и перезапустится.</p>
      </section>`;
    const $ = (s) => el.querySelector(s);
    let files = [], loaded = '';
    const result = (html, cls = '') => { $('#result').className = `result ${cls}`; $('#result').innerHTML = html; };
    const list = (items) => `<ul>${items.map((x) => `<li>${escape(x)}</li>`).join('')}</ul>`;
    const markDirty = () => { $('#dirty').textContent = $('#json').value !== loaded ? 'есть несохранённые правки' : ''; };

    async function load(file) {
      const { text } = await api('GET', `/world/${encodeURIComponent(file)}`);
      loaded = text; $('#json').value = text; markDirty(); result('');
      $('#file-title').textContent = files.find((f) => f.file === file)?.title ?? '';
    }
    async function send(check) {
      const text = $('#json').value, local = localCheck(text);
      if (local) return result(`<strong>JSON не разбирается</strong>${list([local])}`, 'bad');
      if (!check && !confirm(`Применить ${$('#file').value} для всех игроков?`)) return;
      try {
        const r = await api('PUT', `/world/${encodeURIComponent($('#file').value)}${check ? '?check=1' : ''}`, text, { text: true });
        if (!check) { loaded = text; markDirty(); }
        result(`<strong>${check ? 'Ошибок нет' : 'Применено'}</strong>${r.applied ? list(r.applied) : ''}${r.notes?.length ? `<p class="sub">Замечания:</p>${list(r.notes)}` : ''}`, 'ok');
      } catch (e) {
        if (e instanceof ApiError && e.body?.errors) result(`<strong>${escape(e.message)}</strong>${list(e.body.errors)}`, 'bad');
        else result(escape(e.message), 'bad');
      }
    }
    $('#json').addEventListener('input', markDirty);
    $('#check').onclick = () => send(true);
    $('#apply').onclick = () => send(false);
    $('#reload').onclick = () => load($('#file').value);
    $('#file').onchange = (e) => {
      if ($('#json').value !== loaded && !confirm('Несохранённые правки пропадут. Открыть другой файл?')) { e.target.value = e.target.dataset.current; return; }
      e.target.dataset.current = e.target.value;
      load(e.target.value);
    };

    return {
      async refresh() {
        const u = await api('GET', '/universe');
        $('#scene-card').innerHTML = sceneCard(u);
        $('#scene-rows').innerHTML = sceneRows(u);
        if (!files.length) {
          files = u.files;
          $('#file').innerHTML = files.map((f) => `<option value="${escape(f.file)}">${escape(f.file)}</option>`).join('');
          $('#file').dataset.current = files[0].file;
          await load(files[0].file);
        }
      },
    };
  },
};
