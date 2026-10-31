// Reads Back 2's existing manifest and MP3 files. No speech synthesis.
export class VoiceLibrary {
  constructor({fetchImpl=globalThis.fetch, createAudio=url=>new Audio(url), onVoice=()=>{}}={}) {
    this.fetch=fetchImpl;
    this.createAudio=createAudio;
    this.onVoice=onVoice;
    this.manifest=null;
    this.volume=0.8;
    this.generation=0;
  }
  async load() {
    if(this.manifest)return this.manifest;
    this.loading??=this.fetch('/audio/vo/manifest.json').then(response=>{
      if(!response.ok)throw new Error('Манифест озвучки недоступен');
      return response.json();
    }).then(manifest=>{
      if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('Неверный манифест озвучки');
      this.manifest=manifest;return manifest;
    }).catch(error=>{this.loading=null;throw error;});
    return this.loading;
  }
  async playLine(id,{offset=0,rate=1}={}) {
    this.stop();
    const generation=this.generation;
    const manifest=await this.load();
    if(generation!==this.generation)return false;
    const line=manifest[id];
    if(!line||typeof line.file!=='string'||!line.file.match(/^[a-zA-Z0-9_-]+\.mp3$/))return false;
    const audio=this.audio=this.createAudio(`/audio/vo/${line.file}`);
    audio.volume=this.volume;
    audio.playbackRate=Math.min(2,Math.max(0.5,rate));
    const seek=()=>{if(generation===this.generation)audio.currentTime=Math.max(0,Math.min(offset,Math.max(0,(line.duration||0)-0.05)));};
    if(audio.readyState>=1)seek();else audio.addEventListener('loadedmetadata',seek,{once:true});
    audio.onended=()=>{if(generation===this.generation)this.onVoice(false);};
    audio.onerror=()=>{if(generation===this.generation)this.onVoice(false);};
    try {await audio.play();if(generation!==this.generation){audio.pause();return false;}this.onVoice(true);return true;}
    catch {if(generation===this.generation)this.onVoice(false);return false;}
  }
  stop(){this.generation++;if(this.audio){this.audio.pause();this.audio=null;this.onVoice(false);}}
}
