import items from '../../../content/items.json';
import npcs from '../../../content/npcs.json';
import quests from '../../../content/quests.json';
import lines from '../../../content/lines.json';
import epilogue from '../../../content/epilogue.json';
export const ROLES = [
  {id:'grumete', name:'Юнга', description:'Снасти и запасы корабля.'},
  {id:'piloto', name:'Штурман', description:'Приборы, звёзды и курс.'},
  {id:'lengua', name:'Переводчик', description:'Беседы и торговля.'},
];
export const ITEMS = Object.fromEntries(items.map(item=>[item.id,{name:item.name,text:item.card||''}]));
export const NPCS = Object.fromEntries(npcs.map(npc=>[npc.id,npc]));
export const NPC_NAMES = Object.fromEntries(npcs.map(npc=>[npc.id,npc.name]));
export const QUESTS = Object.fromEntries(quests.map(quest=>[quest.id,quest]));
export const LINES = lines;
export const EPILOGUE = epilogue;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const itemId = item => typeof item === 'string' ? item : item.id;
