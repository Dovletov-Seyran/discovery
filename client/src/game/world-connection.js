// Integration only: graphics and all model construction remain in Front 1's world.
const modules=import.meta.glob('../world/index.js');
const introModules=import.meta.glob('../intro/index.js');

import {frameDue,FPS_PLAY} from './frame-limit.js';
import {layoutForWorld} from './contracts.js';
import {buildTimeline} from '../ui/timeline.js';
import {narrativeContent} from '../ui/narrative.js';

export class WorldConnection {
  // fpsLimit() — сколько кадров в секунду рисовать сейчас (main.js: 60 в игре, 30 в меню и диалоге)
  constructor({events,send,attach,canvas,onStatus=()=>{},fpsLimit=()=>FPS_PLAY}){
    this.send=send;this.attach=attach;this.canvas=canvas;this.onStatus=onStatus;this.fpsLimit=fpsLimit;
    this.pendingPatches=[];this.remotePlayers=new Map();this.active=false;
    // Патчи мира (предметы игроков и действия агентов) до загрузки мира копим и проигрываем по порядку
    events.on('world_patch',message=>{
      this.setClock(message.serverNow);
      if(this.world){this.world.applyPatch?.(message);return;}
      this.pendingPatches.push(message);
      if(this.pendingPatches.length>200)this.pendingPatches.shift();
    });
    events.on('auth_ok',message=>{
      this.setClock(message.serverNow);
      this.world?.objects?.clear();this.pendingPatches=[];
      this.you=message.you;this.meta=message.world;this.active=true;this.shipRequested=false;
      for(const id of this.remotePlayers.keys())this.world?.players?.remove?.(id);
      this.remotePlayers.clear();
      this.world?.chunks?.setWorldMeta?.(this.meta);
      this.requestShip();
    });
    events.on('scene',scene=>{
      this.world?.players?.clearActions?.();
      this.scene=scene;this.active=true;
      if(scene.id==='intro')this.playIntro(scene);
      else if(this.introPlaying)this.intro?.stop();  // пропуск или конец интро на сервере: затемнение и обратно в мир
      if(scene.id!=='lobby')this.ensure();
      if(this.world)this.applyScene();
    });
    events.on('chunk',message=>{
      if(!this.world)return;
      // Остров и другие зоны — через менеджер чанков мира (кеш ≤ 10%); корабль — раскладкой ниже
      if(message.zone!=='ship'){this.world.chunks?.receive?.(message.zone,message.key,message.data);this.world.objects?.loaded();return;}
      if(message.key!=='0,0')return;
      this.world.chunks?.setStaticData?.('ship-layout',new TextEncoder().encode(JSON.stringify(message.data)).length);
      const layout=layoutForWorld(message.data);
      this.world.loadLayout(layout);
      for(const entry of layout.interactables)if(entry.state)this.applyEntity(entry.id,entry.state);
      for(const npc of layout.npcs||[])if(npc.state)this.applyEntity(npc.id,npc.state);
      this.world.objects?.loaded();
      this.onStatus('ready');
    });
    events.on('chunk_denied',message=>{if(message.zone!=='ship')this.world?.chunks?.denied?.(message.zone,message.key,message.reason);});
    events.on('entity',message=>this.applyEntity(message.id,message.state??message));
    events.on('scene_progress',message=>{
      if(this.world&&message.scene===this.scene?.id&&Number.isFinite(message.serverNow))this.world.npcClockOffset=message.serverNow-Date.now();
    });
    events.on('player_join',player=>{
      if(player.id===this.you?.id)return;
      this.remotePlayers.set(player.id,player);this.world?.players?.upsert?.(player.id,player);
    });
    events.on('player_equipment',message=>{
      this.setClock(message.serverNow);
      if(message.id===this.you?.id)return;
      const p=this.remotePlayers.get(message.id);
      if(p&&(!(p.equipmentRev>message.equipmentRev)))this.remotePlayers.set(message.id,{...p,equipped:message.item,equipmentRev:message.equipmentRev,zone:message.zone});
      this.world?.players?.equipment?.(message);
    });
    events.on('player_action',message=>{
      this.setClock(message.serverNow);
      if(message.id===this.you?.id)return;
      const p=this.remotePlayers.get(message.id);if(p)this.remotePlayers.set(message.id,{...p,action:message.action});
      this.world?.players?.action?.(message);
    });
    events.on('player_leave',({id})=>{this.remotePlayers.delete(id);this.world?.players?.remove?.(id);});
    events.on('snapshot',message=>{this.setClock(message.serverNow);this.world?.players?.snapshot?.(message.players.filter(player=>player.id!==this.you?.id),message.tick,message.serverNow);});
    events.on('chat',message=>this.world?.players?.say?.(message.from,message.text,4));
    events.on('logout',()=>{this.active=false;cancelAnimationFrame(this.frameId);this.frameId=null;this.previous=null;});
  }
  setClock(serverNow){if(!Number.isFinite(serverNow))return;this.clockSample={serverNow,receivedAt:Date.now()};this.world?.players?.syncClock?.(serverNow,this.clockSample.receivedAt);}
  async ensure(){
    if(this.world){this.applyScene();this.startLoop();return this.world;}
    if(this.loading)return this.loading;
    const load=modules['../world/index.js'];
    if(!load){this.onStatus('missing');return null;}
    this.onStatus('loading');
    this.loading=(async()=>{
      const {world}=await load();
      await world.init(this.canvas,'high');
      this.world=world;
      world.chunks?.setWorldMeta?.(this.meta);
      world.chunks?.setSender?.(({t,...payload})=>this.send(t,payload));
      if(this.clockSample)world.players?.syncClock?.(this.clockSample.serverNow,this.clockSample.receivedAt);
      for(const [id,player] of this.remotePlayers)world.players?.upsert?.(id,player);
      this.gameplay=this.attach(world,this.canvas);
      this.applyScene();for(const patch of this.pendingPatches)world.applyPatch?.(patch);this.pendingPatches=[];this.requestShip();this.startLoop();return world;
    })().catch(error=>{console.error('[front2] world initialization',error);this.onStatus('error');return null;}).finally(()=>this.loading=null);
    return this.loading;
  }
  // 3D-интро Фронта 1 («Книга Марко Поло»). Панели длятся столько же, сколько их озвучка в NarrativePlayer
  // (та же buildTimeline по манифесту), поэтому картинка, голос и субтитры меняются вместе.
  async playIntro(scene){
    const load=introModules['../intro/index.js'];
    if(!load||!narrativeContent.intro)return;
    const world=await this.ensure();
    if(!world||this.scene!==scene)return;
    let durations=null;
    try{
      const manifest=await (await fetch('/audio/vo/manifest.json')).json();
      durations=buildTimeline(narrativeContent.intro,manifest,scene.duration).map(segment=>segment.end-segment.start);
    }catch{}  // без манифеста — равные доли duration
    if(this.scene!==scene)return;
    if(!this.intro)this.intro=(await load()).createIntro(world);
    this.introPlaying=true;document.body.classList.add('cinematic');
    try{await this.intro.play({startAt:scene.startAt,duration:scene.duration??90,durations});}
    finally{this.introPlaying=false;document.body.classList.remove('cinematic');this.previous=null;}
  }
  requestShip(){if(this.active&&this.world&&this.scene?.zone==='ship'&&!this.shipRequested)this.shipRequested=this.send('chunk_req',{zone:'ship',keys:['0,0']});}
  applyScene(){
    if(!this.scene)return;
    this.world.setNpcScene?.(this.scene);
    if(this.scene.zone)this.world.setZone(this.scene.zone);
    if(Number.isFinite(this.scene.tod))this.world.setTimeOfDay(this.scene.tod);
    if(this.lastScene!==this.scene.id){
      this.lastScene=this.scene.id;this.requestShip();
      if(this.scene.type==='cutscene'&&this.scene.id!=='intro')this.world.cutscene?.play?.(this.scene.id,this.scene.startAt);
    }
  }
  applyEntity(id,state={}){
    if(!this.world)return;
    this.world.applyEntity?.(id,state);
    // NPC стоит, пока с ним говорят (пауза маршрута — shared/npc-activity.js)
    if('paused' in state)this.world.setEntityState?.(id,{paused:state.paused});
  }
  startLoop(){
    if(this.frameId||!this.active)return;
    const loop=ms=>{
      if(!this.active)return;
      // Пока идёт интро, канвас рисует оно само (world.frame вызывать нельзя)
      if(this.introPlaying){this.previous=null;this.frameId=requestAnimationFrame(loop);return;}
      // лишний вызов браузера (экран 120 Гц) — пропускаем: видеокарта отдыхает
      const cap=this.fpsLimit();this.world.fpsCap=cap;
      if(!frameDue(ms,this.previous,cap)){this.frameId=requestAnimationFrame(loop);return;}
      const dt=this.previous===null||this.previous===undefined?0:Math.min((ms-this.previous)/1000,0.05);
      this.previous=ms;
      if(this.scene?.zone&&this.scene.zone!=='ship')this.world.chunks?.update?.(this.world.camera.position,dt);
      this.gameplay.update(dt,ms/1000);
      this.world.frame(dt);this.gameplay.renderOverlay?.();this.frameId=requestAnimationFrame(loop);
    };
    this.frameId=requestAnimationFrame(loop);
  }
}
