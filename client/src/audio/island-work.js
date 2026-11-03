let context,stop=()=>{};
// Quiet procedural water/wood sounds, generated locally and stopped when work is cancelled.
export function islandWorkSound(message){
 stop();stop=()=>{};if(message.status!=='started')return;
 const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Audio)return;
 try{
  context??=new Audio();context.resume().catch(()=>{});
  const duration=message.duration/1000,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++){
   const t=i/context.sampleRate;
   data[i]=(Math.random()*2-1)*(message.kind==='water'?.05:Math.exp(-((t%.65)*35))*.12)*Math.min(1,t*12,(duration-t)*12);
  }
  const source=context.createBufferSource(),filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=message.kind==='water'?900:1500;
  source.buffer=buffer;source.connect(filter);filter.connect(context.destination);source.start();
  stop=()=>{try{source.stop();}catch{}source.disconnect();filter.disconnect();};source.onended=()=>{source.disconnect();filter.disconnect();};
 }catch{} // Audio availability never blocks work or quests.
}
