export const ROLES = [
  {id:'grumete', name:'Юнга', description:'Снасти и запасы корабля.'},
  {id:'piloto', name:'Штурман', description:'Приборы, звёзды и курс.'},
  {id:'lengua', name:'Переводчик', description:'Беседы и торговля.'},
];
export const ITEMS = {
  astrolabe: {name:'Астролябия', text:'Измеряет высоту Солнца над горизонтом. Помогает определить широту.'},
  compass: {name:'Компас', text:'Магнитная стрелка указывает на север.'},
  map: {name:'Морская карта', text:'Карта берегов и известных морских путей.'},
  wine: {name:'Бурдюк вина', text:'Часть корабельных запасов.'},
};
export const NPC_NAMES = {columbus:'Адмирал Колумб',storyteller:'Старый Хуан',trader:'Торговец',boatswain:'Боцман',cook:'Кок'};
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const itemId = item => typeof item === 'string' ? item : item.id;
