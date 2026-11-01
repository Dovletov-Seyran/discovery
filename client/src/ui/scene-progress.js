const NEXT={ship_day:'День на корабле',cut_canary:'К Канарам',canary:'Канарские острова',cut_evening:'В море',ship_evening:'Вечер на корабле',cut_night:'Ночь',night_story:'Ночной рассказ',sleep:'Рассвет',end:'Завершение'};
export function formatRemaining(endsAt,now){
 const seconds=Math.max(0,Math.ceil((endsAt-now)/1000));
 return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
export function sceneProgressView(progress,now=Date.now()){
 if(!progress||progress.phase==='none')return null;
 const next=NEXT[progress.next]||'Следующая сцена';
 if((progress.phase==='timed'||progress.phase==='departing')&&Number.isFinite(progress.endsAt)){
  return {label:progress.phase==='departing'?'Переход через':'До следующей сцены',value:formatRemaining(progress.endsAt,now),detail:next};
 }
 if(progress.phase==='dialogue')return {label:'Задания завершены',value:'',detail:'Ждём окончания разговоров'};
 if(progress.phase==='checkpoint')return {label:'Возвращение на корабль',value:`${progress.ready} / ${progress.total}`,detail:'Завершите задания и соберитесь у шлюпки'};
 return {label:'Переход после заданий',value:'',detail:`Закончили задания: ${progress.done} / ${progress.total}`};
}
