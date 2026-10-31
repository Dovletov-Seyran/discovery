import { AI } from './config.js';

// Поиск фактов без эмбеддингов: совпадение начала слов между репликой игрока
// и ключевыми словами карточек. Русские окончания отсекаются сравнением общего префикса.
const STOPWORDS = new Set([
  'про', 'что', 'как', 'кто', 'где', 'это', 'эта', 'этот', 'этим', 'тут', 'там', 'мне', 'нам', 'вам', 'тебе', 'тебя', 'меня',
  'его', 'она', 'они', 'оно', 'еще', 'уже', 'вообще', 'был', 'была', 'были', 'так', 'вот', 'ну', 'или', 'если', 'для', 'при',
  'адмирал', 'расскажи', 'скажи', 'говорят', 'правда',
  'the', 'and', 'you', 'what', 'how', 'who', 'tell', 'about', 'are', 'is',
]);

const normalize = (s) => s.toLowerCase().replace(/ё/g, 'е');

export function tokenize(text) {
  return (normalize(text).match(/[a-zа-я0-9]+/g) || []).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// «вода» ~ «воды», «хан» ~ «хана», «корабли» ~ «кораблях», но «про» ≁ «проиграл»
export function wordsMatch(a, b) {
  if (a === b) return true;
  const cp = commonPrefix(a, b);
  if (cp >= 4) return true;
  return cp >= 3 && Math.min(a.length, b.length) <= 4;
}

export function scoreCard(card, words) {
  let score = 0;
  for (const kw of card.kw) {
    const k = normalize(kw);
    if (words.some((w) => wordsMatch(w, k))) score++;
  }
  return score;
}

export function findCards(agent, text, { hintId } = {}) {
  if (hintId) {
    const card = agent.cards.find((c) => c.id === hintId);
    return card ? [card] : [];
  }
  const words = tokenize(text || '');
  if (!words.length) return [];
  const scored = agent.cards
    .map((card) => ({ card, score: scoreCard(card, words) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  // Слабые попутные совпадения отбрасываем: вторая карточка только если она не хуже первой или набрала ≥ 2
  const best = scored[0]?.score ?? 0;
  return scored
    .filter((x) => x.score === best || x.score >= 2)
    .slice(0, AI.MAX_CARDS)
    .map((x) => x.card);
}
