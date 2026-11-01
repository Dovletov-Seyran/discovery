// События о действиях игроков для реагирующих NPC и животных (Кирилл): { t: 'world_event', type, who, p, zone, serverNow, ...extra }.
// Уходят игрокам той же зоны в радиусе 64 м; реакции каждый клиент считает сам по событиям и позициям игроков.
// Клиент не может прислать произвольное событие: их шлёт только сервер — разговор, еда и питьё, бег,
// взмах меча, «Бу!», танец, бросок предмета (Санджар, objects.js).
import { S2C } from '../../shared/protocol.js';
import { players } from './players.js';

export const TYPES = ['talk', 'eat', 'drink', 'run', 'swing', 'scare', 'dance', 'throw'];
const COOLDOWN_MS = { run: 3000, talk: 2000, throw: 0 }; // остальные — раз в секунду
const last = new Map(); // `${id}:${type}` → когда слали

const round = (v) => Math.round(v * 100) / 100;

// → true, если событие ушло (не чаще COOLDOWN_MS на игрока и тип)
export function worldEvent(p, type, extra = {}, now = Date.now()) {
  if (!TYPES.includes(type) || !p?.p || !p.connected) return false;
  const key = `${p.id}:${type}`;
  if (now - (last.get(key) ?? 0) < (COOLDOWN_MS[type] ?? 1000)) return false;
  last.set(key, now);
  const message = { ...extra, t: S2C.WORLD_EVENT, type, who: p.id, p: p.p.map(round), zone: p.zone, serverNow: now };
  players.broadcast(message, (x) => x.zone === p.zone && x.p && Math.hypot(x.p[0] - p.p[0], x.p[2] - p.p[2]) < 64);
  return true;
}
// Прежнее имя (objects.js Санджара)
export const emitWorldEvent = worldEvent;

// Использование предмета → событие (по effect из shared/item-actions.js)
export const ITEM_EVENT = { food: 'eat', drink: 'drink', water: 'drink', swing: 'swing', shot: 'scare' };

export const forget = (id) => { for (const t of TYPES) last.delete(`${id}:${t}`); };
