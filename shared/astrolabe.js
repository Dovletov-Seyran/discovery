// Задание с астролябией: широта по высоте полуденного Солнца.
// Солнце в полдень на юге, мы в северном полушарии: широта = 90° − высота Солнца + склонение.
// Даты — путь флотилии в 1492 году, склонение Солнца на дату округлено до градуса.
// Клиент берёт случайный вариант и присылает его id, ответ сервер считает сам (server/game/rules.js).
export const ASTROLABE = [
  { id: 'palos', date: '3 августа, выход из Палоса', decl: 17, sun: 70 },     // 37°
  { id: 'canary', date: '12 августа, у Гран-Канарии', decl: 15, sun: 77 },   // 28°
  { id: 'gomera', date: '6 сентября, уходим с Гомеры', decl: 6, sun: 68 },   // 28°
  { id: 'ocean', date: '20 сентября, открытый океан', decl: 1, sun: 64 },    // 27°
  { id: 'west', date: '1 октября, курс на запад', decl: -3, sun: 62 },       // 25°
];

export const latitude = (v) => 90 - v.sun + v.decl;

// Три варианта ответа: верный и два частых промаха — склонение не с тем знаком, склонение забыли,
// перепутали высоту с зенитным расстоянием
export function answers(v) {
  const right = latitude(v), wrong = [90 - v.sun - v.decl, 90 - v.sun, v.sun - v.decl, right + 11]
    .filter((x, i, all) => x !== right && x >= 5 && x <= 85 && all.indexOf(x) === i);
  return [right, ...wrong.slice(0, 2)].sort((a, b) => a - b);
}

export const signed = (n) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}°`;
