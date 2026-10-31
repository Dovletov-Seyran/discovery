import { chat } from './llm.js';

// Словарь терминов эпохи: маленькая модель иначе пишет «Ципангу», «пилот», «Боже знает»
const GLOSSARY = [
  'boy → юнга (when addressing a person)',
  'lad → парень',
  'pilot → штурман',
  'interpreter → переводчик',
  'Admiral → адмирал',
  'Admiral of the Ocean Sea → адмирал Моря-Океана',
  'Cipangu → Сипанго',
  'Cathay → Катай',
  'the Indies → Индия',
  'the Great Khan → Великий хан',
  'leagues → лиг',
  'maravedis → мараведи',
  'senor → сеньор',
  'my friend → друг мой',
  'goat cheese → козий сыр',
  'a wheel (of cheese) → головка сыра',
  'salted meat → солонина',
  "ship's biscuit → сухари",
  'God knows → одному Богу известно',
  'As I told you → Как я уже говорил',
  "I'll tell you what → Вот что я тебе скажу",
  'Listen here → Слушай-ка',
  'the Sea of Darkness → Море Мрака',
  'Moors → мавры',
];

const SYSTEM = [
  "Translate the user's text from English into natural, fluent Russian.",
  'It is the speech of a character in 1492; use a slightly old-fashioned, lively tone.',
  'Keep the exact meaning, use only real Russian words and correct grammar. Translate idioms by meaning, not word by word.',
  'Use these terms:',
  ...GLOSSARY.map((g) => `- ${g}`),
  'Output only the translation, nothing else.',
].join('\n');

export async function toRussian(en) {
  const res = await chat(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: en }],
    { priority: 0, temperature: 0.2, maxTokens: 320 },
  );
  return { text: res.text.replace(/^["«]+|["»]+$/g, '').trim(), ms: res.ms };
}
