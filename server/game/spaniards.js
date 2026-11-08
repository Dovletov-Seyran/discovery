// Испанцы на Гуанахани 12 октября (p2_landing, docs/tz-combat.md, «Чужаки в деревне»). Это те же люди, что
// были на «Санта-Марии» (crew — их облик и голос из части 1): пока Колумб с нотариусом стоят у знамён,
// матросы и боцман ходят по деревне — кланяются касику, суют бусы хозяйке, разглядывают земи и очаг.
// Таино может вызвать любого из них на тренировочный бой: тот кивает и ведёт на батей (server/game/duel.js).
//
// Маршрут — петля точек [x, z] по тропам деревни, в обход хижин. Точка с act — остановка: поза (act),
// куда смотреть (face), что он делает (doing — видят игроки) и что говорит по-испански (say).
// batey: true — точка у края батея, через неё он идёт на поединок и возвращается обратно.
export const SPANIARDS = [
  {
    // стрелок: держится в 3,8–6,5 м, целится 1,4 с (последние 0,5 с ствол уже не ведёт за тобой — шагни
    // вбок), стреляет холостым, перезаряжает 3,2 с — тогда беги и бей; вплотную бьёт прикладом
    id: 'es_diego', crew: 'sailor_1', name: 'Диего', log: 'duel_es_diego', weapon: 'espingarda',
    windup: 950, recover: 1200, speed: 2.6, think: [1300, 2300], feint: 0, walk: 1.25,
    aimMs: 1400, lockMs: 500, reloadMs: 3200, keep: [3.8, 6.5],
    route: [
      { p: [114.5, 256.6], act: 'guard', wait: 16, face: [130, 255], doing: 'стережёт лодки', say: '¡Quietos, quietos!' },
      { p: [128, 254.4] }, { p: [146, 254.7] },
      { p: [156.4, 254.4], batey: true },
      { p: [156.4, 253.1], act: 'listen', wait: 18, face: [158, 251], doing: 'слушает старейшину и ничего не понимает', say: '¿Qué dice el viejo?' },
      { p: [164, 247] }, { p: [168, 241] },
      { p: [168, 233], act: 'greet', wait: 14, face: [168, 229], doing: 'кланяется касику', say: '¡Saludos, señor!' },
      { p: [168, 241] }, { p: [160, 256.5] }, { p: [146, 255] }, { p: [128, 254.6] },
    ],
  },
  {
    id: 'es_sancho', crew: 'sailor_3', name: 'Санчо', log: 'duel_es_sancho', weapon: 'sword',
    windup: 700, recover: 850, speed: 3.0, think: [700, 1500], feint: 0.15, walk: 1.35,
    route: [
      { p: [111.5, 258.6], act: 'offer', wait: 14, face: [109, 259], doing: 'показывает рыбаку колокольчик', say: '¡Mira, mira! ¡Un cascabel!' },
      { p: [126, 254.2] }, { p: [150, 254.6] },
      { p: [160, 257.5], batey: true }, { p: [166, 263] }, { p: [172, 263.5] },
      { p: [178.6, 264.2], act: 'offer', wait: 16, face: [181.6, 265.2], doing: 'протягивает бусы хозяйке у бурена', say: '¿Pan? ¡Cuentas por pan!' },
      { p: [176, 259] },
      { p: [172.6, 259.6], act: 'look', wait: 10, face: [171, 257], doing: 'разглядывает очаг на площади', say: 'Fuego sin hierro… ¿cómo?' },
      { p: [183, 251.2] }, { p: [200, 248.6] },
      { p: [209.5, 248.4], act: 'kneel', wait: 16, face: [212, 250], doing: 'смотрит, как сажают маниок', say: '¿Raíces? ¿Esto se come?' },
      { p: [200, 248.6] }, { p: [183, 251.2] }, { p: [160, 257.5] }, { p: [150, 254.6] }, { p: [126, 254.2] },
    ],
  },
  {
    id: 'es_boatswain', crew: 'boatswain', name: 'Боцман', log: 'duel_es_boatswain', weapon: 'sword',
    windup: 560, recover: 700, speed: 3.2, think: [500, 1100], feint: 0.35, walk: 1.3,
    route: [
      { p: [112, 255.2], act: 'greet', wait: 14, face: [110.5, 252.5], doing: 'докладывает вождю чужаков', say: 'Todo en orden, señor Almirante.' },
      { p: [130, 255.4] }, { p: [150, 255] },
      { p: [164.5, 254.5], batey: true, act: 'point', wait: 12, face: [176, 255], doing: 'меряет шагами площадь', say: '¡Qué plaza tan grande!' },
      { p: [172, 244] },
      { p: [174, 241.2], act: 'look', wait: 14, face: [174, 238], doing: 'разглядывает каменного земи', say: '¿Un ídolo de piedra?' },
      { p: [166, 248] }, { p: [158.5, 258] },
      { p: [159.8, 268.8], act: 'drink', wait: 12, face: [160, 272], doing: 'просит воды из кувшина', say: '¿Agua? ¡Agua, por favor!' },
      { p: [152, 258] }, { p: [130, 255.4] },
    ],
  },
];

// Здороваются с таино, которые подходят к ним на тропе
export const GREETINGS = ['¡Hola, amigo!', '¡Buenos días!', '¿Oro? ¿Tienes oro?', '¡Qué bonito collar!', '¿Cómo te llamas?'];
export const SP = { GREET_R: 3, GREET_MS: 2600, GREET_AGAIN_MS: 45000, LEAD: 1.9, AWAIT_MS: 45000 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const xz = (p) => [p[0], p[2]];

// Путь от того места, где он сейчас (идёт к точке i или стоит в ней), до точки batey: вперёд или назад
// по петле — что короче. → [[x, z], ...] без текущей позиции
export function pathToBatey(def, at, i) {
  const R = def.route, n = R.length, b = R.findIndex((s) => s.batey);
  const walk = (dir) => {
    const pts = []; let j = dir > 0 ? i : (i - 1 + n) % n, len = 0, from = xz(at); // назад — с точки, откуда пришёл
    for (let k = 0; k <= n; k++) {
      pts.push(R[j].p); len += dist(from, R[j].p); from = R[j].p;
      if (j === b) break;
      j = (j + dir + n) % n;
    }
    return { pts, len };
  };
  const a = walk(1), c = walk(-1);
  return { path: (a.len <= c.len ? a : c).pts, b };
}
