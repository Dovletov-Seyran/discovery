import {ITEM_RULES,freshVitals} from '../../../shared/item-actions.js';
import {Events} from './socket.js';

// UI fixtures only. No map, models, NPC behavior or local game server.
export class MockClient extends Events {
  mock = true;
  role = null;
  ready = false;
  items = [];
  connect(name) {
    this.name = name || 'Игрок';
    this.timer = setTimeout(() => {
      this.emit('connection',{status:'demo'});
      this.emit('auth_ok',{you:{id:'preview',name:this.name,role:null},state:{inventory:[],quests:{}},scene:{id:'lobby',type:'lobby'}});
      this.lobby();
    },0);
  }
  lobby() { this.emit('lobby',{players:[{id:'preview',name:this.name,role:this.role,ready:this.ready,connected:true}]}); }
  send(type,payload={}) {
    if(type==='interact'&&payload.id?.startsWith('role:')) {this.role=payload.id.slice(5);this.lobby();}
    if(type==='ready') {
      if(!this.role){this.emit('notice',{text:'Выберите роль.'});return true;}
      this.ready=payload.value;this.lobby();
      if(this.ready)this.emit('scene',{id:'ship_day',type:'play',zone:'ship',startAt:Date.now()});
    }
    if(type==='use'&&this.items.includes(payload.item)){const r=ITEM_RULES[payload.item];if(r)this.emit('item_used',{item:payload.item,effect:r.effect,cooldownUntil:Date.now()+r.cooldown,serverNow:Date.now(),vitals:freshVitals(),money:100});}
    if(type==='chat')this.emit('chat',{from:'preview',name:this.name,text:payload.text});
    if(type==='pickup'&&payload.id==='astrolabe'&&!this.items.length){this.items=['astrolabe'];this.emit('inventory',{items:this.items});}
    if(type==='minigame'&&payload.game==='astrolabe')this.emit('quest',{id:'q_astrolabe',title:'Определить широту',status:'done',progress:1,total:1});
    if(type==='npc_talk'||type==='npc_hint') {
      this.emit('npc_thinking',{npc:payload.npc});
      this.replyTimer=setTimeout(()=>this.emit('npc_say',{npc:payload.npc,ru:'Держим курс на запад.',en:'We hold our course west.',hints:[{id:'why_west',ru:'Почему на запад?'}]}),400);
    }
    return true;
  }
  disconnect(){clearTimeout(this.timer);clearTimeout(this.replyTimer);}
}
