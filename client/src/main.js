import './ui/style.css';
import {placement,launch} from './game/object-actions.js';
import {drawLocalMap,unlockItemAudio,playShot} from './ui/item-feedback.js';
import {ITEM_RULES,freshVitals} from '../../shared/item-actions.js';
import {sceneProgressView} from './ui/scene-progress.js';
import {Equipment,itemPictures} from './game/equipment.js';
import {itemIcon,ITEM_ACTIONS} from './ui/item-icons.js';
import {CONFIG} from '../../shared/config.js';
import {ASTROLABE,latitude,answers,signed} from '../../shared/astrolabe.js';
import {SocketClient,Events,forwardGameEvents} from './net/socket.js';
import {MockClient} from './net/mock.js';
import {Telemetry} from './net/telemetry.js';
import {FPS_PLAY,FPS_CALM} from './game/frame-limit.js';
import {GameplayRuntime} from './game/runtime.js';
import {WorldConnection} from './game/world-connection.js';
import {ROLES,ITEMS,NPCS,NPC_NAMES,QUESTS,LINES,escape,itemId} from './ui/content.js';
import {shellView,loginView,lobbyView} from './ui/views.js';
import {VoiceLibrary} from './ui/voice.js';
import {narrativeContent,INTRO_TITLES} from './ui/narrative.js';
import {NarrativePlayer} from './ui/timeline.js';
import {WorldAudio} from './audio/world-audio.js';

const uniqueId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const $ = selector => document.querySelector(selector);
const root = $('#ui');
const canvas = $('#game');
const preview = new URLSearchParams(location.search).get('offline') === '1';
const PLAY_SCENES = new Set(['ship_day','canary','ship_evening']);

// Consumers can subscribe before opening the connection. Chunk data is forwarded,
// never retained here; ownership and cache limits belong to Front 1.
export const gameEvents = new Events();
export const sendGameMessage = (type,payload={}) => net?.send(type,payload) ?? false;
export const playVoiceLine = (id,options) => voices.playLine(id,options);
export const getPlayerState = () => runtime ? {p:runtime.controller.position.toArray(),r:runtime.controller.yaw,a:runtime.controller.animation} : null;
let net, runtime, world, equipment;
let throwMode=false;
let equipped=null, selectedItem=null, pictures={}, dialogueId=null, requestId=null, dialogueHeartbeat;
let screen='login', modal='', connected=false, chatOpen=false;
let you={}, scene={id:'lobby',type:'lobby'}, players=[], inventory=[], quests={};
let savedPosition, savedYaw=0, currentTarget, activeNpc;
let noticeTimer, npcAudio, waitingForReply=false, frameCount=0, fpsAt=0, dialogueTimer;
let sceneProgress=null,serverOffset=0,vitals=freshVitals(),itemUses={},money=0,pendingUnequip=null;
const itemCooldowns=new Map();
let scriptIndex=0,scriptLines=[],tradeState=null,partyReady={},serverBuild=null;
const knownCards=new Set();
const telemetry=new Telemetry(()=>world); // ping и метрики клиента для админки
const settings={quality:'high',sensitivity:2,voices:0.8,fps:FPS_PLAY};
const voices=new VoiceLibrary({onVoice:playing=>gameEvents.emit('voice',{playing})});
const narrative=new NarrativePlayer(voices,{
  onFrame:frame=>{
    if(!frame){if($('#subtitles'))$('#subtitles').textContent='';return;}
    if($('#intro-title'))$('#intro-title').textContent=INTRO_TITLES[frame.segment.index]||'';
    if($('#intro-index'))$('#intro-index').textContent=String(frame.segment.index+1).padStart(2,'0');
    if($('#subtitles'))$('#subtitles').textContent=frame.subtitle;
  },
  onEvent:event=>gameEvents.emit('narrative_event',event),
});
for(const npc of narrativeContent.npcs)NPC_NAMES[npc.id]=npc.name;

export function attachWorld(nextWorld, targetCanvas=canvas, options={}) {
  equipment?.dispose();
  runtime?.dispose();
  world=nextWorld;
  equipment=new Equipment(world);equipment.equip(equipped);applyVitals(vitals);
  try{pictures=itemPictures(world,Object.keys(ITEMS));}catch(error){console.warn("[items] thumbnails unavailable",error);}
  runtime=new GameplayRuntime(world,targetCanvas,{
    ...options,
    send:(type,data)=>net?.send(type,data)??false,
    onTarget:target=>{
      currentTarget=target;
      $('#prompt').hidden=!target;
      $('#prompt').textContent=target?`E  ${target.label||'Взаимодействовать'}`:'';
      $('#crosshair').classList.toggle('active',!!target);
    },
  });
  if(savedPosition)runtime.teleport(savedPosition,savedYaw);
  if(scene.zone)world.setZone?.(scene.zone);
  if(Number.isFinite(scene.tod))world.setTimeOfDay?.(scene.tod);
  world.setQuality?.(settings.quality);
  runtime.controller.sensitivity=settings.sensitivity/1000;
  $('#world-status').hidden=true;
  syncInput();
  // Front 1 calls update(deltaSeconds, elapsedSeconds) before its own render.
  const attachedRuntime=runtime;
  return {
    update(delta,time){
      if(runtime!==attachedRuntime)return;
      attachedRuntime.update(delta,time);
      equipment?.update(delta,time,screen==='game'&&!modal&&!chatOpen&&PLAY_SCENES.has(scene.id));
      if(pendingUnequip&&equipment.action<=0){if(equipped===pendingUnequip)equipItem(null);pendingUnequip=null;}
      updateInstrument();renderVitals();
      const hint=$('#control-hint');
      if(hint){
        hint.hidden=screen!=='game'||!!modal||chatOpen||!connected||!PLAY_SCENES.has(scene.id)||document.pointerLockElement===canvas;
        const text=runtime.controller.hasControl?'WASD — ходить · зажмите ПКМ — осмотреться · E — действие':'Щёлкните по игре, чтобы управлять';
        if(hint.textContent!==text)hint.textContent=text;
      }
      if(!$('#debug').hidden){
        frameCount++;
        if(time-fpsAt>=0.7){
          const fps=Math.round(frameCount/(time-fpsAt));frameCount=0;fpsAt=time;
          const stats=world.stats?.();
          $('#debug').textContent=`${fps} FPS${Number.isFinite(telemetry.ping)?` · ping ${telemetry.ping} мс`:''}${Number.isFinite(stats?.calls)?` · ${stats.calls} draw calls`:''}${stats?.chunks?`\nМир: ${stats.chunks.loaded}/${stats.chunks.total} · ${stats.chunks.pct.toFixed(1)}%`:''}`;
        }
      }
    },
    renderOverlay(){if(runtime===attachedRuntime)equipment?.render();},
    dispose(){if(runtime===attachedRuntime){runtime.dispose();runtime=null;world=null;currentTarget=null;$('#world-status').hidden=false;syncInput();}},
  };
}

function syncInput(){
  const blocked=screen!=='game'||modal||chatOpen||!connected;
  runtime?.setMode(blocked?'blocked':scene.id==='night_story'?'seated':PLAY_SCENES.has(scene.id)?'play':'blocked');
  if($('#control-hint'))$('#control-hint').hidden=!!blocked;
  $('#crosshair').hidden=blocked||!runtime||!PLAY_SCENES.has(scene.id);
  if(blocked&&throwMode){throwMode=false;renderEquipment();}
  if(blocked){$('#prompt').hidden=true;currentTarget=null;}
}
function notify(text){
  $('#notice').textContent=text;$('#notice').hidden=false;
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,3000);
}
function connectionStatus(status){
  connected=status==='online'||status==='demo';
  const messages={connecting:'Подключение…',reconnecting:'Связь потеряна. Переподключение…',replaced:'Аккаунт открыт в другой вкладке',kicked:'Администратор отключил вас от игры'};
  $('#connection').textContent=messages[status]||'';$('#connection').hidden=!messages[status];
  if(status==='replaced')showModal('ended',`<section class="menu-panel"><h2>Сессия завершена</h2><p>Аккаунт открыт в другой вкладке.</p><button class="primary" id="session-exit">Ко входу</button></section>`);
  if(status==='replaced')$('#session-exit').onclick=logout;
  if(status==='kicked'){
    showModal('ended',`<section class="menu-panel"><h2>Вы отключены</h2><p>Администратор отключил вас от игры.</p><button class="primary" id="session-exit">Ко входу</button></section>`);
    $('#session-exit').onclick=logout;
  }
  if(status==='full'){
    showModal('ended',`<section class="menu-panel"><h2>Экипаж уже собран</h2><p>В игре уже 3 из 3 игроков — по одному на каждую роль. Дождитесь, пока кто-нибудь выйдет.</p><button class="primary" id="session-exit">Ко входу</button></section>`);
    $('#session-exit').onclick=logout;
  }
  if(screen==='lobby')renderLobby();
  if(!connected&&modal==='dialogue')closeModal();
  syncInput();
}
function login(){
  screen='login';$('#hud').hidden=true;$('#screen').innerHTML=loginView(preview);syncInput();
  $('#login-form').onsubmit=event=>{event.preventDefault();authenticate(false);};
  if($('#register'))$('#register').onclick=()=>authenticate(true);
}
async function authenticate(register){
  gameEvents.emit('audio_unlock',{});
  const name=$('#login-name').value.trim(), password=$('#login-password')?.value;
  if(name.length<3){$('#login-error').textContent='Имя — от 3 символов.';return;}
  if(!password||password.length<4){$('#login-error').textContent='Пароль — от 4 символов.';return;}
  if(preview){connect(name);return;}
  const submit=$('#login-submit'),create=$('#register');submit.disabled=true;create.disabled=true;$('#login-error').textContent='';
  try{
    const response=await fetch(`/api/${register?'register':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:name,password})});
    const data=await response.json();
    if(!response.ok||!data.token)throw new Error(response.status===401?'Неверное имя или пароль.':response.status===409?'Имя уже занято.':'Не удалось войти.');
    localStorage.setItem('discovery.token',data.token);connect(data.token);
  }catch(error){if($('#login-error'))$('#login-error').textContent=error instanceof TypeError?'Сервер недоступен.':error.message;}
  finally{submit.disabled=false;create.disabled=false;}
}
function connect(credential){
  closeModal();equipItem(null);net?.disconnect();connected=false;players=[];inventory=[];quests={};
  net=preview?new MockClient():new SocketClient();
  bindNetwork(net);telemetry.attach(net);net.connect(credential);
}
function bindNetwork(client){
  client.on('connection',({status})=>connectionStatus(status));
  client.on('auth_fail',()=>{client.disconnect();localStorage.removeItem('discovery.token');connected=false;closeModal();login();$('#login-error').textContent='Войдите снова.';});
  client.on('auth_ok',message=>{
    // Сервер перезапустили с новой сборкой, а эта вкладка ещё на старом коде — перезагрузиться
    if(serverBuild&&message.build&&message.build!=='dev'&&message.build!==serverBuild){location.reload();return;}
    serverBuild=message.build;
    you=message.you;inventory=message.state?.inventory||[];quests=message.state?.quests||{};
    itemUses=message.state?.itemUses||{};money=message.state?.money||0;applyVitals(message.state?.vitals||freshVitals());
    savedPosition=message.state?.p;savedYaw=message.state?.r??0;
    inventory.forEach(item=>knownCards.add(itemId(item)));
    if(savedPosition)runtime?.teleport(savedPosition,savedYaw);
    updateInventoryCount();
    applyScene(message.scene||{id:message.state?.scene||'lobby'});
    gameEvents.emit('auth_ok',message);
  });
  client.on('lobby',message=>{players=message.players;if(screen==='lobby')renderLobby();});
  client.on('scene',applyScene);
  client.on('scene_progress',message=>{if(message.scene!==scene.id)return;sceneProgress=message;serverOffset=message.serverNow-Date.now();renderSceneProgress();});
  client.on('pos_correct',message=>{savedPosition=message.p;savedYaw=message.r??savedYaw;runtime?.teleport(savedPosition,savedYaw);gameEvents.emit('pos_correct',message);});
  client.on('inventory',message=>{
    const old=new Set(inventory.map(itemId));inventory=message.items||[];
    itemUses=message.itemUses||{};money=message.money??money;if(message.vitals)applyVitals(message.vitals);
    if(equipped&&!inventory.some(item=>itemId(item)===equipped)){if(equipment?.action>0)pendingUnequip=equipped;else equipItem(null);}
    updateInventoryCount();
    const added=inventory.find(item=>!old.has(itemId(item)));
    if(added&&!modal&&!knownCards.has(itemId(added))){knownCards.add(itemId(added));openKnowledge(itemId(added));}else if(modal==='inventory')openInventory();
  });
  client.on('vitals',message=>applyVitals(message,message.serverNow));
  client.on('item_used',receiveItemUse);
  client.on('quest',message=>{quests[message.id]=message;renderQuest();if(modal==='journal')openJournal();});
  client.on('party',message=>{
    $('#party').textContent=message.waitingFor?.length?`Ждём: ${message.waitingFor.map(player=>player.name).join(', ')}`:'';
    if($('#skip-votes'))$('#skip-votes').textContent=message.skip?`${message.skip.votes} / ${message.skip.total}`:'';
    partyReady=message.ready||{};if(screen==='game')renderQuest();
    gameEvents.emit('party',message);
  });
  client.on('notice',message=>notify(message.text));
  client.on('chat',message=>{
    const line=document.createElement('p');line.textContent=`${message.name||message.from}: ${message.text}`;$('#chat-log').append(line);
    while($('#chat-log').children.length>6)$('#chat-log').firstChild.remove();
    setTimeout(()=>line.remove(),10000);gameEvents.emit('chat',message);
  });
  client.on('npc_thinking',message=>{if(matchesReply(message)){waitingForReply=true;$('#npc-text').textContent='Думает…';setDialogueBusy(true);}});
  client.on('npc_say',receiveDialogue);
  client.on('trade_state',message=>{tradeState=message;if(modal==='dialogue'&&activeNpc===message.npc)renderTrade();});
  client.on('snapshot',message=>gameEvents.emit('snapshot',message));
  client.on('player_join',message=>gameEvents.emit('player_join',message));
  client.on('player_leave',message=>gameEvents.emit('player_leave',message));
  client.on('tod',message=>{scene.tod=message.value;world?.setTimeOfDay?.(message.value);gameEvents.emit('tod',message);});
  forwardGameEvents(client,gameEvents);
}
function renderLobby(){
  $('#screen').innerHTML=lobbyView(players,you,connected);
  document.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>net.send('interact',{id:`role:${button.dataset.role}`}));
  $('#ready').onclick=()=>net.send('ready',{value:!players.find(player=>player.id===you.id)?.ready});
  $('#logout').onclick=logout;
}
function applyScene(message){
  narrative.stop();
  scene=message;
  sceneProgress=message.progress||null;
  if(Number.isFinite(sceneProgress?.serverNow))serverOffset=sceneProgress.serverNow-Date.now();
  renderSceneProgress();
  document.body.dataset.sceneType=message.type||'';
  if(Number.isFinite(message.r))savedYaw=message.r;
  if(message.spawn){savedPosition=message.spawn;runtime?.teleport(savedPosition,savedYaw);}
  if(message.seat){savedPosition=message.seat;runtime?.teleport(savedPosition,savedYaw);}
  if(message.zone)world?.setZone?.(message.zone);
  if(Number.isFinite(message.tod))world?.setTimeOfDay?.(message.tod);
  closeModal();closeChat();
  if(message.id==='lobby'){screen='lobby';$('#hud').hidden=true;renderLobby();}
  else{
    screen='game';$('#hud').hidden=false;$('#screen').innerHTML='';
    $('#world-status').hidden=!!runtime;
    $('#preview-controls').hidden=!preview;
    if(!PLAY_SCENES.has(message.id)&&message.id!=='night_story')renderSceneOverlay(message);
    if(message.id==='night_story'&&narrativeContent.night){
      $('#screen').innerHTML='<p id="subtitles" class="subtitles" aria-live="off"></p>';
      narrative.start(narrativeContent.night,{startAt:message.startAt,duration:message.duration});
    }
    renderQuest();
  }
  renderEquipment();syncInput();gameEvents.emit('scene',message);
}
function renderSceneProgress(){
  const el=$('#scene-progress');if(!el)return;
  const view=connected?sceneProgressView(sceneProgress,Date.now()+serverOffset):null;
  el.hidden=!view;
  if(!view)return;
  const html=`<span>${escape(view.label)}</span>${view.value?`<strong>${escape(view.value)}</strong>`:''}<small>${escape(view.detail)}</small>`;
  if(el.innerHTML!==html)el.innerHTML=html;
}
function renderSceneOverlay(message){
  if(message.id==='intro'&&narrativeContent.intro){
    $('#screen').innerHTML='<section class="intro-screen"><span id="intro-index" class="overline">01</span><h2 id="intro-title">1492</h2><p id="subtitles" class="subtitles" aria-live="off"></p><button class="quiet-button" id="skip">Пропустить <span id="skip-votes"></span></button></section>';
    $('#skip').onclick=()=>net.send('skip_vote');
    narrative.start(narrativeContent.intro,{startAt:message.startAt,duration:message.duration});
    return;
  }
  // Text-only fallback before the content branch merges.
  const titles={intro:'1492',cut_canary:'Канарские острова',cut_evening:'Курс на запад',cut_night:'Атлантика',sleep:'12 октября 1492 года',end:'Продолжение следует'};
  $('#screen').innerHTML=`<div class="scene-caption"><h2>${titles[message.id]||''}</h2>${message.id==='intro'?'<button class="quiet-button" id="skip">Пропустить <span id="skip-votes"></span></button>':''}</div>`;
  if($('#skip'))$('#skip').onclick=()=>net.send('skip_vote');
}
function updateInventoryCount(){$('#item-count').textContent=String(inventory.length);renderEquipment();}
function questList(){
  return Object.entries(quests).map(([id,state])=>{
    const def=QUESTS[id];
    return {...state,id,title:state.title||def?.title||'Задание',scene:def?.scene,optional:state.optional??def?.optional,progress:state.progress??state.step??0,total:state.total??def?.steps.length??1,text:state.text??state.stepText??(typeof state.step==='number'?def?.steps[state.step]?.text:null)};
  }).filter(quest=>!quest.scene||quest.scene===scene.id);
}
function renderQuest(){
  const list=questList();
  let quest=list.find(item=>item.status!=='done'&&!item.optional)||list.find(item=>item.status!=='done')||list.at(-1);
  // Канары: всё своё сделано, но ещё не в шлюпке — подсказать, как вернуться на корабль
  const boarded=!!partyReady[you?.id];
  if(scene.id==='canary'&&list.length&&list.every(item=>item.status==='done'||item.optional)&&!boarded)quest={title:'Шлюпка',text:'Иди к шлюпке у причала и нажми E — вернёмся на корабль',status:'active',progress:0,total:1};
  $('#quest').hidden=!quest;
  if(!quest)return;
  // Варианты «любые N из M» — списком с галочками: сразу видно, что сделано и что осталось
  const options=quest.status!=='done'&&Array.isArray(quest.options)?`<ul class="quest-options">${quest.options.map((label,i)=>{const done=(quest.sub||[]).includes(i);return `<li class="${done?'done':''}">${done?'✓':'○'} ${escape(ITEMS[label]?.name||label)}</li>`;}).join('')}</ul>`:'';
  const counter=quest.status==='done'?'Выполнено':[quest.total>1?`шаг ${quest.progress+1} из ${quest.total}`:'',quest.need?`сделано ${quest.count||0} из ${quest.need}`:''].filter(Boolean).join(' · ');
  $('#quest').innerHTML=`<h3>${escape(quest.title)}</h3>${quest.text?`<p>${escape(quest.text)}</p>`:''}${options}<small>${escape(counter)}</small>`;
}
function showModal(type,html){
  if(modal==='dialogue')endDialogue();
  stopNpcAudio();modal=type;$('#modal').hidden=false;$('#modal').innerHTML=html;
  $('#modal').querySelectorAll('[data-close]').forEach(button=>button.onclick=closeModal);syncInput();
  $('#modal').querySelector('input,button,select')?.focus();
}
function closeModal(){endDialogue();clearTimeout(dialogueTimer);voices.stop();stopNpcAudio();modal='';activeNpc=null;waitingForReply=false;$('#modal').hidden=true;$('#modal').innerHTML='';syncInput();
  // окно закрыли кликом — сразу вернуть мышь в игру, без лишнего клика по экрану
  if(screen==='game'&&PLAY_SCENES.has(scene.id))runtime?.controller?.lock?.();}
function closeButton(){return '<button class="close-button" data-close aria-label="Закрыть">×</button>';}
function openKnowledge(id){
  const data=ITEMS[id]||{name:id,text:''};
  showModal('knowledge',`<section class="menu-panel knowledge">${closeButton()}<span class="overline">ПРЕДМЕТ ПОЛУЧЕН</span><h2>${escape(data.name)}</h2>${data.text?`<p>${escape(data.text)}</p>`:''}<button class="primary" data-close>Продолжить</button></section>`);
}
function picture(id){return pictures[id]||itemIcon(id);}
function equipItem(id){throwMode=false;pendingUnequip=null;equipped=id;equipment?.equip(id);renderEquipment();}
function renderEquipment(){
  const hud=$('#equipment');if(!hud)return;
  hud.hidden=!equipped||!PLAY_SCENES.has(scene.id);
  hud.innerHTML=equipped?`<img src="${picture(equipped)}" alt=""><span>${escape(ITEMS[equipped]?.name||equipped)}<small>${escape(throwMode?'Бросить · ЛКМ · F — отменить':`${ITEM_ACTIONS[equipped]||'В руке'} · ЛКМ`)}${itemUses[equipped]!=null?` · ${itemUses[equipped]} ост.`:''}</small><small>G — положить · F — бросок</small></span><output id="instrument"></output>`:'';
}
function updateInstrument(){
  const output=$('#instrument');if(!output||!runtime)return;
  if(equipped==='compass'){
    const degrees=(( -runtime.controller.yaw*180/Math.PI)%360+360)%360;
    const heading=['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'][Math.round(degrees/45)%8];
    output.textContent=`${heading} ${Math.round(degrees)%360}°`;
  } else if(equipped==='espingarda'){const left=Math.max(0,Math.ceil(((itemCooldowns.get(equipped)||0)-Date.now())/1000));output.textContent=left?`${left} с`:'Готово';}
  else if(equipped==='astrolabe')output.textContent=`${Math.round(Math.max(0,runtime.controller.pitch)*180/Math.PI)}°`;
}
function openInventory(){
  const ids=inventory.map(itemId);
  if(!ids.includes(selectedItem))selectedItem=ids[0]||null;
  const data=ITEMS[selectedItem];
  showModal('inventory',`<section class="menu-panel inventory-panel">${closeButton()}<h2>Снаряжение</h2><div class="inventory-layout"><div class="inventory-slots">${Array.from({length:Math.max(8,ids.length)},(_,index)=>{
    const id=ids[index];
    return `<button class="inventory-slot ${id===selectedItem?'selected':''}" ${id?`data-item="${escape(id)}" aria-pressed="${id===selectedItem}"`:'disabled aria-label="Пустое место"'}><small>${index+1}</small>${id?`<img src="${picture(id)}" alt=""><span>${escape(ITEMS[id]?.name||id)}</span>`:'<span>—</span>'}</button>`;
  }).join('')}</div><div class="item-detail">${selectedItem?`<img src="${picture(selectedItem)}" alt=""><h3>${escape(data?.name||selectedItem)}</h3><p>${escape(ITEM_ACTIONS[selectedItem]||'Предмет из припасов')}</p><button id="equip-item" class="primary">${equipped===selectedItem?'Убрать':'Взять в руку'}</button>${data?.text?`<details><summary>О предмете</summary><p>${escape(data.text)}</p></details>`:''}`:'<p>Пока пусто</p>'}</div></div><small>1–9 — выбрать предмет · ЛКМ — использовать</small></section>`);
  document.querySelectorAll('[data-item]').forEach(button=>button.onclick=()=>{selectedItem=button.dataset.item;openInventory();});
  if($('#equip-item'))$('#equip-item').onclick=()=>{equipItem(equipped===selectedItem?null:selectedItem);closeModal();};
}
function openJournal(){
  const list=questList();
  showModal('journal',`<section class="menu-panel journal-panel">${closeButton()}<h2>Судовой журнал</h2>${list.length?list.map(q=>{
    const def=QUESTS[q.id],progress=q.status==='done'?q.total:q.progress;
    return `<article class="journal-quest"><h3>${escape(q.title)} <small>${q.status==='done'?'Выполнено':q.shared?'Общее':q.optional?'Необязательно':''}</small></h3><ol>${(def?.steps||[{text:q.text}]).map((step,i)=>`<li class="${i<progress?'done':i===progress?'current':''}">${escape(step.text||'Задание')}${i===progress&&q.need?` <small>${q.count||0}/${q.need}</small>`:''}</li>`).join('')}</ol></article>`;
  }).join(''):'<p>В этой сцене заданий нет.</p>'}<small>J — закрыть</small></section>`);
}
function applyVitals(next,serverNow=Date.now()+serverOffset){
  vitals={...vitals,...next};
  if(runtime)runtime.controller.stamina=vitals.stamina;
  equipment?.drink(vitals.drunkUntil,vitals.drunkStrength,serverNow);
  renderVitals();
}
function renderVitals(){
  const el=$('#vitals');if(!el)return;
  const energy=Math.round(runtime?.controller.stamina??vitals.stamina),left=Math.max(0,Math.ceil((vitals.drunkUntil-Date.now()-serverOffset)/1000));
  el.hidden=energy>=99&&!left;
  const html=`<span>Силы <progress max="100" value="${energy}" aria-label="Запас сил"></progress> ${energy}</span>${left?`<span>Опьянение ${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}</span>`:''}`;
  if(el.innerHTML!==html)el.innerHTML=html;
}
function receiveItemUse(message){
  const left=Math.max(0,message.cooldownUntil-message.serverNow);itemCooldowns.set(message.item,Date.now()+left);
  if(message.vitals)applyVitals(message.vitals,message.serverNow);
  if(equipped===message.item)equipment?.use();
  if(message.effect==='drink')notify(message.item==='rum'?'Глоток рома.':'Глоток вина.');
  if(message.effect==='food')notify(`Запас сил: ${Math.round(vitals.stamina)} / 100`);
  if(message.effect==='water')notify('Глоток воды.');
  if(message.effect==='shot'){equipment?.fire();playShot();notify('Выстрел · перезарядка 2,5 с');}
  if(message.effect==='map')openMap();
  if(message.effect==='astrolabe')openAstrolabe();
  if(message.effect==='compass')notify('Север — 0°. Курс указан на приборе.');
  if(message.effect==='wallet')showModal('wallet',`<section class="menu-panel">${closeButton()}<h2>Кошель</h2><p>${message.money} мараведи</p><small>Припасы можно купить у торговца на Канарах.</small></section>`);
}
function openMap(){
  const position=runtime?.controller.position.toArray()||savedPosition||[0,0,0],yaw=runtime?.controller.yaw||0;
  showModal('map',`<section class="menu-panel map-panel">${closeButton()}<h2>Морская карта</h2><canvas id="local-map" width="540" height="380" aria-label="Карта загруженных окрестностей"></canvas><small>Координаты: ${position[0].toFixed(0)}, ${position[2].toFixed(0)} · север наверху</small></section>`);
  drawLocalMap($('#local-map'),world,position,yaw,scene.zone);
}
function useEquipped(){
  if(!equipped||!inventory.some(item=>itemId(item)===equipped)||!connected||modal||chatOpen||!PLAY_SCENES.has(scene.id)||sceneProgress?.phase==='departing')return;
  if((itemCooldowns.get(equipped)||0)>Date.now())return;
  if(throwMode){if(world&&net.send('throw',launch(world,equipped))){throwMode=false;renderEquipment();}return;}
  const target=ITEM_RULES[equipped]?.target===currentTarget?.id?currentTarget.id:undefined;
  net.send('use',{item:equipped,...(target?{target}:{})});
}
// Каждый раз другой день пути: своя высота Солнца и склонение (shared/astrolabe.js), ответ проверяет сервер
let astrolabeVariant=null;
function openAstrolabe(){
  const others=ASTROLABE.filter(v=>v!==astrolabeVariant),v=astrolabeVariant=others[Math.floor(Math.random()*others.length)];
  const align=`Совместите с Солнцем: ${v.sun}° ± 2°.`;
  showModal('astrolabe',`<section class="menu-panel astrolabe-panel">${closeButton()}<h2>Астролябия</h2><p>${v.date}. Склонение Солнца ${signed(v.decl)}.</p><div class="astrolabe-dial"><div id="alidade"></div><output id="angle-output">45°</output></div><label for="angle-input">Высота Солнца</label><input id="angle-input" type="range" min="0" max="90" value="45"><p id="alignment">${align}</p><div id="latitude-question" hidden><p>Широта = 90° − ${v.sun}° ${signed(v.decl)}</p><div class="answers">${answers(v).map(value=>`<button data-answer="${value}" class="option-button">${value}°</button>`).join('')}</div></div><p id="answer-feedback" role="status"></p></section>`);
  $('#angle-input').oninput=event=>{
    const angle=Number(event.target.value),aligned=Math.abs(angle-v.sun)<=2;
    $('#angle-output').textContent=`${angle}°`;$('#alidade').style.transform=`rotate(${-angle}deg)`;
    $('#latitude-question').hidden=!aligned;$('#alignment').textContent=aligned?'Определите широту.':align;
  };
  document.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
    const angle=Number($('#angle-input').value),answer=Number(button.dataset.answer);
    if(Math.abs(angle-v.sun)>2)return;
    if(answer!==latitude(v)){$('#answer-feedback').textContent='Попробуйте ещё.';return;}
    if(net.send('minigame',{game:'astrolabe',result:{variant:v.id,angle,answer}}))closeModal();else notify('Нет связи с сервером.');
  });
}
function openDialogue(npc){
  const scripted=NPCS[npc]?.type==='script';
  scriptIndex=0;
  scriptLines=LINES.filter(line=>line.npc===npc&&!/hint|alarm|hourglass|task|wait|done|toast|cards|scare/.test(line.id));
  if(npc==='boatswain')scriptLines=[LINES.find(line=>line.id===`boatswain_hint_${you.role}`),...scriptLines].filter(Boolean);
  showModal('dialogue',`<section class="dialogue-panel">${closeButton()}<h2>${escape(NPC_NAMES[npc]||npc)}</h2><p id="npc-you" hidden></p><p id="npc-text">${scripted?'…':'О чём спросить?'}</p><details><summary>Оригинал</summary><p id="npc-en"></p></details><div id="hints" class="hints"></div><div id="trade"></div>${scripted?'<button id="next-line" class="quiet-button">Далее <kbd>E</kbd></button>':`<form id="npc-form"><input maxlength="${CONFIG.CHAT_MAX_LEN}" placeholder="Ваш вопрос…" aria-label="Вопрос персонажу" required><button class="quiet-button">Спросить</button></form>`}<button class="quiet-button" data-close>Закончить разговор</button></section>`);
  activeNpc=npc;dialogueId=uniqueId();
  const heartbeat=()=>net?.send('dialogue',{npc,dialogueId,active:true});
  heartbeat();dialogueHeartbeat=setInterval(heartbeat,10000);
  if(scripted){$('#next-line').onclick=nextScriptLine;nextScriptLine();return;}
  $('#npc-form').onsubmit=event=>{event.preventDefault();const input=$('#npc-form input'),text=input.value.trim();if(text&&!waitingForReply){if(sendNpc('npc_talk',{npc,text})){input.value='';$('#npc-you').textContent=`Вы: ${text}`;$('#npc-you').hidden=false;beginDialogueWait();}}};
  if(npc==='trader'&&tradeState?.npc===npc)renderTrade();
  $('#npc-form input').focus();
  // Пустой npc_talk = игрок подошёл: агент здоровается с учётом прошлых разговоров и даёт подсказки
  if(NPCS[npc]?.type==='llm'&&sendNpc('npc_talk',{npc,text:''}))beginDialogueWait();
}
function nextScriptLine(){
  const line=scriptLines[scriptIndex++];
  if(!line){closeModal();return;}
  $('#npc-text').textContent=line.ru||'';$('#npc-en').textContent=line.en||'';
  voices.playLine(line.id).catch(()=>{});
}
function endDialogue(){
  clearInterval(dialogueHeartbeat);dialogueHeartbeat=null;
  if(dialogueId)net?.send('dialogue',{npc:activeNpc,dialogueId,active:false});
  dialogueId=null;requestId=null;
}
function sendNpc(type,payload){
  if(waitingForReply)return false;
  requestId=uniqueId();
  return net.send(type,{...payload,dialogueId,requestId});
}
function matchesReply(message){
  return modal==='dialogue'&&activeNpc===message.npc&&(!message.dialogueId||message.dialogueId===dialogueId)&&(!message.requestId||message.requestId===requestId);
}
function beginDialogueWait(){
  waitingForReply=true;setDialogueBusy(true);clearTimeout(dialogueTimer);
  dialogueTimer=setTimeout(()=>{if(modal==='dialogue'){waitingForReply=false;setDialogueBusy(false);notify('Ответ задерживается. Попробуйте ещё раз.');requestId=null;}},50000);
}
function renderTrade(){
  if(!$('#trade')||!tradeState)return;
  $('#trade').innerHTML=`<div class="trade-money">Кошель: ${tradeState.money} мараведи</div>${tradeState.goods.map(good=>`<form class="trade-row" data-trade="${escape(good.item)}"><label>${escape(ITEMS[good.item]?.name||good.item)} <small>${good.sold?'Куплено':`${good.price} м.`}</small></label>${good.sold?'':`<input aria-label="Цена: ${escape(ITEMS[good.item]?.name||good.item)}" type="number" min="1" max="10000" value="${good.price}"><button class="quiet-button">Предложить</button>`}</form>`).join('')}`;
  $('#trade').querySelectorAll('form').forEach(form=>form.onsubmit=event=>{event.preventDefault();if(sendNpc('trade',{npc:activeNpc,item:form.dataset.trade,offer:Number(form.querySelector('input').value)}))beginDialogueWait();});
  setDialogueBusy(waitingForReply);
}
function setDialogueBusy(busy){$('#modal').querySelectorAll('#npc-form button,#hints button,.trade-row button').forEach(button=>button.disabled=busy);}
function receiveDialogue(message){
  if(!matchesReply(message)){
    if(message.line){
      notify(message.ru||'');
      voices.playLine(message.line).catch(()=>{});
    }
    return;
  }
  clearTimeout(dialogueTimer);
  requestId=null;waitingForReply=false;setDialogueBusy(false);$('#npc-text').textContent=message.ru||'';$('#npc-en').textContent=message.en||'';
  if(!message.error)$('#hints').innerHTML=(message.hints||[]).map(hint=>`<button class="quiet-button" data-hint="${escape(hint.id)}">${escape(hint.ru)}</button>`).join('');
  $('#hints').querySelectorAll('button').forEach(button=>button.onclick=()=>{if(sendNpc('npc_hint',{npc:activeNpc,hint:button.dataset.hint})){$('#npc-you').textContent=`Вы: ${button.textContent}`;$('#npc-you').hidden=false;beginDialogueWait();}});
  stopNpcAudio();
  if(typeof message.audio==='string'&&message.audio){
    let url;try{url=new URL(message.audio,location.href);}catch{return;}
    if(url.origin!==location.origin)return;
    npcAudio=new Audio(url.href);npcAudio.volume=settings.voices;
    gameEvents.emit('voice',{playing:true});
    npcAudio.onended=()=>gameEvents.emit('voice',{playing:false});
    npcAudio.onerror=()=>gameEvents.emit('voice',{playing:false});
    npcAudio.play().catch(()=>gameEvents.emit('voice',{playing:false}));
  }
}
function stopNpcAudio(){if(npcAudio){npcAudio.pause();npcAudio=null;gameEvents.emit('voice',{playing:false});}}
function openMenu(){
  showModal('menu',`<section class="menu-panel">${closeButton()}<h2>Настройки</h2><label for="quality">Качество</label><select id="quality"><option value="high">Высокое</option><option value="low">Низкое</option></select><label for="fps">Кадров в секунду</label><select id="fps"><option value="60">60 — плавно</option><option value="30">30 — тише и холоднее</option></select><label for="sensitivity">Чувствительность</label><input id="sensitivity" type="range" min="1" max="5" step="0.1" value="${settings.sensitivity}"><label for="voice-volume">Голос</label><input id="voice-volume" type="range" min="0" max="1" step="0.05" value="${settings.voices}"><button class="primary" data-close>Продолжить</button><button id="leave" class="quiet-button">Выйти</button></section>`);
  $('#quality').value=settings.quality;$('#quality').onchange=event=>{settings.quality=event.target.value;world?.setQuality?.(settings.quality);};
  $('#fps').value=String(settings.fps);$('#fps').onchange=event=>{settings.fps=Number(event.target.value);};
  $('#sensitivity').oninput=event=>{settings.sensitivity=Number(event.target.value);if(runtime)runtime.controller.sensitivity=settings.sensitivity/1000;};
  $('#voice-volume').oninput=event=>{settings.voices=Number(event.target.value);if(npcAudio)npcAudio.volume=settings.voices;voices.volume=settings.voices;};
  $('#leave').onclick=logout;
}
function closeChat(){chatOpen=false;$('#chat-form').hidden=true;syncInput();}
function logout(){vitals=freshVitals();itemUses={};money=0;itemCooldowns.clear();sceneProgress=null;renderSceneProgress();closeModal();equipItem(null);narrative.stop();gameEvents.emit('logout',{});knownCards.clear();net?.disconnect();connected=false;scene={id:'lobby'};savedPosition=null;localStorage.removeItem('discovery.token');closeModal();closeChat();$('#chat-log').innerHTML='';$('#party').textContent='';login();}
function interact(){
  if(!currentTarget||modal||!connected)return;
  if(sceneProgress?.phase==='departing'){notify('Готовимся к переходу.');return;}
  const {id,kind}=currentTarget;
  if(kind==='npc'){openDialogue(id);net.send('interact',{id});return;}
  net.send(kind==='toggle'?'toggle':kind==='pickup'||kind==='item'?'pickup':'interact',{id});
}

root.innerHTML=shellView();
setInterval(renderSceneProgress,250);
// Layout follows actual wrapped text height instead of guessed fixed offsets.
if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(entries=>{document.documentElement.style.setProperty('--hud-dock-height',`${entries[0].contentRect.height}px`);}).observe($('#hud-dock'));
  new ResizeObserver(entries=>{document.documentElement.style.setProperty('--quest-height',`${entries[0].contentRect.height}px`);}).observe($('#quest'));
  new ResizeObserver(entries=>{document.documentElement.style.setProperty('--scene-progress-height',`${entries[0].contentRect.height}px`);}).observe($('#scene-progress'));
}
if(!preview)new WorldAudio(gameEvents);
if(!preview)new WorldConnection({
  events:gameEvents,send:sendGameMessage,attach:attachWorld,canvas,
  // открыто меню, журнал или диалог — 30 кадров: игрок читает, сцене хватает (ноут не греется)
  fpsLimit:()=>modal?FPS_CALM:settings.fps,
  onStatus:status=>{
    const labels={loading:'Загрузка…',missing:'Мир не подключён',error:'Не удалось загрузить сцену'};
    $('#world-status').textContent=labels[status]||'';
    $('#world-status').hidden=status==='ready';
  },
});
$('#menu-button').onclick=openMenu;$('#inventory-button').onclick=openInventory;$('#journal-button').onclick=openJournal;
$('#chat-form').onsubmit=event=>{event.preventDefault();const input=$('#chat-form input'),text=input.value.trim();if(text){net.send('chat',{text});input.value='';}closeChat();};
$('#preview-controls').querySelectorAll('button').forEach(button=>button.onclick=()=>{
  if(!net?.mock)return;
  const type=button.dataset.preview;
  if(type==='pickup')net.send('pickup',{id:'astrolabe'});
  if(type==='dialogue')openDialogue('columbus');
  if(type==='astrolabe')openAstrolabe();
  if(type==='quest')net.emit('quest',{id:'q_astrolabe',title:'Определить широту',step:'Измерьте высоту Солнца.',status:'active',progress:0,total:1});
});
canvas.addEventListener('click',()=>{unlockItemAudio();if(screen==='game'&&!modal&&!chatOpen&&connected){useEquipped();runtime?.controller.lock();}});
window.addEventListener('keydown',event=>{
  if(screen!=='game')return;
  const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
  if(event.code==='Escape'){event.preventDefault();if(modal&&modal!=='ended')closeModal();else if(chatOpen)closeChat();else if(!modal)openMenu();return;}
  if(typing)return;
  if(event.code==='F3'){event.preventDefault();$('#debug').hidden=!$('#debug').hidden;if(!runtime)$('#debug').textContent='Мир не подключён';return;}
  if(event.code==='Tab'){event.preventDefault();if(modal==='inventory')closeModal();else if(!modal)openInventory();return;}
  if(event.code==='KeyJ'&&!event.repeat){event.preventDefault();if(modal==='journal')closeModal();else if(!modal)openJournal();return;}
  if(/^Digit[1-9]$/.test(event.code)&&!modal&&!chatOpen){const id=inventory[Number(event.code.slice(5))-1];if(id)equipItem(itemId(id));return;}
  if(!modal&&!chatOpen&&connected&&PLAY_SCENES.has(scene.id)&&equipped&&!event.repeat){
    if(event.code==='KeyF'){event.preventDefault();throwMode=!throwMode;renderEquipment();return;}
    if(event.code==='KeyG'){
      event.preventDefault();if(sceneProgress?.phase==='departing')return;
      const data=world&&placement(world,equipped);
      if(data)net.send('place',data);else notify('Посмотри на свободное место рядом.');return;
    }
  }
  if(event.code==='Enter'&&!modal){event.preventDefault();chatOpen=true;$('#chat-form').hidden=false;syncInput();$('#chat-form input').focus();return;}
  // preventDefault: иначе тот же keypress напечатает «e» в поле вопроса, которое открытый диалог только что сфокусировал
  if(event.code==='KeyE'&&!event.repeat){event.preventDefault();if(modal==='knowledge')closeModal();else if(modal==='dialogue'&&$('#next-line'))nextScriptLine();else if(!modal)interact();}
});
login();
if(!preview&&localStorage.getItem('discovery.token'))connect(localStorage.getItem('discovery.token'));
