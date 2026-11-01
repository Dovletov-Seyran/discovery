// NPC с маршрутом (Колумб) останавливается, пока с ним говорят, и поворачивается к собеседнику.
// Разговор держит сессия p.dialogue (rules.dialogue: открытие, heartbeat раз в 10 с, lease 30 с);
// здесь из неё получается пауза { at, offset, face } (shared/npc-activity.js), которая уходит всем
// клиентам как состояние объекта: { t: 'entity', id, state: { paused } }. Пауза не сохраняется в БД:
// после перезапуска сервера NPC просто идёт по маршруту.
import { S2C } from '../../shared/protocol.js';
import { players } from './players.js';
import * as entities from './entities.js';

const pauses = new Map(); // npc → { at, offset, face }

export const pauseOf = (id) => pauses.get(id) ?? null;

const round = (v) => Math.round(v * 100) / 100;

// Сверяет паузы с открытыми разговорами. Зовётся на каждое сообщение dialogue и по таймеру —
// так замечается и закрытое окно, и истёкший lease, и ушедший игрок.
export function update(now = Date.now()) {
  const talking = new Map(); // npc → первый собеседник
  for (const p of players.connected()) {
    const d = p.dialogue;
    if (!d || d.until <= now || !p.p || talking.has(d.npc)) continue;
    const def = entities.def(d.npc);
    if (def?.activity?.length && def.zone === p.zone) talking.set(d.npc, p);
  }
  for (const npc of new Set([...pauses.keys(), ...talking.keys()])) {
    const cur = pauses.get(npc) ?? { at: null, offset: 0, face: null }, p = talking.get(npc);
    let next = null;
    if (p) {
      const face = [round(p.p[0]), round(p.p.at(-1))];
      // поворачиваемся за собеседником, только если он заметно отошёл
      if (cur.at === null || !cur.face || Math.hypot(face[0] - cur.face[0], face[1] - cur.face[1]) > 0.5) {
        next = { at: cur.at ?? now / 1000, offset: cur.offset, face };
      }
    } else if (cur.at !== null) {
      next = { at: null, offset: round(cur.offset + now / 1000 - cur.at), face: null };
    }
    if (!next) continue;
    pauses.set(npc, next);
    players.broadcast({ t: S2C.ENTITY, id: npc, state: { paused: next } });
  }
}
