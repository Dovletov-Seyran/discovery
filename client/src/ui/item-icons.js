// Small interface drawings, not additional world models or network assets.
const paths={
 cup:'<path d="M20 20h35v43H20zM55 28h8c15 0 15 25 0 25h-8"/>',
 compass:'<circle cx="40" cy="40" r="26"/><path d="M40 9v9m0 44v9M9 40h9m44 0h9M40 20l8 28-28 12z"/>',
 astrolabe:'<circle cx="40" cy="43" r="25"/><circle cx="40" cy="12" r="5"/><path d="M15 43h50M40 18v50M20 58l40-30"/>',
 map:'<path d="M12 18l18-5 22 7 16-5v48l-16 5-22-7-18 5zM30 13v48m22-41v48M18 40l7-5 12 9 9-16 16 9"/>',
 wine:'<path d="M34 12h12v15c20 8 23 39 3 43H31C11 66 14 35 34 27zM33 12v-5h14v5M25 40l30 17"/>',
 sword:'<path d="M23 57L60 10l7-2 1 8-37 47M18 49l20 16M21 62l-9 11M9 69l8 7"/>',
 espingarda:'<path d="M18 70l15-30L58 8l7 5-25 34-14 28zM30 50l14 8 8-10-9-5"/>',
 barrel:'<path d="M25 13h30c13 14 13 40 0 55H25C12 53 12 27 25 13zM20 26h40M18 53h44M32 14c-7 17-7 36 0 53m16-53c7 17 7 36 0 53"/>',
 tar:'<path d="M20 28h40l-5 40H25zM24 27c0-28 32-28 32 0M23 35h34"/>',
 planks:'<path d="M9 52l46-35 13 8-46 35zM13 62l46-35 10 7-46 36zM24 48l25-19"/>',
 purse:'<path d="M28 10h24l-8 16c29 17 24 44-4 44S7 43 36 26zM29 27h22M40 41v19m6-15c-13-8-15 7-2 7s6 13-10 6"/>',
 cheese:'<path d="M12 45l32-28 24 24v24H12zM12 45l56-4M44 17v24"/><circle cx="28" cy="55" r="3"/><circle cx="53" cy="52" r="4"/>',
 meat:'<path d="M22 52c-30-26 29-54 43-30 12 22-14 47-34 38l-12 12-8-8z"/><ellipse cx="45" cy="36" rx="12" ry="8" transform="rotate(-35 45 36)"/>',
 biscuit:'<path d="M13 25l12-12 40 10 4 35-15 12-39-8zM13 25l40 10 12-12M53 35l1 35"/><path d="M25 37v2m14 5v2m-12 7v2m34-7v2"/>',
};
paths.barrel_full=paths.barrel+'<path d="M34 38q6-14 12 0a6 6 0 01-12 0z"/>';
export const itemIcon=id=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" stroke="#d6c7a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[id]||paths.purse}</svg>`);
// Подпись действия с учётом места: колодец есть только на Канарах, на корабле бочонок не наполнить
export const itemAction=(item,zone)=>item==='barrel'&&zone!=='canary'?'Пустой · воду наберём на Канарах':ITEM_ACTIONS[item];
export const ITEM_ACTIONS={cup:'Рассмотреть кружку',compass:'Направление на север',astrolabe:'Измерить высоту Солнца',wine:'Выпить',sword:'Взмахнуть',map:'Рассмотреть карту',barrel:'Наполнить у колодца',barrel_full:'Пить воду / передать у шлюпки',tar:'Отнести плотнику',planks:'Отнести плотнику',purse:'Открыть кошель',cheese:'Съесть · +35 сил',meat:'Съесть · +50 сил',biscuit:'Съесть · +20 сил',espingarda:'Выстрелить',
 spear:'Бить рыбу на отмели',fish:'Отнести касику',conch:'Отнести касику',cassava:'Натереть на тёрке',cassava_grated:'Отжать в жгуте',cassava_pulp:'Испечь на бурене',casabe:'Отнести касику',cotton:'Сплести гамак',hammock_gift:'Отнести касику',firewood:'Подбросить в костёр',torch:'Посветить',parrot:'Показать',gift_cotton:'Показать',bell:'Позвенеть',beads:'Рассмотреть',red_cap:'Рассмотреть' };
