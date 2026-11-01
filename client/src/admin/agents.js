// Админка, вкладка «Агенты»: личность, стиль, правила, факты, темы, действия, температура;
// просмотр и сброс памяти агента об игроке; метрики ИИ. Сохранение применяется на сервере без перезапуска.
// Вкладка каркаса админки (client/src/admin/main.js): agentsTab. Запросы — api() каркаса (токен, ошибки).
// Сервер: server/admin/agents.js.
import { api as adminApi } from './api.js';

const STYLE_ID = 'admin-agents-style';
const CSS = `
.aa{display:grid;grid-template-columns:minmax(150px,200px) 1fr;gap:16px;font:14px/1.4 system-ui,sans-serif;color:inherit}
.aa *{box-sizing:border-box}
.aa h3{margin:0 0 8px;font-size:15px}
.aa-list button{display:block;width:100%;text-align:left;padding:8px 10px;margin:0 0 4px;border:1px solid #8884;border-radius:6px;background:none;color:inherit;cursor:pointer}
.aa-list button[aria-current=true]{background:#8882;border-color:#888}
.aa-list small{display:block;opacity:.65}
.aa-main{min-width:0;display:grid;gap:14px}
.aa fieldset{border:1px solid #8884;border-radius:8px;padding:10px 12px;margin:0;min-width:0}
.aa legend{padding:0 4px;font-weight:600}
.aa label{display:block;margin:0 0 8px}
.aa label>span{display:block;font-size:12px;opacity:.7;margin-bottom:2px}
.aa input,.aa textarea,.aa select{width:100%;font:inherit;padding:6px 8px;border:1px solid #8886;border-radius:6px;background:transparent;color:inherit}
.aa textarea{resize:vertical;min-height:84px}
.aa textarea.aa-code{font:12px/1.4 ui-monospace,monospace;min-height:180px}
.aa-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.aa-row>*{flex:0 0 auto}
.aa-btn{padding:6px 12px;border:1px solid #888;border-radius:6px;background:#8882;color:inherit;cursor:pointer;font:inherit}
.aa-btn:disabled{opacity:.5;cursor:default}
.aa-card{border:1px solid #8883;border-radius:6px;padding:8px;margin:0 0 8px}
.aa-card summary{cursor:pointer}
.aa-msg{padding:6px 10px;border-radius:6px;white-space:pre-wrap}
.aa-msg.ok{background:#2a72}
.aa-msg.err{background:#c332}
.aa-turns{max-height:260px;overflow:auto;font-size:13px;margin:6px 0 0;padding:0;list-style:none}
.aa-turns li{padding:3px 0;border-bottom:1px solid #8882}
.aa-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.aa-metrics div{border:1px solid #8883;border-radius:6px;padding:6px 8px}
.aa-metrics b{display:block;font-size:18px;font-variant-numeric:tabular-nums}
@media (max-width:640px){.aa{grid-template-columns:1fr}}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lines = (list) => (list ?? []).join('\n');
const fromLines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);

export function mountAgentsTab(container) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const api = (path, { method = 'GET', body } = {}) => adminApi(method, path, body);

  let list = { agents: [], players: [] };
  let current = null; // JSON агента

  container.innerHTML = `<div class="aa">
    <nav class="aa-list"><h3>Агенты</h3><div data-list></div></nav>
    <div class="aa-main">
      <div data-status></div>
      <form data-form hidden></form>
      <fieldset data-memory hidden><legend>Память об игроке</legend>
        <div class="aa-row"><select data-user aria-label="Игрок"></select><input data-user-text placeholder="или id / логин" style="width:160px">
        <button type="button" class="aa-btn" data-mem-load>Показать</button><button type="button" class="aa-btn" data-mem-reset>Сбросить</button></div>
        <div data-mem-out></div>
      </fieldset>
      <fieldset><legend>Метрики ИИ <small>(последние 50 ответов)</small></legend><div data-metrics class="aa-metrics"></div></fieldset>
    </div></div>`;
  const $ = (sel) => container.querySelector(sel);
  const status = (text, ok) => { $('[data-status]').innerHTML = text ? `<div class="aa-msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>` : ''; };

  async function refreshList() {
    try {
      list = await api('/agents');
    } catch (e) {
      status(e.message);
      return;
    }
    $('[data-list]').innerHTML = list.agents.map((a) => `<button type="button" data-id="${esc(a.id)}" aria-current="${a.id === current?.id}">${esc(a.name)}<small>${esc(a.id)} · тем ${a.cards} · действий ${a.actions}</small></button>`).join('');
    $('[data-user]').innerHTML = list.players.map((p) => `<option value="${p.id}">${esc(p.name)}${p.connected ? ' ●' : ''}</option>`).join('') || '<option value="">нет игроков в памяти сервера</option>';
  }

  async function open(id) {
    try {
      current = await api(`/agents/${encodeURIComponent(id)}`);
    } catch (e) {
      status(e.message);
      return;
    }
    status('');
    renderForm();
    $('[data-memory]').hidden = false;
    $('[data-mem-out]').innerHTML = '';
    container.querySelectorAll('[data-list] button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  }

  function cardHtml(c, i) {
    return `<details class="aa-card" data-card="${i}"><summary>${esc(c.id || 'новая тема')} — ${esc(c.hint)}</summary>
      <label><span>id</span><input data-k="id" value="${esc(c.id)}"></label>
      <label><span>Тема (для модели, англ.)</span><input data-k="topic" value="${esc(c.topic)}"></label>
      <label><span>Подсказка-кнопка (рус.)</span><input data-k="hint" value="${esc(c.hint)}"></label>
      <label><span>Факт (англ.)</span><textarea data-k="fact">${esc(c.fact)}</textarea></label>
      <label><span>Ключевые слова через запятую</span><input data-k="kw" value="${esc((c.kw ?? []).join(', '))}"></label>
      <button type="button" class="aa-btn" data-del-card="${i}">Удалить тему</button></details>`;
  }

  function renderForm() {
    const a = current;
    const k = a.knowledge ?? {};
    const form = $('[data-form]');
    form.hidden = false;
    form.innerHTML = `
      <fieldset><legend>${esc(a.name)}</legend>
        <label><span>Имя</span><input name="name" value="${esc(a.name)}"></label>
        <label><span>Личность (persona)</span><textarea name="persona">${esc(a.persona)}</textarea></label>
        <label><span>Стиль — по строке</span><textarea name="style">${esc(lines(a.style))}</textarea></label>
        <label><span>Правила — по строке</span><textarea name="rules">${esc(lines(a.rules))}</textarea></label>
        <label><span>О себе (факты о персонаже) — по строке</span><textarea name="self">${esc(lines(a.self))}</textarea></label>
        <label><span>Когда</span><input name="k_when" value="${esc(k.when)}"></label>
        <label><span>Где</span><input name="k_where" value="${esc(k.where)}"></label>
        <label><span>Чего не знает</span><textarea name="k_unknown">${esc(k.unknown)}</textarea></label>
        <label style="max-width:220px"><span>Температура свободной речи (0–1.5)</span><input name="temperature" type="number" min="0" max="1.5" step="0.05" value="${a.temperature ?? ''}" placeholder="по умолчанию"></label>
      </fieldset>
      <fieldset><legend>Темы и факты</legend><div data-cards>${(a.cards ?? []).map(cardHtml).join('')}</div>
        <button type="button" class="aa-btn" data-add-card>+ тема</button></fieldset>
      <fieldset><legend>Действия (JSON)</legend>
        <label><span>{ id, en, scenes, cooldownSec, kw, patch: [{ op, id, kind, model, p, r, state }], reply, replyRu?, once?, at? }</span>
        <textarea class="aa-code" name="actions" spellcheck="false">${esc(JSON.stringify(a.actions ?? [], null, 2))}</textarea></label>
      </fieldset>
      <div class="aa-row"><button class="aa-btn" type="submit">Сохранить и применить</button><button class="aa-btn" type="button" data-revert>Отменить правки</button></div>`;
  }

  // Форма → JSON агента (поля, которых нет в форме, сохраняются как были)
  function collect() {
    const f = $('[data-form]');
    const val = (n) => f.elements[n].value;
    const next = structuredClone(current);
    next.name = val('name').trim();
    next.persona = val('persona').trim();
    next.style = fromLines(val('style'));
    next.rules = fromLines(val('rules'));
    next.self = fromLines(val('self'));
    next.knowledge = { ...next.knowledge, when: val('k_when').trim(), where: val('k_where').trim(), unknown: val('k_unknown').trim() };
    const t = val('temperature');
    if (t === '') delete next.temperature;
    else next.temperature = Number(t);
    next.cards = [...f.querySelectorAll('[data-card]')].map((el) => {
      const get = (key) => el.querySelector(`[data-k="${key}"]`).value.trim();
      const old = current.cards?.[Number(el.dataset.card)] ?? {};
      return { ...old, id: get('id'), topic: get('topic'), kw: get('kw').split(',').map((s) => s.trim()).filter(Boolean), fact: get('fact'), hint: get('hint') };
    });
    try {
      next.actions = JSON.parse(val('actions') || '[]');
    } catch (e) {
      throw new Error(`Действия: не JSON — ${e.message}`);
    }
    return next;
  }

  async function save() {
    let body;
    try {
      body = collect();
    } catch (e) {
      status(e.message);
      return;
    }
    const btn = $('[data-form] [type=submit]');
    btn.disabled = true;
    try {
      const res = await api(`/agents/${encodeURIComponent(current.id)}`, { method: 'PUT', body });
      current = res.agent;
      renderForm();
      status('Сохранено. Агент уже отвечает по-новому.', true);
      refreshList();
    } catch (e) {
      status(e.body?.errors?.length ? `Не сохранено:\n${e.body.errors.join('\n')}` : e.message);
    } finally {
      btn.disabled = false;
    }
  }

  const userQuery = () => $('[data-user-text]').value.trim() || $('[data-user]').value;

  async function showMemory() {
    const out = $('[data-mem-out]');
    try {
      const { user, memory: m } = await api(`/agents/${encodeURIComponent(current.id)}/memory?user=${encodeURIComponent(userQuery())}`);
      const when = m.lastAt ? new Date(m.lastAt).toLocaleString() : '—';
      out.innerHTML = `<p><b>${esc(user.login)}</b> · встреч: ${m.visits} · последний раз: ${esc(when)}${m.lastScene ? ` (${esc(m.lastScene)})` : ''}</p>
        <p><span style="opacity:.7">Рассказанные темы:</span> ${esc(m.told.join(', ') || '—')}</p>
        <p><span style="opacity:.7">Резюме:</span> ${esc(m.summary || '—')}</p>
        <ul class="aa-turns">${m.turns.map((t) => `<li><b>${t.role === 'user' ? 'Игрок' : 'Агент'}:</b> ${esc(t.content)}</li>`).join('') || '<li>Реплик нет</li>'}</ul>`;
    } catch (e) {
      out.innerHTML = `<div class="aa-msg err">${esc(e.message)}</div>`;
    }
  }

  async function resetMemory() {
    const q = userQuery();
    if (!q || !confirm(`Сбросить память агента ${current.id} об игроке ${q}?`)) return;
    try {
      await api(`/agents/${encodeURIComponent(current.id)}/memory/reset`, { method: 'POST', body: { user: q } });
      status('Память сброшена: при следующей встрече агент знакомится заново.', true);
      showMemory();
    } catch (e) {
      status(e.message);
    }
  }

  async function refreshMetrics() {
    try {
      const m = await api('/ai');
      const a = m.avgMs ?? {};
      const cell = (label, v, unit = 'мс') => `<div>${label}<b>${v ?? '—'}${v != null ? ` <small>${unit}</small>` : ''}</b></div>`;
      $('[data-metrics]').innerHTML = [
        cell('Очередь к модели', m.queue?.waiting ?? 0, m.queue?.busy ? 'занята' : 'свободна'),
        cell('Понимание', a.understand), cell('Ответ', a.reply), cell('Перевод', a.translate), cell('Озвучка', a.tts), cell('Всего', a.total),
        cell('Ответов', m.answers, m.stub ? 'заглушка' : ''),
      ].join('');
    } catch (e) {
      $('[data-metrics]').innerHTML = `<div class="aa-msg err">${esc(e.message)}</div>`;
    }
  }

  container.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.id) open(t.dataset.id);
    else if ('addCard' in t.dataset) {
      const next = collectSafe();
      next.cards = [...(next.cards ?? []), { id: '', topic: '', hint: '', fact: '', kw: [] }];
      current = next;
      renderForm();
      container.querySelector('[data-card]:last-child')?.setAttribute('open', '');
    } else if (t.dataset.delCard != null) {
      const next = collectSafe();
      next.cards.splice(Number(t.dataset.delCard), 1);
      current = next;
      renderForm();
    } else if ('revert' in t.dataset) open(current.id);
    else if ('memLoad' in t.dataset) showMemory();
    else if ('memReset' in t.dataset) resetMemory();
  });
  // Добавить/удалить тему, не теряя правок в форме (кривой JSON действий — оставляем старые действия)
  function collectSafe() {
    try { return collect(); } catch { return { ...current }; }
  }
  container.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });

  refreshList();
  // каркас зовёт refresh() раз в every мс: обновляются только метрики, форму с правками не трогаем
  return { refresh: refreshMetrics };
}

export const agentsTab = { id: 'agents', title: 'Агенты', every: 3000, mount: (el) => mountAgentsTab(el) };
