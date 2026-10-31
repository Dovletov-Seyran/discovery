// Optional files are owned by Back 2. Glob stays valid before that branch merges.
const content = import.meta.glob('../../../content/{intro,night_story,npcs}.json', {eager:true,import:'default'});
export const narrativeContent = {
  intro:content['../../../content/intro.json'],
  night:content['../../../content/night_story.json'],
  npcs:content['../../../content/npcs.json']||[],
};
export const INTRO_TITLES = ['Книга Марко Поло','Путь на Восток','1453','Замысел Колумба','Неизвестный мир','Палос · 1492'];
