// Табло поединка на батее (docs/tz-combat.md, «Поединки»): счёт, отсчёт и подсказка по тому, что сейчас
// делает воин. Чистая функция — по сообщению `duel`, id игрока и времени сервера; main.js кладёт её в #duel.
const TIPS = {
  ready: null,
  approach: 'Жди его замаха',
  circle: 'Жди его замаха — спереди он отобьёт',
  windup: 'Замах! Отступи — или успей ударить первым',
  strike: 'Удар!',
  recover: 'Он открыт — бей!',
  block: 'Отбил. Бей на замахе, после его удара или сбоку',
  stagger: 'Попал!',
};
const RESULTS = { player: 'Победа', warrior: 'Поражение', draw: 'Ничья' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// → { html, tone } или null, если игрок не бьётся и не видел только что итог
export function duelView(message, me, serverNow = Date.now()) {
  const d = message?.duelists?.find((x) => x.player === me) ?? message?.duelists?.find((x) => x.result && x.lastPlayer === me);
  if (!d || me == null) return null;
  const score = `<p class="duel-score"><span>Ты <b>${d.score[0]}</b></span><span class="duel-sep">:</span><span><b>${d.score[1]}</b> ${esc(d.name)}</span></p>`;
  if (!d.player) {
    const tone = d.result === 'player' ? 'win' : d.result === 'warrior' ? 'lose' : 'draw';
    return { tone, html: `<p class="duel-title">${RESULTS[d.result] ?? 'Конец'}</p>${score}` };
  }
  if (d.state === 'ready') {
    const left = Math.max(1, Math.ceil((d.startsAt - serverNow) / 1000));
    return { tone: 'ready', html: `<p class="duel-title">Поединок · ${esc(d.name)}</p>${score}<p class="duel-count">${d.startsAt > serverNow ? left : 'Бой!'}</p><p class="duel-tip">ЛКМ — удар · до трёх очков · не выходи с батея</p>` };
  }
  const tip = TIPS[d.state];
  return { tone: d.state === 'windup' ? 'danger' : d.state === 'recover' ? 'chance' : 'fight', html: `${score}${tip ? `<p class="duel-tip">${tip}</p>` : ''}` };
}
