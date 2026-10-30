import { gameSettings } from './game-settings';
/** Small original synthesized cues, no samples or network fetch. Never affects enemy hearing. */
export function createGameAudio() {
  let context:AudioContext|null=null, master:GainNode|null=null, active=false, lastCue=-Infinity;
  function apply(){if(master&&context)master.gain.setTargetAtTime(gameSettings.muted?0:gameSettings.volume,context.currentTime,.025);}
  function unlock(){try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);apply();}if(context.state==='suspended'&&!document.hidden)void context.resume().catch(()=>{});}catch{/* Audio is optional; gameplay continues. */}}
  function play(kind:'step'|'swing'|'loot'|'preview'){
    if(document.hidden||gameSettings.muted||gameSettings.volume===0||(!active&&kind!=='preview'))return;
    if(kind==='preview')unlock();
    if(!context||!master||context.state!=='running')return;
    const now=context.currentTime;if(now-lastCue<.075&&kind!=='preview')return;lastCue=now;
    try{const osc=context.createOscillator(),gain=context.createGain();osc.type=kind==='swing'?'triangle':'sine';
      const hz=kind==='loot'?660:kind==='swing'?130:kind==='step'?80:440,duration=kind==='loot'?.16:kind==='step'?.045:.11;
      osc.frequency.setValueAtTime(hz,now);osc.frequency.exponentialRampToValueAtTime(kind==='loot'?880:Math.max(40,hz*.55),now+duration);
      gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(kind==='step'?.025:.09,now+.008);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
      osc.connect(gain);gain.connect(master);osc.start(now);osc.stop(now+duration+.01);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }catch{/* Optional output device failure must not stop the frame loop. */}
  }
  window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
  window.addEventListener('shanghai-settings-change',apply);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&context)void context.suspend().catch(()=>{});});
  return {play,setActive:(value:boolean)=>{active=value;},available:()=>context?.state==='running'};
}
