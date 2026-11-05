// Оружие поединков на Гуанахани (docs/tz-combat.md, «Поединки»). Общее для сервера (server/game/duel.js —
// дальность, прицел, перезарядка) и клиента (что в руке, подсказки).
//   reach — дальше этого удар игрока не достаёт (м); aim — насколько точно надо смотреть на соперника (рад);
//   cooldown — пауза между ударами (мс); strikeR — докуда достаёт удар соперника с этим оружием (м).
// Лук: спереди соперник видит стрелу и уворачивается — попасть можно на его замахе, когда он открыт или
// сбоку, зато с любого расстояния, не подходя под его удар
export const WEAPONS = {
  // таино
  macana: { side: 'taino', kind: 'melee', name: 'Макана', reach: 2.4, aim: 0.75, cooldown: 550, strikeR: 1.95, action: 'swing' },
  war_spear: { side: 'taino', kind: 'thrust', name: 'Копьё', reach: 3.1, aim: 0.45, cooldown: 800, strikeR: 2.5, action: 'swing' },
  bow: { side: 'taino', kind: 'ranged', name: 'Лук', reach: 18, aim: 0.12, cooldown: 1300, action: 'shot' },
  // испанцы
  sword: { side: 'spaniard', kind: 'melee', name: 'Меч', reach: 2.3, aim: 0.75, cooldown: 580, strikeR: 1.95, action: 'swing' },
  espingarda: { side: 'spaniard', kind: 'butt', name: 'Эспингарда', reach: 2.4, aim: 0.6, cooldown: 900, strikeR: 2.15, action: 'swing' },
};
// чем игрок-таино может биться в поединке; если в руке ничего из этого — дают макану и забирают после
export const DUEL_WEAPONS = ['macana', 'war_spear', 'bow'];
export const isDuelWeapon = (item) => DUEL_WEAPONS.includes(item);
