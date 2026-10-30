// Pure isolated Node VM tests. Fake audio verifies gain graph, not actual speaker output.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`import * as prefs from './src/game-settings';import {createGameAudio} from './src/game-audio';globalThis.api={...prefs,createGameAudio};`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'iife'});
function setup({raw=null,readFail=false,writeFail=false,withAudio=true}={}) {
 const key='shanghai-survivors-preferences-v1',data=new Map([[key,raw],['campaign-sandbox','KEEP-SAVE']]),writes=[],audio=[];
 class Target{listeners=new Map();addEventListener(k,f){const a=this.listeners.get(k)??[];a.push(f);this.listeners.set(k,a);}dispatchEvent(e){for(const f of this.listeners.get(e.type)??[])f(e);}}
 class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
 const window=new Target(),document=new Target();document.hidden=false;
 class Param{values=[];setTargetAtTime(...a){this.values.push(['target',...a]);}setValueAtTime(...a){this.values.push(['set',...a]);}exponentialRampToValueAtTime(...a){this.values.push(['ramp',...a]);}}
 class AudioContext{state='suspended';currentTime=1;destination={};gains=[];oscillators=[];resumes=0;suspends=0;constructor(){audio.push(this);}createGain(){const n={gain:new Param(),connect(to){n.to=to;},disconnect(){n.disconnected=true;}};this.gains.push(n);return n;}createOscillator(){const n={frequency:new Param(),connect(to){n.to=to;},start(t){n.started=t;},stop(t){n.stopped=t;},disconnect(){n.disconnected=true;}};this.oscillators.push(n);return n;}resume(){this.resumes++;this.state='running';return Promise.resolve();}suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}}
 const localStorage={getItem(k){if(readFail)throw Error('blocked');return data.get(k)??null;},setItem(k,v){if(writeFail)throw Error('full');writes.push(k);data.set(k,v);}};
 const sandbox={window,document,CustomEvent,localStorage,...(withAudio?{AudioContext}:{})};vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
 return {...sandbox,data,writes,audio,key,api:sandbox.api,fire:(target,type)=>target.dispatchEvent(new CustomEvent(type))};
}
let n=0;function test(name,fn){fn();n++;console.log(`PASS ${name}`);}const plain=x=>JSON.parse(JSON.stringify(x));
test('invalid settings normalize to safe defaults with bounded finite volume',()=>{
 const {api}=setup();for(const v of [null,[],false,'bad',{}, {volume:NaN,muted:'yes',language:'fake'}])assert.deepEqual(plain(api.parseSettings(v)),{version:1,volume:.45,muted:false,language:'zh-Hant'});
 assert.equal(api.parseSettings({volume:-2}).volume,0);assert.equal(api.parseSettings({volume:3}).volume,1);
 for(const language of ['zh-Hant','zh-Hans','en'])assert.equal(api.parseSettings({language}).language,language);
});
test('load corruption/access failure recover preferences only; storage key isolated from campaign',()=>{
 for(const opts of [{raw:'not JSON'},{readFail:true}])assert.equal(setup(opts).api.gameSettings.volume,.45);
 const x=setup({raw:JSON.stringify({version:1,volume:.8,muted:true,language:'en'})});assert.equal(x.api.t('繁','简','English'),'English');
 assert.ok(x.api.updateSettings({volume:.3,language:'zh-Hans'}));assert.deepEqual(x.writes,[x.key]);assert.equal(x.data.get('campaign-sandbox'),'KEEP-SAVE');
 assert.equal(JSON.parse(x.data.get(x.key)).volume,.3);assert.equal(x.api.t('繁','简','English'),'简');
});
test('failed storage still changes session and publishes settings, never deletes campaign',()=>{
 const x=setup({writeFail:true});let detail;x.window.addEventListener('shanghai-settings-change',e=>detail=e.detail);
 assert.equal(x.api.updateSettings({muted:true,volume:.7}),false);assert.equal(x.api.gameSettings.muted,true);assert.equal(detail.volume,.7);assert.equal(x.data.get('campaign-sandbox'),'KEEP-SAVE');
});
test('audio lazy unlock creates master gain graph; volume/mute actually target master gain',()=>{
 const x=setup(),sound=x.api.createGameAudio();assert.equal(x.audio.length,0);x.fire(x.window,'pointerdown');const a=x.audio[0],master=a.gains[0];
 assert.equal(a.state,'running');assert.equal(master.to,a.destination);assert.equal(master.gain.values.at(-1)[1],.45);
 x.api.updateSettings({volume:.2});assert.equal(master.gain.values.at(-1)[1],.2);x.api.updateSettings({muted:true});assert.equal(master.gain.values.at(-1)[1],0);
 sound.setActive(true);sound.play('loot');assert.equal(a.oscillators.length,0);x.api.updateSettings({muted:false});sound.play('loot');assert.equal(a.oscillators.length,1);assert.equal(a.gains[1].to,master);assert.ok(a.oscillators[0].stopped>a.oscillators[0].started);
 a.oscillators[0].onended();assert.ok(a.oscillators[0].disconnected);assert.ok(a.gains[1].disconnected);
});
test('pause, hidden page, zero volume suppress cues; hidden suspends output and no hidden unlock',()=>{
 const x=setup(),sound=x.api.createGameAudio();x.fire(x.window,'keydown');const a=x.audio[0];sound.play('swing');assert.equal(a.oscillators.length,0);
 sound.play('preview');assert.equal(a.oscillators.length,1);sound.setActive(true);a.currentTime+=1;sound.play('step');assert.equal(a.oscillators.length,2);
 x.document.hidden=true;x.fire(x.document,'visibilitychange');assert.equal(a.suspends,1);assert.equal(sound.available(),false);const resumes=a.resumes;
 x.fire(x.window,'pointerdown');assert.equal(a.resumes,resumes);sound.play('preview');assert.equal(a.oscillators.length,2);
 x.document.hidden=false;x.fire(x.window,'pointerdown');assert.equal(sound.available(),true);x.api.updateSettings({volume:0});sound.play('preview');assert.equal(a.oscillators.length,2);
});
test('missing AudioContext is graceful on unlock, preview, settings and visibility',()=>{
 const x=setup({withAudio:false}),sound=x.api.createGameAudio();x.fire(x.window,'pointerdown');sound.play('preview');sound.setActive(true);sound.play('loot');x.api.updateSettings({muted:true});x.document.hidden=true;x.fire(x.document,'visibilitychange');assert.equal(sound.available(),false);
});
console.log(`${n} preference/audio pure tests passed; no browser or real speaker verification`);
