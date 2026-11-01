// Вкладка «Вселенная»: сцены и расстановка правятся из админки, проверяются и применяются без перезапуска.
// Файл пишется текстом как есть (форматирование автора сохраняется), прежняя версия — в data/admin/backup/.
// Применение: сцены и точки появления перечитываются, раскладки перегенерируют чанки в БД, игроки получают
// заново те чанки, что у них уже загружены. Под `npm run dev` сервер ещё и перезапустится (node --watch
// следит за content/) — на показе (`npm run start:demo`) применяется на лету.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_DIR } from '../content.js';
import { DATA_DIR } from '../db.js';
import { generateCanary } from '../world/terrain.js';
import { seedWorld } from '../world/generate.js';
import { clearChunkCache } from '../world/chunks.js';
import * as director from '../game/director.js';
import * as entities from '../game/entities.js';
import { resendChunks } from '../game/index.js';

const BACKUP_DIR = join(DATA_DIR, 'admin', 'backup');

// Что можно править и что после правки обновить
export const FILES = {
  'scenes.json': { title: 'Сцены: порядок, длительности, время суток', check: checkScenes },
  'ship_layout.json': { title: 'Корабль: предметы, NPC и их маршруты, точки появления', check: checkShip, zone: 'ship' },
  'canary_layout.json': { title: 'Канары: форма острова, постройки, предметы, жители', check: checkCanary, zone: 'canary' },
};

export const read = (file) => readFileSync(CONTENT_DIR + file, 'utf8');

// → { data, errors: [строки], notes: [строки] }
export function validate(file, text) {
  const spec = FILES[file];
  if (!spec) return { errors: [`${file}: этот файл из админки не правится`], notes: [] };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [`JSON: ${e.message}`], notes: [] };
  }
  const notes = [];
  const errors = spec.check(data, notes);
  return { data, errors, notes };
}

// Записать проверенный текст и применить. → список того, что обновилось
export function save(file, text) {
  const target = CONTENT_DIR + file;
  mkdirSync(BACKUP_DIR, { recursive: true });
  if (existsSync(target)) copyFileSync(target, join(BACKUP_DIR, `${file.replace('.json', '')}.${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  writeFileSync(target + '.tmp', text);
  renameSync(target + '.tmp', target);
  return apply(file);
}

function apply(file) {
  const done = [];
  director.loadScenes();
  done.push('сцены и точки появления');
  const zone = FILES[file].zone;
  if (zone) {
    entities.loadDefs();
    seedWorld();
    clearChunkCache();
    resendChunks(zone);
    done.push('объекты и NPC', 'чанки мира перегенерированы', `игрокам в зоне ${zone} разосланы новые чанки`);
  }
  console.log(`[admin] применён ${file}: ${done.join(', ')}`);
  return done;
}

// --- проверки ---

const SCENE_TYPES = ['lobby', 'cutscene', 'play', 'locked', 'end'];
const ADVANCE = ['all_ready', 'timer_or_skip', 'quests', 'timer', 'quests_and_ready'];
const ZONES = ['ship', 'canary'];
const vec = (p, n) => Array.isArray(p) && p.length === n && p.every(Number.isFinite);
const point = (p) => vec(p, 3) || (p && typeof p === 'object' && vec(p.p, 3));

function checkScenes(list) {
  if (!Array.isArray(list)) return ['ожидается массив сцен'];
  const errors = [], ids = new Set();
  list.forEach((s, i) => {
    const at = `сцена ${i + 1}${s?.id ? ` (${s.id})` : ''}`;
    if (!s || typeof s !== 'object') return errors.push(`${at}: не объект`);
    if (typeof s.id !== 'string' || !s.id) errors.push(`${at}: нет id`);
    else if (ids.has(s.id)) errors.push(`${at}: id повторяется`);
    else ids.add(s.id);
    if (!SCENE_TYPES.includes(s.type)) errors.push(`${at}: type — одно из ${SCENE_TYPES.join(', ')}`);
    if (s.advance != null && !ADVANCE.includes(s.advance)) errors.push(`${at}: advance — одно из ${ADVANCE.join(', ')}`);
    for (const k of ['duration', 'demoDuration']) {
      if (s[k] != null && !(Number.isFinite(s[k]) && s[k] > 0 && s[k] <= 3600)) errors.push(`${at}: ${k} — секунды, от 0 до 3600`);
    }
    if ((s.advance === 'timer' || s.advance === 'timer_or_skip') && s.duration == null && !s.fit) errors.push(`${at}: сцене по таймеру нужна duration`);
    if (s.zone != null && !ZONES.includes(s.zone)) errors.push(`${at}: zone — ${ZONES.join(' или ')}`);
    if (s.tod != null && !(Number.isFinite(s.tod) && s.tod >= 0 && s.tod <= 1)) errors.push(`${at}: tod — от 0 до 1`);
    if (s.fit != null && !existsSync(CONTENT_DIR + s.fit)) errors.push(`${at}: fit — нет файла content/${s.fit}`);
    if (s.seats != null && !(Array.isArray(s.seats) && s.seats.every(point))) errors.push(`${at}: seats — список точек [x, y, z]`);
  });
  for (const s of list) if (s?.next != null && !ids.has(s.next)) errors.push(`${s.id}: next — нет сцены «${s.next}»`);
  if (!ids.has('lobby')) errors.push('нужна сцена lobby — с неё начинается игра');
  return errors;
}

// Общее для раскладок: списки, координаты, уникальные id у того, с чем взаимодействуют
function checkLists(l, errors, dims) {
  const ids = new Set();
  for (const list of ['objects', 'interact', 'npcs']) {
    if (l[list] == null) continue;
    if (!Array.isArray(l[list])) { errors.push(`${list}: ожидается список`); continue; }
    l[list].forEach((o, i) => {
      const at = `${list}[${i}]${o?.id ? ` (${o.id})` : ''}`;
      if (!o || typeof o !== 'object') return errors.push(`${at}: не объект`);
      if (list !== 'npcs' && typeof o.m !== 'string') errors.push(`${at}: нет модели m`);
      if (!o.rel && !dims.some((n) => vec(o.p, n))) errors.push(`${at}: p — [${dims.includes(2) ? 'x, z] или [' : ''}x, y, z]`);
      if (o.rel && !vec(o.off, 2)) errors.push(`${at}: off — [dx, dz] от объекта ${o.rel}`);
      if (list !== 'objects') {
        if (typeof o.id !== 'string' || !o.id) errors.push(`${at}: нет id`);
        else if (ids.has(o.id)) errors.push(`${at}: id повторяется`);
        else ids.add(o.id);
      }
      if (o.activity != null && !(Array.isArray(o.activity) && o.activity.every((a) => vec(a?.p, 3)))) errors.push(`${at}: activity — остановки с p: [x, y, z]`);
    });
  }
}

function checkShip(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return ['ожидается объект раскладки'];
  const errors = [];
  checkLists(l, errors, [3]);
  if (l.seats != null && !(Array.isArray(l.seats) && l.seats.every(point))) errors.push('seats — список точек');
  return errors;
}

function checkCanary(l, notes) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return ['ожидается объект раскладки'];
  const errors = [];
  if (!Number.isFinite(l.seed)) errors.push('seed — число');
  if (!(Number.isInteger(l.size) && l.size > 0 && l.size % 32 === 0)) errors.push('size — метры, кратно 32');
  const sh = l.shape, tw = l.town;
  if (!sh || !vec(sh.center, 2) || !vec(sh.radius, 2) || !vec(sh.peak, 3) || !Number.isFinite(sh.peakHeight)) errors.push('shape — { center: [x, z], radius: [rx, rz], peak: [x, z, r], peakHeight }');
  if (!tw || !vec(tw.center, 2) || !Number.isFinite(tw.half) || !Number.isFinite(tw.height)) errors.push('town — { center: [x, z], half, height }');
  checkLists(l, errors, [2, 3]);
  if (errors.length) return errors;
  // Сгенерировать остров целиком, как это сделает сервер: ссылки rel, берег у пристани, объекты вне карты
  try {
    generateCanary(l, { warn: (m) => notes.push(m.replace('[seed] ', '')) });
  } catch (e) {
    errors.push(`генерация острова: ${e.message.replace('[terrain] ', '')}`);
  }
  return errors;
}
