// Действия агентов: агент по просьбе игрока меняет мир (зажигает фонари, раскладывает товар).
// Модель только узнаёт просьбу — отдельным полем в том же вызове классификатора (understand.js).
// Решает код: просьба подтверждена ключевыми словами, сцена, кулдаун, «уже сделано», разовость.
// Патч применяет мир игры (server/game/world-state.js) через setWorld(); без него (agent-cli) — ничего не меняется.
import { tokenize, wordsMatch } from './retrieval.js';

// Вопрос о вещи, а не просьба: «расскажи про фонари», «зачем флаг?», «что за паёк?»
const NEGATED = /(?:^|[^а-яёa-z])(?:не\s+(?:(?:надо|нужно|следует|смей)\s+)?(?:заж|подним|подня|убир|убер|выда|разда|показ)|(?:do not|don't|never)\s+(?:light|raise|hoist|furl|lower|give|show))/i;
const ABOUT = /расскаж|рассказ|объясн|что так|что за |почему|зачем|когда|откуда|tell me|what is|why|explain/i;

let world = { isApplied: () => false, apply: () => ({ ok: true }), hasFlag: () => false, setFlag: () => true };
export const setWorld = (w) => { world = { ...world, ...w }; };

// Действия по просьбе (у ночных — расписание at, их не просят)
export const requestable = (agent) => (agent.actions ?? []).filter((a) => !a.at);
export const available = (agent, scene) => requestable(agent).filter((a) => !a.scenes?.length || a.scenes.includes(scene));

// Ключевые фразы: каждая — набор основ, все должны быть в реплике («поднять флаг» ↔ «поднимите флаг Кастилии»)
export function kwHit(action, text) {
  const words = tokenize(text || '');
  if (!words.length) return false;
  return (action.kw ?? []).some((phrase) => {
    const parts = tokenize(phrase);
    return parts.length > 0 && parts.every((part) => words.some((w) => wordsMatch(w, part)));
  });
}

/**
 * Какое действие просит игрок. modelAction — выбор классификатора (id или 'none').
 * Ложные срабатывания хуже пропуска: выбор модели засчитываем, только если его подтверждают ключевые слова;
 * без модели (или если она промолчала) — по ключевым словам, в том числе действие из другой сцены (для вежливого отказа).
 * → action или null
 */
export function pickAction(agent, { modelAction, text, scene }) {
  if (!text || ABOUT.test(text) || NEGATED.test(text)) return null;
  const here = available(agent, scene);
  const chosen = here.find((a) => a.id === modelAction);
  if (chosen) return kwHit(chosen, text) ? chosen : null;
  const byWords = [...here, ...requestable(agent).filter((a) => !here.includes(a))];
  return byWords.find((a) => kwHit(a, text)) ?? null;
}

// Проданный товар не возвращается на прилавок по повторной просьбе.
const patchesFor = (action) => (action.patch ?? []).filter(op => !(action.id === 'show_goods' && op.op === 'spawn' && world.hasFlag(`sold:${op.id}`)));

// Кулдауны общие на весь мир: фонари зажёг один игрок — горят у всех
const lastAt = new Map(); // `${agent}:${action}` → ms
export const cancelAction = (agent, action) => lastAt.delete(`${agent.id}:${action.id}`);
export const resetCooldowns = () => lastAt.clear();

/**
 * Можно ли выполнить сейчас. → { ok: true } или { ok: false, reason: 'scene'|'cooldown'|'done'|'once', waitSec? }
 * ok — кулдаун начинается сразу (двое игроков одновременно не зажгут фонари дважды).
 */
export function decide(agent, action, { scene, now = Date.now() } = {}) {
  if (action.scenes?.length && !action.scenes.includes(scene)) return { ok: false, reason: 'scene' };
  const key = `${agent.id}:${action.id}`;
  if (action.once && world.hasFlag(`action:${key}`)) return { ok: false, reason: 'once' };
  const since = now - (lastAt.get(key) ?? -Infinity);
  const cd = (action.cooldownSec ?? 0) * 1000;
  if (since < cd) return { ok: false, reason: 'cooldown', waitSec: Math.ceil((cd - since) / 1000) };
  if (action.patch?.length && (!patchesFor(action).length || world.isApplied(patchesFor(action)))) return { ok: false, reason: 'done' };
  lastAt.set(key, now);
  return { ok: true };
}

// Выполнить разрешённое действие: патч в мир (рассылка всем — там же)
export function perform(agent, action) {
  const patch = patchesFor(action);
  const result = patch.length ? world.apply(patch, { source: `${agent.id}:${action.id}` }) : { ok: true, ops: [] };
  if (result.ok && action.once) world.setFlag(`action:${agent.id}:${action.id}`);
  if (!result.ok) lastAt.delete(`${agent.id}:${action.id}`);
  return result;
}

/**
 * План действий по расписанию (ночная история Старого Хуана): at: { segment, offset } —
 * секунды от начала фрагмента night_story.json (отрицательные — от конца его аудио), как sfx.at на клиенте.
 * durations — длительность аудио каждого фрагмента; maxDuration — длина сцены (история ускоряется до ×2, как в client/src/ui/timeline.js).
 * → [{ ms, action }] по возрастанию
 */
export function storyPlan(agents, { scene, segments = [], durations = [], maxDuration } = {}) {
  const total = segments.reduce((s, seg, i) => s + (durations[i] || 0) + (Number(seg.pause) || 0), 0);
  const rate = maxDuration > 0 ? Math.min(2, Math.max(1, total / maxDuration)) : 1;
  const starts = [];
  let cursor = 0;
  segments.forEach((seg, i) => {
    starts.push(cursor);
    cursor += ((durations[i] || 0) + (Number(seg.pause) || 0)) / rate;
  });
  const plan = [];
  for (const agent of agents) {
    for (const action of agent.actions ?? []) {
      if (!action.at || (action.scenes?.length && !action.scenes.includes(scene))) continue;
      const i = Math.min(Math.max(action.at.segment ?? 0, 0), Math.max(segments.length - 1, 0));
      const off = Number(action.at.offset) || 0;
      const sec = (starts[i] ?? 0) + (off < 0 ? Math.max(0, (durations[i] || 0) + off) : off) / rate;
      plan.push({ ms: Math.round(sec * 1000), agent, action });
    }
  }
  return plan.sort((a, b) => a.ms - b.ms);
}
