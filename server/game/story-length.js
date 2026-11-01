// Длительность сцены по озвученному рассказу (night_story): сцена кончается через пару секунд после
// последней реплики, даже если реплики переозвучат. Считается так же, как шкала у клиента
// (client/src/ui/timeline.js): длительности реплик из манифеста озвучки плюс паузы из content/<story>.json.
// Файлы перечитываются, только если поменялись, — новая озвучка подхватывается без перезапуска.
import { statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTENT_DIR } from '../content.js';

const MANIFEST = fileURLToPath(new URL('../../client/public/audio/vo/manifest.json', import.meta.url));
const TAIL = 1; // с: запас на запуск звука у клиентов; пауза после последней реплики уже есть в рассказе

const cache = new Map(); // файл → { mtime, data }
function read(file) {
  try {
    const mtime = statSync(file).mtimeMs, hit = cache.get(file);
    if (hit?.mtime === mtime) return hit.data;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    cache.set(file, { mtime, data });
    return data;
  } catch {
    return null;
  }
}

// Секунды или null — тогда остаётся duration из scenes.json (нет озвучки или файла рассказа)
export function storyDuration(name) {
  const story = read(CONTENT_DIR + name), manifest = read(MANIFEST);
  if (!story?.segments?.length || !manifest) return null;
  let total = 0;
  for (const s of story.segments) {
    const d = Number(manifest[s.line]?.duration);
    if (!d) return null;
    total += d + (Number(s.pause) || 0);
  }
  return Math.round((total + TAIL) * 10) / 10;
}
