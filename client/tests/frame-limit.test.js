import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameDue,FPS_PLAY,FPS_CALM} from '../src/game/frame-limit.js';
// Экран 120 Гц зовёт кадр каждые 8.33 мс — рисуем ровно каждый второй (60) или каждый четвёртый (30)
function drawn(hz,fps,seconds=2){let last=null,n=0;for(let t=0;t<seconds*1000;t+=1000/hz)if(frameDue(t,last,fps)){last=t;n++;}return n/seconds;}
test('120 Гц экран: 60 кадров в игре и 30 в меню',()=>{
 assert.ok(Math.abs(drawn(120,FPS_PLAY)-60)<=1);
 assert.ok(Math.abs(drawn(120,FPS_CALM)-30)<=1);
});
test('60 Гц экран не теряет кадры из-за дрожания таймера',()=>{
 let last=null,n=0;for(let i=0;i<120;i++){const t=i*16.67+(i%2?0.9:-0.9);if(frameDue(t,last,FPS_PLAY)){last=t;n++;}}
 assert.equal(n,120);
});
