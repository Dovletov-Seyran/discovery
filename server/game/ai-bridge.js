// Связка с ИИ Бэка 2 (server/ai/index.js). Пока модуля нет — заглушки.
import { existsSync } from 'node:fs';
import { loadContent } from '../content.js';

const AI_MODULE = new URL('../ai/index.js', import.meta.url);

let impl = null;
if (!existsSync(AI_MODULE)) {
  console.log('[ai] server/ai/index.js не найден — работают заглушки');
} else {
  try {
    impl = await import(AI_MODULE.href);
  } catch (e) {
    console.error('[ai] не удалось загрузить модуль ИИ, работают заглушки:', e);
  }
}

const lines = new Map((loadContent('lines.json', []) ?? []).map((l) => [l.id, l]));

// → Promise<{ en, ru, audio, hints: [{id, ru}], topicsTold: [] }>
export async function talk(req) {
  if (impl?.talk) return impl.talk(req);
  return {
    en: 'Not now. Watch the sails.',
    ru: 'Не сейчас. Следи за парусами.',
    audio: null,
    hints: [],
    topicsTold: [],
  };
}

// → { npc, en, ru, audio } — готовая реплика из content/lines.json
export function playLine(lineId) {
  if (impl?.playLine) return impl.playLine(lineId);
  const l = lines.get(lineId);
  if (!l) return { npc: 'narrator', en: `[${lineId}]`, ru: `[${lineId}]`, audio: null };
  return { npc: l.npc, en: l.en, ru: l.ru, audio: `/audio/vo/${lineId}.wav` };
}

// → { ollama, tts, model? }
export function status() {
  return impl?.status ? impl.status() : { ollama: false, tts: false };
}
