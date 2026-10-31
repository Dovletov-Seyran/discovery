import { chat } from './llm.js';

const SYSTEM = 'Translate the user\'s text from English into natural Russian. Keep names. Use a slightly old-fashioned, lively tone suitable for a sailor of 1492. Output only the translation, nothing else.';

export async function toRussian(en) {
  const res = await chat(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: en }],
    { priority: 0, temperature: 0.2, maxTokens: 220 },
  );
  return { text: res.text.replace(/^["«]+|["»]+$/g, '').trim(), ms: res.ms };
}
