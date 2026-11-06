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
paths.crossbow='<path d="M14 26c18-14 34-14 52 0M40 15v55M14 26l26 10 26-10M34 62h12"/>';
paths.shield='<circle cx="40" cy="40" r="28"/><circle cx="40" cy="40" r="7"/><path d="M40 12v21m0 14v21M12 40h21m14 0h21"/>';
paths.garlic='<path d="M40 8v14M28 30c-14 6-12 34 12 34s26-28 12-34c-6-3-18-3-24 0zM40 26v38M31 34c-4 10-2 22 6 28m12-28c4 10 2 22-6 28"/>';
paths.stone_ball='<circle cx="40" cy="42" r="24"/><path d="M26 34l8 4 10-6m-6 18l8 4"/>';
paths.book='<path d="M14 20h22c3 0 4 2 4 4v42c0-3-2-4-4-4H14zM66 20H44c-3 0-4 2-4 4v42c0-3 2-4 4-4h22zM20 30h12m-12 8h12m16-8h12m-12 8h12"/>';
paths.note='<path d="M20 10h30l12 12v48H20zM50 10v12h12M28 32h26M28 41h26M28 50h20M28 59h14"/>';
paths.macana='<path d="M34 72l2-26c-7-12-6-30 4-38 10 8 11 26 4 38l2 26zM34 46h12M37 30h6"/>';
paths.war_spear='<path d="M14 72L60 18M60 18l8-10-2 13zM52 30l6 4M48 34l6 4"/>';
paths.bow='<path d="M22 8c26 12 26 52 0 64M22 8v64M22 40h40M54 34l8 6-8 6M26 40h6"/>';
paths.hutia='<path d="M14 52c4-16 22-24 38-20 10 2 16 10 16 18H14zM58 38l8-6M66 50c4 0 8 2 10 6M24 52v8m24-8v8"/><circle cx="60" cy="42" r="2"/>';
paths.iguana='<path d="M8 56c14-2 22-8 34-10 12-2 18 0 26-6M42 46l2-8 4 6 3-7 3 6M26 54v8m22-12v8"/><circle cx="64" cy="40" r="2"/>';
paths.crab='<path d="M24 44c0-10 32-10 32 0s-32 10-32 0zM24 42l-10-8 4-6M56 42l10-8-4-6M26 48l-8 8M54 48l8 8M30 50l-4 10M50 50l4 10"/>';
paths.goat_meat='<path d="M20 30c18-10 36 2 40 18 2 10-8 18-20 16-14-2-26-12-24-22M54 56l12 10"/>';
paths.chicken='<path d="M22 46c0-14 14-22 28-18l8-10 4 6-4 6c6 6 6 18-4 24-12 6-32 4-32-8zM34 64v8m12-8v8"/>';
paths.barrel_full=paths.barrel+'<path d="M34 38q6-14 12 0a6 6 0 01-12 0z"/>';
export const itemIcon=id=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" stroke="#d6c7a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[id]||(id.startsWith('note_')?paths.note:paths.purse)}</svg>`);
// Подпись действия с учётом места: колодец есть только на Канарах, на корабле бочонок не наполнить
export const itemAction=(item,zone)=>item==='barrel'&&zone!=='canary'?'Пустой · воду наберём на Канарах':ITEM_ACTIONS[item];
export const ITEM_ACTIONS={cup:'Рассмотреть кружку',compass:'Направление на север',astrolabe:'Измерить высоту Солнца',wine:'Выпить',sword:'Взмахнуть',map:'Рассмотреть карту',barrel:'Наполнить у колодца',barrel_full:'Пить воду / передать у шлюпки',tar:'Отнести плотнику',planks:'Отнести плотнику',purse:'Открыть кошель',cheese:'Съесть · +35 сил',meat:'Съесть · +50 сил',biscuit:'Съесть · +20 сил',espingarda:'Выстрелить',macana:'Удар · в поединке — по сопернику',war_spear:'Выпад · достаёт дальше дубинки',hutia:'Съесть · +45 сил',iguana:'Съесть · +40 сил',crab:'Съесть · +20 сил',goat_meat:'Съесть · +45 сил',chicken:'Съесть · +35 сил',bow:'Выстрел · в поединке — по сопернику',
 spear:'Бить рыбу на отмели',fish:'Отнести касику',conch:'Отнести касику',cassava:'Натереть на тёрке',cassava_grated:'Отжать в жгуте',cassava_pulp:'Испечь на бурене',casabe:'Отнести касику',cotton:'Сплести гамак',hammock_gift:'Отнести касику',firewood:'Подбросить в костёр',torch:'Посветить',parrot:'Показать',gift_cotton:'Показать',bell:'Позвенеть',beads:'Рассмотреть',red_cap:'Рассмотреть',
 crossbow:'Рассмотреть',shield:'Рассмотреть',stone_ball:'Рассмотреть',garlic:'Съесть · +10 сил',book:'Почитать',
 note_stores:'Прочитать',note_trade:'Прочитать',note_old:'Прочитать',note_arms:'Прочитать',note_cosa:'Прочитать',note_torres:'Прочитать',note_logs:'Прочитать',note_letters:'Прочитать' };
