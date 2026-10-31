import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline,timelineFrame,subtitleChunks,NarrativePlayer} from '../src/ui/timeline.js';
import {VoiceLibrary} from '../src/ui/voice.js';

const manifest={a:{file:'a.mp3',duration:10,ru:'Первая реплика'},b:{file:'b.mp3',duration:5,ru:'Вторая реплика'}};
const config={panels:[{line:'a',pause:1},{line:'b',pause:2}]};
test('timeline includes pauses and seeks to the current line after reconnect',()=>{
  const timeline=buildTimeline(config,manifest);
  assert.equal(timeline[1].start,11);assert.equal(timeline.at(-1).end,18);
  const frame=timelineFrame(timeline,13);assert.equal(frame.segment.line,'b');assert.equal(frame.offset,2);assert.equal(frame.subtitle,'Вторая реплика');
  assert.equal(timelineFrame(timeline,-1),null);
  assert.equal(timelineFrame(timeline,10.5).speaking,false);
});
test('short demo scene scales audio and pauses together',()=>{
  const timeline=buildTimeline(config,manifest,9);
  assert.equal(timeline[0].rate,2);assert.equal(timeline.at(-1).end,9);
  assert.equal(timelineFrame(timeline,6.5).offset,2);
});
test('subtitle chunks preserve the full text without a wall of text',()=>{
  const text='Солнце над горизонтом помогает штурману определить широту корабля.';
  const chunks=subtitleChunks(text,25);assert.equal(chunks.join(' '),text);assert.ok(chunks.every(chunk=>chunk.length<=25));assert.ok(chunks.length>1);
});
test('voice loads only local manifest and preserves the line filename',async()=>{
  let playedUrl,paused=false;
  const voices=new VoiceLibrary({fetchImpl:async url=>{assert.equal(url,'/audio/vo/manifest.json');return{ok:true,json:async()=>manifest};},createAudio:url=>{playedUrl=url;return{readyState:1,play:async()=>{},pause:()=>paused=true};}});
  assert.equal(await voices.playLine('b',{offset:2}),true);assert.equal(playedUrl,'/audio/vo/b.mp3');assert.equal(voices.audio.currentTime,2);
  voices.stop();assert.equal(paused,true);
});
test('voice rejects filenames outside the local MP3 library',async()=>{
  const voices=new VoiceLibrary({createAudio:()=>{throw new Error('must not create audio');}});
  voices.manifest={bad:{file:'../../remote.mp3'}};assert.equal(await voices.playLine('bad'),false);
});
test('leaving the scene while the manifest loads prevents stale audio',async()=>{
  let finish;
  const voices=new VoiceLibrary({fetchImpl:()=>new Promise(resolve=>finish=resolve),createAudio:()=>{throw new Error('stale audio');}});
  const pending=voices.playLine('a');voices.stop();finish({ok:true,json:async()=>manifest});assert.equal(await pending,false);
});
test('narrative seeks to current fragment instead of replaying previous ones',async()=>{
  const played=[];
  const voices={load:async()=>manifest,stop(){},playLine:async(id,options)=>{played.push({id,offset:options.offset});}};
  const player=new NarrativePlayer(voices);await player.start(config,{startAt:Date.now()-13000});player.stop();
  assert.equal(played[0].id,'b');assert.ok(played[0].offset>=2&&played[0].offset<3);
});
