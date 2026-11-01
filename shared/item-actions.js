import {STAMINA} from './stamina.js';
// Every inventory item has an explicit action. Quantities/effects are decided by the server.
export const ITEM_RULES={
 cup:{effect:'cup',cooldown:500},
 compass:{effect:'compass',cooldown:400},map:{effect:'map',cooldown:400},astrolabe:{effect:'astrolabe',cooldown:400},
 wine:{effect:'drink',cooldown:1200,servings:3,drunkMs:10000,strength:.35},
 sword:{effect:'swing',cooldown:580},espingarda:{effect:'shot',cooldown:2500},
 barrel:{effect:'supplies',target:'well',cooldown:500},
 barrel_full:{effect:'water',target:'boat',cooldown:1000,servings:3,energy:12},
 tar:{effect:'supplies',target:'carpenter',cooldown:500},planks:{effect:'supplies',target:'carpenter',cooldown:500},
 purse:{effect:'wallet',cooldown:400},
 cheese:{effect:'food',cooldown:1000,servings:1,energy:35},
 meat:{effect:'food',cooldown:1000,servings:1,energy:50},
 biscuit:{effect:'food',cooldown:1000,servings:1,energy:20},
 // Часть 2 (Гуанахани): вещи для заданий не тратятся — их несут туда, где они нужны (hint — подсказка по ЛКМ)
 spear:{effect:'supplies',target:'fish_shoal',cooldown:500,hint:'Зайди на отмель лагуны и нажми E у косяка рыбы.'},
 fish:{effect:'supplies',target:'cacique',cooldown:500,hint:'Отнеси улов касику и нажми E рядом с ним.'},
 conch:{effect:'supplies',target:'cacique',cooldown:500,hint:'Отнеси раковину касику и нажми E рядом с ним.'},
 cassava:{effect:'supplies',cooldown:500,hint:'Натри клубни на тёрке у бурена.'},
 cassava_grated:{effect:'supplies',cooldown:500,hint:'Отожми сок в плетёном жгуте у бурена.'},
 cassava_pulp:{effect:'supplies',cooldown:500,hint:'Испеки лепёшку на глиняной плите-бурене.'},
 casabe:{effect:'supplies',target:'cacique',cooldown:500,hint:'Отнеси касабе касику и нажми E рядом с ним.'},
 cotton:{effect:'supplies',cooldown:500,hint:'Сплети гамак на раме у дома на краю площади.'},
 hammock_gift:{effect:'supplies',target:'cacique',cooldown:500,hint:'Отнеси гамак касику и нажми E рядом с ним.'},
 firewood:{effect:'supplies',target:'fire',cooldown:500,hint:'Подойди к костру на площади и нажми E.'},
 torch:{effect:'light',cooldown:800},
 parrot:{effect:'show',cooldown:800},gift_cotton:{effect:'show',cooldown:800},
 bell:{effect:'show',cooldown:800},beads:{effect:'show',cooldown:800},red_cap:{effect:'show',cooldown:800},
};
export const freshVitals=()=>({stamina:STAMINA.max,staminaMax:STAMINA.max,drunkUntil:0,drunkStrength:0});
