// npm run seed — сгенерировать мир в data/game.db. Сервер должен быть остановлен
// (при пустой таблице chunks сервер сам вызывает генерацию при старте).
// npm run seed -- --map — ещё и нарисовать карту высот острова в консоли.
import { seedWorld, generateCanary } from '../world/generate.js';
import { closeDb } from '../db.js';

seedWorld();

if (process.argv.includes('--map')) {
  const { heightAt, layout } = generateCanary();
  const STEP = 8;
  const marks = new Map();
  for (const o of [...layout.interact, ...layout.npcs]) {
    marks.set(`${Math.floor(o.p[0] / STEP)},${Math.floor(o.p.at(-1) / STEP)}`, o.id[0].toUpperCase());
  }
  const ramp = ' .:-=+*#%@';
  for (let z = 0; z < layout.size; z += STEP) {
    let row = '';
    for (let x = 0; x < layout.size; x += STEP) {
      const mark = marks.get(`${x / STEP},${z / STEP}`);
      const h = heightAt(x + STEP / 2, z + STEP / 2);
      row += mark ?? (h < 0 ? '~' : ramp[Math.min(ramp.length - 1, Math.floor(h / 4.5))]);
    }
    console.log(row);
  }
  console.log('~ море, символы плотнее — выше; буквы — интерактивные объекты и NPC');
}

closeDb();
