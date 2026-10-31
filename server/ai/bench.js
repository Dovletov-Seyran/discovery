// Замер моделей: скорость ответа NPC и перевода на одинаковых вопросах.
// npm run bench -- qwen3:4b-instruct
import { chat, warmup } from './llm.js';
import { getAgent } from './agents.js';
import { findCards } from './retrieval.js';
import { buildMessages, cleanAnswer, isEnglish } from './prompt.js';

const models = process.argv.slice(2);
if (!models.length) models.push('qwen3:4b-instruct');

const QUESTIONS = [
  'Адмирал, куда мы вообще плывём и зачем?',
  'Что тебе обещали король с королевой?',
  'Сколько дней нам ещё плыть?',
  'Ты правда веришь, что Земля круглая?',
  'Матросы шепчутся, что пора поворачивать домой.',
];

const agent = getAgent('columbus');
const context = { name: 'Luis', role: 'lengua', log: ['latitude_correct'] };
const TRANSLATE = 'Translate the user\'s text from English into natural Russian. Keep names. Output only the translation.';
const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

const summary = [];
for (const model of models) {
  console.log(`\n=== ${model} ===`);
  const t = performance.now();
  await warmup(model);
  console.log(`загрузка модели: ${Math.round(performance.now() - t)} ms`);

  const answerMs = [], translateMs = [], tps = [];
  let english = 0;
  for (const q of QUESTIONS) {
    const cards = findCards(agent, q);
    const messages = buildMessages({ agent, context, newCards: cards, toldCards: [], history: [], text: q });
    const a = await chat(messages, { model, timeoutMs: 60_000 });
    const en = cleanAnswer(a.text);
    if (isEnglish(en)) english++;
    const r = await chat([{ role: 'system', content: TRANSLATE }, { role: 'user', content: en }], { model, temperature: 0.2, maxTokens: 220, timeoutMs: 60_000 });
    answerMs.push(a.ms);
    translateMs.push(r.ms);
    tps.push(a.tokPerSec);
    console.log(`\n> ${q}\n  [${cards.map((c) => c.id).join(', ')}] ${a.ms} ms, ${a.tokPerSec.toFixed(1)} tok/s\n  EN: ${en}\n  RU: ${r.text} (${r.ms} ms)`);
  }
  summary.push({ model, 'ответ, мс': avg(answerMs), 'перевод, мс': avg(translateMs), 'ток/с': avg(tps), 'по-английски': `${english}/${QUESTIONS.length}` });
}
console.log('\n');
console.table(summary);
