// Integration only: graphics and all model construction remain in Front 1's world.
const modules=import.meta.glob('../world/index.js');
const introModules=import.meta.glob('../intro/index.js');

import {layoutForWorld,entityPatch} from './contracts.js';
import {buildTimeline} from '../ui/timeline.js';
import {narrativeContent} from '../ui/narrative.js';

export class WorldConnection {
  constructor({events,send,attach,canvas,onStatus=()=>{}}){
    this.send=send;this.attach=attach;this.canvas=canvas;this.onStatus=onStatus;
    this.remotePlayers=new Map();this.hourglasses=new Map();this.active=false;
    events.on('auth_ok',message=>{
      this.you=message.you;this.meta=message.world;this.active=true;this.shipRequested=false;
      for(const id of this.remotePlayers.keys())this.world?.players?.remove?.(id);
      this.remotePlayers.clear();
      this.world?.chunks?.setWorldMeta?.(this.meta);
      this.requestShip();
    });
    events.on('scene',scene=>{
      this.scene=scene;this.active=true;
      if(scene.id==='intro')this.playIntro(scene);
      else if(this.introPlaying)this.intro?.stop();  // пропуск или конец интро на сервере: затемнение и обратно в мир
      if(scene.id!=='lobby')this.ensure();
      if(this.world)this.applyScene();
    });
    events.on('chunk',message=>{
      if(!this.world)return;
      // Остров и другие зоны — через менеджер чанков мира (кеш ≤ 10%); корабль — раскладкой ниже
      if(message.zone!=='ship'){this.world.chunks?.receive?.(message.zone,message.key,message.data);return;}
      if(message.key!=='0,0')return;
      const layout=layoutForWorld(message.data);
      this.world.loadLayout(layout);
      this.hourglasses.clear();
      for(const entry of layout.interactables){
        if(entry.state)this.applyEntity(entry.id,entry.state);
        if(entry.kind==='hourglass'&&entry.state?.emptyAt)this.hourglasses.set(entry.id,{emptyAt:entry.state.emptyAt,period:entry.period||60});
      }
      this.onStatus('ready');
    });
    events.on('chunk_denied',message=>{if(message.zone!=='ship')this.world?.chunks?.denied?.(message.zone,message.key,message.reason);});
    events.on('entity',message=>this.applyEntity(message.id,message.state));
    events.on('player_join',player=>{
      if(player.id===this.you?.id)return;
      this.remotePlayers.set(player.id,player);this.world?.players?.upsert?.(player.id,player);
    });
    events.on('player_leave',({id})=>{this.remotePlayers.delete(id);this.world?.players?.remove?.(id);});
    events.on('snapshot',message=>this.world?.players?.snapshot?.(message.players.filter(player=>player.id!==this.you?.id),message.tick));
    events.on('chat',message=>this.world?.players?.say?.(message.from,message.text,4));
    events.on('logout',()=>{this.active=false;cancelAnimationFrame(this.frameId);this.frameId=null;this.previous=null;});
  }
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
      for(const [id,player] of this.remotePlayers)world.players?.upsert?.(id,player);
      this.gameplay=this.attach(world,this.canvas);
      this.applyScene();this.requestShip();this.startLoop();return world;
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
    if(this.scene.zone)this.world.setZone(this.scene.zone);
    if(Number.isFinite(this.scene.tod))this.world.setTimeOfDay(this.scene.tod);
    if(this.lastScene!==this.scene.id){
      this.lastScene=this.scene.id;this.requestShip();
      if(this.scene.type==='cutscene'&&this.scene.id!=='intro')this.world.cutscene?.play?.(this.scene.id,this.scene.startAt);
    }
  }
  applyEntity(id,state={}){
    if(!this.world)return;
    this.world.setEntityState?.(id,entityPatch(state));
    if(state.emptyAt)this.hourglasses.set(id,{emptyAt:state.emptyAt,period:60});
  }
  startLoop(){
    if(this.frameId||!this.active)return;
    const loop=ms=>{
      if(!this.active)return;
      // Пока идёт интро, канвас рисует оно само (world.frame вызывать нельзя)
      if(this.introPlaying){this.previous=null;this.frameId=requestAnimationFrame(loop);return;}
      const dt=this.previous===null||this.previous===undefined?0:Math.min((ms-this.previous)/1000,0.05);
      this.previous=ms;this.gameplay.update(dt,ms/1000);
      if(this.scene?.zone&&this.scene.zone!=='ship')this.world.chunks?.update?.(this.world.camera.position,dt);
      for(const [id,clock] of this.hourglasses)this.world.setEntityState?.(id,{fill:Math.min(1,Math.max(0,(clock.emptyAt-Date.now())/(clock.period*1000)))});
      this.world.frame(dt);this.frameId=requestAnimationFrame(loop);
    };
    this.frameId=requestAnimationFrame(loop);
  }
}
