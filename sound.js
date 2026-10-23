/* Offline Web Audio mixer. No device-volume or network access. */
(function(root){
'use strict';
const clamp=(v,fallback)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;
const defaults={sfxVolume:.8,bgmVolume:.35};
function settings(data){return {sfxVolume:clamp(data?.sfxVolume,defaults.sfxVolume),bgmVolume:clamp(data?.bgmVolume,defaults.bgmVolume)}}
class Mixer{
 constructor(factory){this.factory=factory||(()=>new (root.AudioContext||root.webkitAudioContext)({latencyHint:'interactive'}));this.context=null;this.voices=new Set();this.enabled=false;this.levels={...defaults};this.lastTone=-Infinity;}
 build(){
  const c=this.context=this.factory();this.sfx=c.createGain();this.bgm=c.createGain();this.master=c.createGain();this.compressor=c.createDynamicsCompressor();this.limiter=c.createWaveShaper();
  this.master.gain.value=1.35;
  Object.assign(this.compressor.threshold,{value:-10});this.compressor.knee.value=8;this.compressor.ratio.value=12;this.compressor.attack.value=.003;this.compressor.release.value=.12;
  // Last-stage soft limiter, bounded below full scale even for simultaneous voices.
  const curve=new Float32Array(4097);for(let i=0;i<curve.length;i++)curve[i]=.88*Math.tanh(1.35*(i*2/(curve.length-1)-1));this.limiter.curve=curve;this.limiter.oversample='2x';
  this.sfx.connect(this.master);this.bgm.connect(this.master);this.master.connect(this.compressor);this.compressor.connect(this.limiter);this.limiter.connect(c.destination);this.apply();return c;
 }
 apply(){if(!this.context)return;const t=this.context.currentTime;for(const [bus,v] of [[this.sfx,this.enabled?this.levels.sfxVolume:0],[this.bgm,this.enabled?this.levels.bgmVolume:0]]){bus.gain.cancelScheduledValues(t);bus.gain.setTargetAtTime(v,t,.015);}}
 configure(enabled,levels){this.enabled=!!enabled;this.levels=settings(levels);this.apply();if(!this.enabled)this.stop();}
 unlock(){
  // Invoke synchronously inside a trusted tap/click, including after iOS interruption.
  if(!this.enabled)return Promise.resolve(false);
  try{if(!this.context||this.context.state==='closed')this.build();const c=this.context;
   const resumed=c.state==='running'?Promise.resolve():c.resume();
   const buffer=c.createBuffer(1,1,c.sampleRate),src=c.createBufferSource();src.buffer=buffer;src.connect(this.sfx);src.onended=()=>src.disconnect();src.start();
   return resumed.then(()=>c.state==='running').catch(()=>false);
  }catch(e){return Promise.resolve(false);}
 }
 tone(n=0){
  if(!this.enabled||!this.levels.sfxVolume)return;
  const ready=this.unlock();return ready.then(ok=>{if(!ok||!this.enabled||!this.levels.sfxVolume)return;this.play(n);});
 }
 play(n){
  const c=this.context;if(!c||c.state!=='running')return;
  const now=c.currentTime;if(now-this.lastTone<.035)return;this.lastTone=now;this.schedule(n,now);
 }
 schedule(n,now){
  const c=this.context;
  const count=n>=4?3:1,peak=n>=4?.24:n>=3?.21:.135;
  // Max 12 voices plus rate limiting bounds overlapping bursts.
  while(this.voices.size+count>12){const oldest=this.voices.values().next().value;this.voices.delete(oldest);try{oldest.stop()}catch(e){}}
  for(let i=0;i<count;i++){
   const osc=c.createOscillator(),env=c.createGain(),t=now+.006+i*.075,len=n>=3?.23:.15;
   osc.type='triangle';osc.frequency.setValueAtTime(720+i*210+(n>=3?180:0),t);osc.frequency.exponentialRampToValueAtTime(850+i*210+(n>=3?180:0),t+len*.45);
   env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(peak,t+.006);env.gain.exponentialRampToValueAtTime(.0001,t+len);
   osc.connect(env);env.connect(this.sfx);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();env.disconnect()};osc.start(t);osc.stop(t+len+.01);
  }
 }
 recover(){const old=this.context;this.stop();this.context=null;if(old&&old.state!=='closed')old.close().catch(()=>{});return this.unlock();}
 stop(){for(const osc of this.voices){try{osc.stop()}catch(e){}}this.voices.clear();}
}
const api={Mixer,settings,defaults};root.RidomonSound=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
