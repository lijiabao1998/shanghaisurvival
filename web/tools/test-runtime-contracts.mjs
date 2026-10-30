// Static integration guards: not browser execution or a claim of play-tested UI.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
const t=readFileSync(new URL('../src/touch-controls.ts',import.meta.url),'utf8');
assert.ok(s.includes('#campaign-mode[hidden]{display:none}'),'hidden mode controls cannot resurrect stale save');
assert.ok(s.includes("current=loadCandidateSave()"),'resume reads current snapshot, not boot-time copy');
assert.ok(s.includes("s.status!=='alive'")&&s.includes('if(!isCompatibleSave(current))'),'resume rejects dead save');
assert.ok(s.includes("if(mode!=='sandbox'||!shelter"),'quick mode cannot persist campaign');
assert.ok(s.includes("hp:Math.max(0,z.hp)"),'dead enemy snapshot satisfies schema');
assert.ok(s.includes('inShelter=false;paused=false;'),'leaving shelter unpauses after hidden page');
assert.ok(t.includes('!shelter.hidden'),'touch overlay respects shelter panel');
assert.ok(s.includes("!resume&&savedGame?.status==='alive'&&!confirm"),'new game confirms replacement');


assert.ok(s.includes('delete containers[i].cacheKind;delete containers[i].cacheDay'),'old snapshot restore clears cache fields');
assert.ok(s.includes('installSupplySites();'),'sandbox adds supply sites');
assert.ok(s.includes('cacheDay:c.cacheDay'),'snapshot persists supply day');

assert.ok(s.includes('nx>=bounds.minX-8&&nx<=bounds.maxX+8'),'movement remains within supported playable margin');
assert.ok(s.includes('物資與進度保留'),'old out-of-bounds position repaired, progress not discarded');
assert.ok(s.includes('helper:{...helperState}'),'NPC memory saved with inventory');
assert.ok(s.includes('helperState=s.helper?{...s.helper}:createHelperState()'),'old save gets default only when absent');
assert.ok(s.includes('!helperOpen'),'dialogue pauses game simulation');
assert.ok(t.includes('!helper.hidden'),'touch controls hidden for NPC panel');
assert.ok(s.includes('const saveKey = `shanghai-survivors:systems-v1:${dataUrl}`'),'candidate uses isolated key');
assert.ok(s.includes('const legacySaveKey = `shanghai-survivors:v1:${dataUrl}`'),'legacy key is preserved for read-only import');
assert.ok(s.includes('saveSnapshot(localStorage,saveKey,snapshotCampaign())'),'writes target only candidate snapshot');
assert.equal(/(?:setItem|saveSnapshot)\([^;\n]*legacySaveKey/.test(s),false,'no writes to legacy storage key');
const start=s.indexOf('function loadCandidateSave('),end=s.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start);const fn=stripTypeScriptTypes(s.slice(start,end));
for(const scenario of [{raw:null,expected:'legacy',result:{legacy:true}},{raw:'candidate',expected:'candidate',result:{candidate:true}},{raw:'corrupt',expected:'candidate',result:null}]){
 const reads=[],writes=[];const c=vm.createContext({saveKey:'candidate',legacySaveKey:'legacy',dataUrl:'map',localStorage:{getItem:key=>{reads.push(key);return scenario.raw;},setItem:(...args)=>writes.push(args)},loadSnapshot:(storage,key,map)=>{assert.equal(map,'map');reads.push(key);return scenario.result;}});vm.runInContext(fn,c);assert.equal(c.loadCandidateSave(),scenario.result);assert.deepEqual(reads,['candidate',scenario.expected]);assert.equal(writes.length,0);
}
const denied=vm.createContext({saveKey:'candidate',localStorage:{getItem(){throw new Error('denied');}}});vm.runInContext(fn,denied);assert.equal(denied.loadCandidateSave(),null);
console.log('PASS 21 static contracts plus actual candidate/legacy read-only loading cases (not browser tests)');
