import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

export const AI = {
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  // Только instruct-версия: в Ollama тег qwen3:4b — «думающая» модель, рассуждения у неё не отключаются
  MODEL: process.env.AI_MODEL || 'qwen3:4b-instruct',
  TIMEOUT_MS: 10_000,
  WARMUP_TIMEOUT_MS: 90_000,
  NUM_CTX: 2048,
  HISTORY: 6,            // последних реплик в промпте
  MAX_CARDS: 2,          // фактов на один ответ
  MAX_SENTENCES: 3,
  MAX_WORDS: 32,         // длиннее — перевод и голос растягиваются до 8–9 с

  TTS_MODEL: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  TTS_DTYPE: 'q8',
  TTS_ENABLED: process.env.TTS !== '0',
  AUDIO_TTL_MS: 10 * 60_000,

  AGENTS_DIR: root('content/agents'),
  AUDIO_DIR: root('data/audio/rt'),
  AUDIO_URL: '/audio/rt',
  MEMORY_FILE: root('data/agent_memory.json'),
};

// Модели с режимом рассуждений: отключаем его, иначе ответ идёт в разы дольше
export const isThinkingModel = (model) => /qwen3|deepseek-r1|gpt-oss/i.test(model) && !/instruct/i.test(model);
