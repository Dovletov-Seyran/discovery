import{RANK_LABEL,DANCE_BEAT,DANCE_BEATS,DANCE_KEYS,DIRECTIONS}from'../../../shared/feast-games.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrows={left:'←',down:'↓',up:'↑',right:'→'};
const suits={cups:'<path d="M9 8h22v10c0 9-22 9-22 0zM20 25v8M13 34h14"/>',coins:'<circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="8"/><path d="m20 13 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',swords:'<path d="M12 32 29 9l2-2v7L15 34M7 26l13 10M28 32 11 9l-2-2v7l16 20M33 26 20 36"/>',clubs:'<path d="M17 34h7l-2-9c15 8 17-12 6-11 2-12-17-13-16 0C0 14 6 33 18 25z"/>'};
export function cardMarkup(card){
 if(!card)return '<div class="playing-card card-back" aria-label="Закрытая карта"><span>✦</span></div>';
 const[suit,rank]=card.split(':'),label=RANK_LABEL[rank]??rank;
 return `<div class="playing-card suit-${suit}" aria-label="${esc(label)} ${esc({cups:'кубков',coins:'монет',swords:'мечей',clubs:'жезлов'}[suit])}"><span class="card-corner">${esc(label)}</span><svg viewBox="0 0 40 40" aria-hidden="true">${suits[suit]??''}</svg><strong>${esc(label)}</strong><span class="card-corner bottom">${esc(label)}</span></div>`;
}
const hand=cards=>`<div class="card-hand">${cards.map(cardMarkup).join('')}</div>`;
const resultName={win:'Победа +1',draw:'Ничья',lose:'Хуан ближе',bust:'Перебор'};
export function cardsMarkup(state,you){
 const own=state.players.find(p=>p.id===you),turn=state.players.find(p=>p.id===state.turnId),playing=state.phase==='playing',reveal=['reveal','finished'].includes(state.phase),mine=playing&&turn?.id===you&&!own?.left;
 const phase=state.phase==='lobby'?'Собираемся за столом':state.phase==='finished'?(state.cancelled?'Партия завершена':'Три раздачи сыграны'):reveal?'Карты раскрыты':mine?'Твой ход':`Ходит ${turn?.name??'Хуан'}`;
 const buttons=state.phase==='lobby'?`${state.hostId===you?'<button class="feast-primary" data-card-action="start">Начать партию <kbd>Enter</kbd></button>':''}${state.canJoin?'<button class="feast-primary" data-card-action="join">Сесть за стол</button>':''}`:state.phase==='finished'?'<button class="feast-primary" data-card-action="join">Новая партия</button>':`<button class="feast-primary" data-card-action="hit" ${mine?'':'disabled'}>Ещё карту <kbd>H</kbd></button><button data-card-action="stand" ${mine?'':'disabled'}>Хватит <kbd>S</kbd></button>`;
 return `<section class="cards-panel" aria-label="21 по-морскому"><button class="close-button" data-feast-close aria-label="Закрыть стол">×</button><header class="feast-title"><span class="overline">ВЕЧЕР НА «САНТА-МАРИИ»</span><h2>21 <em>по-морскому</em></h2><p>Три раздачи · без ставок · Хуан берёт до 17</p></header><div class="card-table"><div class="table-rim"><div class="dealer-hand"><div class="hand-caption">Старый Хуан <b>${state.dealer.cards.length?`${reveal?'Сумма':'Открыто'}: ${state.dealer.total}`:'Ждёт игроков'}</b></div>${hand(state.dealer.cards)}</div><div class="table-status" role="status"><span>${esc(phase)}</span><strong data-card-clock></strong><small>${state.round?`Раздача ${state.round} из 3`:'До трёх товарищей за одним столом'}</small></div><div class="player-seats">${state.players.map(p=>`<article class="table-seat ${p.id===you?'my-seat':''} ${p.id===state.turnId?'current-seat':''} ${p.left?'left-seat':''}"><div class="hand-caption">${esc(p.name)} ${p.id===you?'<small>ты</small>':''}<b>${p.points} очк.</b></div>${p.cards.length?hand(p.cards):'<div class="empty-hand">Место за столом</div>'}<p class="hand-total">${p.left?'Вышел':p.total!=null?`Сумма: <strong>${p.total}</strong>`:`${p.cards.length} карты`}${!p.connected?' · не в сети':''}</p>${reveal&&!p.left?`<span class="round-result result-${p.result}">${resultName[p.result]??''}</span>`:''}</article>`).join('')}</div></div></div><p class="juan-comment" aria-live="polite">${esc(state.commentary||'Хуан раскладывает карты.')}</p><div class="feast-actions">${buttons}${state.participant&&state.phase!=='finished'?'<button class="quiet-button" data-card-action="leave">Выйти из партии</button>':''}<button class="quiet-button" data-feast-close>Свернуть стол</button></div><p class="feast-help">6–10 — по номиналу; В = 2, Д = 3, К = 4, Т = 11 или 1. Закрытие окна сохраняет твоё место; время хода идёт.</p></section>`;
}
export function danceMarkup(s){
 return `<section class="dance-panel" aria-label="Морской танец"><button class="close-button" data-feast-close aria-label="Отменить танец">×</button><span class="overline">ВЕЧЕР НА ПАЛУБЕ</span><h2>Морской танец</h2><p>Нажимай стрелки или WASD, когда знак дойдёт до линии.</p><div class="dance-topline"><strong data-dance-time>Приготовься</strong><span data-dance-score>${s.score} очков</span></div><div class="dance-floor"><div class="dance-lanes">${DIRECTIONS.map(d=>`<div class="dance-lane" data-lane="${d}"><span class="dance-target">${arrows[d]}</span></div>`).join('')}</div><div class="dance-hit-line"></div><div class="dance-notes">${s.steps.map((d,i)=>`<span class="dance-note" data-note="${i}" data-dir="${d}" style="--lane:${DIRECTIONS.indexOf(d)}">${arrows[d]}</span>`).join('')}</div></div><p class="dance-feedback" data-dance-feedback role="status">Поймай ритм гитары</p><div class="dance-progress"><i data-dance-progress></i></div><p class="feast-help">20 секунд. Ошибки не прерывают танец. Задание засчитывается за завершение.</p><button class="quiet-button" data-feast-close>Отменить танец</button></section>`;
}
export class FeastUI{
 constructor({root,send,show,close,getModal,getYou}){
  Object.assign(this,{root,send,show,close,getModal,getYou});this.offset=0;
  this.heartbeat=setInterval(()=>{if(this.getModal()==='cards')this.send('cards',{action:'heartbeat'});},10000);
 }
 now(){return Date.now()+this.offset;}
 receiveCards(state){
  if(Number.isFinite(state.serverNow))this.offset=state.serverNow-Date.now();
  this.cards=state;if(state.phase==='closed'){if(this.getModal()==='cards')this.close();return;}
  if(state.open&&this.getModal()!=='cards')this.show('cards','');
  if(this.getModal()!=='cards')return;
  const focus=this.root.querySelector(':focus')?.dataset.cardAction;
  this.root.innerHTML=cardsMarkup(state,this.getYou());this.bindClose();
  this.root.querySelectorAll('[data-card-action]').forEach(b=>b.onclick=()=>this.cardAction(b.dataset.cardAction));
  if(focus)this.root.querySelector(`[data-card-action="${focus}"]`)?.focus();this.startClock();
 }
 cardAction(action){
  if(!this.cards)return;
  this.send('cards',{action,sessionId:this.cards.sessionId,revision:this.cards.revision});
  if(action==='leave')this.close();
 }
 receiveDance(s){
  if(Number.isFinite(s.serverNow))this.offset=s.serverNow-Date.now();
  this.dance=s;
  if(s.open&&this.getModal()!=='dance')this.show('dance','');
  if(this.getModal()!=='dance')return;
  if(s.phase!=='dancing'){
   cancelAnimationFrame(this.frame);this.frame=null;
   this.root.innerHTML=`<section class="dance-panel dance-result"><span class="overline">МОРСКОЙ ТАНЕЦ</span><h2>${s.phase==='finished'?'Славно потанцевали!':'Танец отменён'}</h2><strong>${s.score} <small>из ${DANCE_BEATS*100} очков</small></strong><p>Точно: ${s.perfect} · В ритм: ${s.good} · Пропущено: ${DANCE_BEATS-s.perfect-s.good}</p><p>${s.phase==='finished'?'Развлечение засчитано. Высокий результат не обязателен.':'Развлечение не засчитано. Можно попробовать ещё раз.'}</p><button class="feast-primary" data-feast-close>На палубу</button></section>`;this.bindClose();return;
  }
  if(!this.root.querySelector('.dance-floor')){this.root.innerHTML=danceMarkup(s);this.bindClose();}
  if(s.judged){const el=this.root.querySelector('[data-dance-feedback]');el.textContent=({perfect:'Точно!',good:'В ритм!',miss:'Продолжай!'})[s.judged.grade];el.dataset.grade=s.judged.grade;this.feedbackUntil=this.now()+600;}
  this.startClock();
 }
 bindClose(){this.root.querySelectorAll('[data-feast-close]').forEach(b=>b.onclick=()=>this.close());}
 closing(type){
  if(type==='cards')this.send('cards',{action:'hide'});
  if(type==='dance'&&this.dance?.phase==='dancing')this.send('dance',{action:'cancel',sessionId:this.dance.id});
  cancelAnimationFrame(this.frame);this.frame=null;
 }
 handleKey(e){
  const modal=this.getModal();if(e.code==='Escape')return false;
  if(modal==='dance'&&DANCE_KEYS[e.code]){
   e.preventDefault();if(e.repeat||this.dance?.phase!=='dancing')return true;
   const index=Math.round((this.now()-this.dance.startAt)/DANCE_BEAT-.5);
   if(index>=0&&index<this.dance.steps.length)this.send('dance',{action:'hit',sessionId:this.dance.id,index,direction:DANCE_KEYS[e.code]});return true;
  }
  if(modal==='cards'&&!e.repeat&&!/INPUT|TEXTAREA/.test(e.target.tagName)){
   const a=e.code==='KeyH'?'hit':e.code==='KeyS'?'stand':e.code==='Enter'&&this.cards?.phase==='lobby'?'start':null;
   if(a){e.preventDefault();const button=this.root.querySelector(`[data-card-action="${a}"]`);if(button&&!button.disabled)this.cardAction(a);return true;}
  }
  return false;
 }
 startClock(){if(this.frame)return;const frame=()=>{this.frame=null;this.update();if(['cards','dance'].includes(this.getModal()))this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);}
 update(){
  const now=this.now();
  if(this.getModal()==='cards'&&this.cards){const el=this.root.querySelector('[data-card-clock]');if(el){const left=Math.max(0,Math.ceil((this.cards.deadline-now)/1000));el.textContent=this.cards.phase==='playing'?`${left} с`:this.cards.phase==='reveal'?`Дальше через ${left} с`:this.cards.phase==='lobby'?`${this.cards.players.filter(p=>!p.left).length} / 3`:'';}}
  const s=this.dance;if(this.getModal()!=='dance'||s?.phase!=='dancing')return;
  const time=this.root.querySelector('[data-dance-time]');if(!time)return;
  time.textContent=now<s.startAt?`Приготовься · ${Math.min(3,Math.ceil((s.startAt-now)/DANCE_BEAT))}`:`Ещё ${Math.max(0,Math.ceil((s.endsAt-now)/1000))} с`;
  this.root.querySelector('[data-dance-score]').textContent=`${s.score} очков`;
  this.root.querySelector('[data-dance-progress]').style.width=`${Math.max(0,Math.min(100,(now-s.startAt)/200))}%`;
  this.root.querySelectorAll('[data-note]').forEach(note=>{const i=Number(note.dataset.note),until=s.startAt+(i+.5)*DANCE_BEAT-now;note.style.transform=`translateY(${220-until*.095}px)`;note.hidden=until>2300||until< -330;note.classList.toggle('judged',Object.hasOwn(s.attempts,i));});
  if(this.feedbackUntil<now){this.root.querySelector('[data-dance-feedback]').textContent='Продолжай в ритм';this.root.querySelector('[data-dance-feedback]').dataset.grade='';}
 }
 dispose(){clearInterval(this.heartbeat);cancelAnimationFrame(this.frame);}
}
