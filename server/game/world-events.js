// События о действиях игроков для реагирующих NPC и животных (Кирилл): { t: 'world_event', type, who, p }.
// Уходят игрокам той же зоны; реакции каждый клиент считает сам по этим событиям и позициям игроков.
// Сервер шлёт то, что видит сам: разговор, еда и питьё, бег, взмах меча, «Бу!», танец.
// Санджар добавляет свои действия через тот же worldEvent(p, type).
import { S2C } from '../../shared/protocol.js';
import { players } from './players.js';

export const TYPES = ['talk', 'eat', 'drink', 'run', 'swing', 'scare', 'dance'];
const COOLDOWN_MS = { run: 3000, talk: 2000 }; // остальные — раз в секунду
const last = new Map(); // `${id}:${type}` → когда слали

const round = (v) => Math.round(v * 100) / 100;

// → true, если событие ушло (не чаще COOLDOWN_MS на игрока и тип)
export function worldEvent(p, type, now = Date.now()) {
  if (!TYPES.includes(type) || !p?.p || !p.connected) return false;
  const key = `${p.id}:${type}`;
  if (now - (last.get(key) ?? 0) < (COOLDOWN_MS[type] ?? 1000)) return false;
  last.set(key, now);
  players.broadcast({ t: S2C.WORLD_EVENT, type, who: p.id, p: p.p.map(round) }, (x) => x.zone === p.zone);
  return true;
}

// Использование предмета → событие (по effect из shared/item-actions.js)
export const ITEM_EVENT = { food: 'eat', drink: 'drink', water: 'drink', swing: 'swing' };

export const forget = (id) => { for (const t of TYPES) last.delete(`${id}:${t}`); };
