import { AI, isThinkingModel } from './config.js';

// Один запрос к Ollama за раз: на 8 ГБ параллельные генерации только мешают друг другу.
// Чем выше priority, тем раньше запрос (ответы NPC важнее переводов).
const queue = [];
let busy = false;
// Транспорт к модели; тесты подменяют его заглушкой (без Ollama)
let transport = (messages, opts) => request(messages, opts);
// Для админки: сколько запросов ждёт модель и занята ли она сейчас
export const queueStats = () => ({ waiting: queue.length, busy });
export const setTransport = (fn) => { transport = fn ?? ((messages, opts) => request(messages, opts)); };

// format — JSON-схема: Ollama ограничивает ответ этой схемой (structured outputs), модель не может выйти за список вариантов
export function chat(messages, { priority = 0, temperature = 0.7, maxTokens = 140, timeoutMs = AI.TIMEOUT_MS, model = AI.MODEL, format } = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ messages, opts: { temperature, maxTokens, timeoutMs, model, format }, priority, resolve, reject });
    queue.sort((a, b) => b.priority - a.priority);
    pump();
  });
}

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    job.resolve(await transport(job.messages, job.opts));
  } catch (err) {
    job.reject(err);
  } finally {
    busy = false;
    pump();
  }
}

async function request(messages, { temperature, maxTokens, timeoutMs, model, format }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(`${AI.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: -1,
        ...(isThinkingModel(model) ? { think: false } : {}),
        ...(format ? { format } : {}),
        options: { temperature, num_predict: maxTokens, num_ctx: AI.NUM_CTX },
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: stripThinking(data.message?.content ?? ''),
      tokens: data.eval_count ?? 0,
      tokPerSec: data.eval_count && data.eval_duration ? data.eval_count / (data.eval_duration / 1e9) : 0,
      ms: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

const stripThinking = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

export async function warmup(model = AI.MODEL) {
  return chat([{ role: 'user', content: 'Say "ready".' }], { maxTokens: 5, timeoutMs: AI.WARMUP_TIMEOUT_MS, model, priority: 10 });
}

export async function ollamaUp() {
  try {
    const res = await fetch(`${AI.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
