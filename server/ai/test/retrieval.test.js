import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAgent } from '../agents.js';
import { findCards, wordsMatch } from '../retrieval.js';
import { cleanAnswer, isEnglish } from '../prompt.js';

const ids = (agentId, text) => findCards(getAgent(agentId), text).map((c) => c.id);

test('русские окончания совпадают, короткие служебные слова — нет', () => {
  assert.ok(wordsMatch('воды', 'вода'));
  assert.ok(wordsMatch('кораблях', 'корабли'));
  assert.ok(wordsMatch('хана', 'хан'));
  assert.ok(!wordsMatch('про', 'проиграл'));
  // «почему» и «почем» совпадают по 5 буквам, поэтому «почём» убран из ключей торговца
  assert.ok(wordsMatch('почему', 'почем'));
});

const CASES = [
  ['columbus', 'Адмирал, куда мы плывём?', 'why_west'],
  ['columbus', 'Что тебе пообещала королева Изабелла?', 'reward'],
  ['columbus', 'Сколько дней ещё плыть?', 'distance'],
  ['columbus', 'Ты читал Марко Поло?', 'marco_polo'],
  ['columbus', 'Сколько людей на кораблях?', 'ships'],
  ['columbus', 'Матросы боятся и хотят домой', 'compass_secret'],
  ['columbus', 'Откуда ты родом?', 'years_waiting'],
  ['storyteller', 'Расскажи про морских чудовищ', 'sea_monsters'],
  ['storyteller', 'Где ты раньше плавал?', 'africa'],
  ['storyteller', 'Почему юнга поёт?', 'hourglass_song'],
  ['storyteller', 'Что мы едим на корабле?', 'sailor_life'],
  ['storyteller', 'Говорят, на западе есть остров-призрак', 'san_borondon'],
  ['storyteller', 'Во что вы играете?', 'cards_games'],
  ['trader', 'Почём сыр?', 'goods'],
  ['trader', 'Кто правит этим островом?', 'la_gomera'],
  ['trader', 'Почему все свистят?', 'silbo'],
  ['trader', 'Где набрать воды?', 'well_water'],
  ['trader', 'Кто тут жил раньше?', 'guanches'],
  ['trader', 'Сколько стоят мараведи?', 'maravedi'],
];

for (const [agent, question, expected] of CASES) {
  test(`${agent}: «${question}» → ${expected}`, () => {
    assert.ok(ids(agent, question).includes(expected), `нашлось: ${ids(agent, question).join(', ') || 'ничего'}`);
  });
}

test('лишние карточки не цепляются', () => {
  assert.deepEqual(ids('columbus', 'Ты читал Марко Поло?'), ['marco_polo']);
  assert.deepEqual(ids('trader', 'Почему все свистят?'), ['silbo']);
  assert.deepEqual(ids('columbus', 'Как дела?'), []);
});

test('подсказка выбирает карточку напрямую', () => {
  assert.deepEqual(findCards(getAgent('columbus'), '', { hintId: 'reward' }).map((c) => c.id), ['reward']);
});

test('чистка ответа: ремарки, кавычки, не больше 3 предложений', () => {
  assert.equal(cleanAnswer('"*smiles* West. Always west. To the Khan. And gold!"'), 'West. Always west. To the Khan.');
  assert.ok(isEnglish('West, always west.'));
  assert.ok(!isEnglish('На запад!'));
});
