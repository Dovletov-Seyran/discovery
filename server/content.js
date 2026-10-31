// Загрузка content/*.json (общие данные игры).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CONTENT_DIR = fileURLToPath(new URL('../content/', import.meta.url));

export function loadContent(name, fallback) {
  const file = CONTENT_DIR + name;
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[content] ${name}: ${e.message}`);
    return fallback;
  }
}
