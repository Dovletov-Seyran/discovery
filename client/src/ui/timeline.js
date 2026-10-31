export function buildTimeline(config,manifest,maxDuration) {
  const entries=config.panels||config.segments||[];
  const total=entries.reduce((sum,entry)=>sum+(Number(manifest[entry.line]?.duration)||0)+(Number(entry.pause)||0),0);
  const rate=maxDuration>0?Math.min(2,Math.max(1,total/maxDuration)):1;
  let cursor=0;
  return entries.map((entry,index)=>{
    const line=manifest[entry.line];
    const duration=Number(line?.duration)||0;
    const segment={...entry,index,lineData:line,start:cursor,voiceEnd:cursor+duration/rate,end:cursor+(duration+(Number(entry.pause)||0))/rate,rate};
    cursor=segment.end;
    return segment;
  });
}
export function subtitleChunks(text,maxLength=100) {
  const chunks=[];
  for(const word of String(text||'').split(/\s+/).filter(Boolean)) {
    if(!chunks.length||(chunks.at(-1).length+word.length+1)>maxLength)chunks.push(word);
    else chunks[chunks.length-1]+=` ${word}`;
  }
  return chunks;
}
export function timelineFrame(timeline,elapsed) {
  const segment=timeline.find(item=>elapsed>=item.start&&elapsed<item.end);
  if(!segment)return null;
  const words=subtitleChunks(segment.lineData?.ru);
  const voiceDuration=segment.voiceEnd-segment.start;
  const progress=voiceDuration>0?Math.min(0.999,Math.max(0,(elapsed-segment.start)/voiceDuration)):0;
  return {segment,subtitle:words[Math.floor(progress*words.length)]||'',offset:Math.max(0,(elapsed-segment.start)*segment.rate),speaking:elapsed<segment.voiceEnd};
}

export class NarrativePlayer {
  constructor(voices,{onFrame=()=>{},onEvent=()=>{}}={}){this.voices=voices;this.onFrame=onFrame;this.onEvent=onEvent;this.version=0;}
  async start(config,{startAt=Date.now(),duration}={}) {
    this.stop();
    const version=this.version;
    let manifest;
    try {manifest=await this.voices.load();}catch{return false;}
    if(version!==this.version)return false;
    this.timeline=buildTimeline(config,manifest,duration);
    this.startAt=startAt;this.lastIndex=-1;this.fired=new Set();
    this.timer=setInterval(()=>this.tick(),80);this.tick();return true;
  }
  tick(){
    const elapsed=(Date.now()-this.startAt)/1000;
    const frame=timelineFrame(this.timeline,elapsed);
    if(!frame){this.onFrame(null);if(elapsed>=(this.timeline.at(-1)?.end??0))this.stop();return;}
    const {segment}=frame;
    if(segment.index!==this.lastIndex){
      this.lastIndex=segment.index;
      this.voices.stop();
      if(frame.speaking)this.voices.playLine(segment.line,{offset:frame.offset,rate:segment.rate}).catch(()=>{});
    }
    for(const type of ['sfx','fx'])for(const [index,event] of (segment[type]||[]).entries()){
      const eventAt=event.at<0?segment.voiceEnd+event.at/segment.rate:segment.start+(event.at||0)/segment.rate;
      const key=`${segment.index}:${type}:${index}`;
      if(elapsed>=eventAt&&!this.fired.has(key)){
        this.fired.add(key);
        // Don't replay old one-shot effects after reconnecting midway through a scene.
        if(elapsed-eventAt<0.3)this.onEvent({...event,type});
      }
    }
    this.onFrame(frame);
  }
  stop(){this.version++;clearInterval(this.timer);this.voices.stop();}
}
