// Static integration guards: not browser execution or a claim of play-tested UI.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
const t=readFileSync(new URL('../src/touch-controls.ts',import.meta.url),'utf8');
assert.ok(s.includes('#campaign-mode[hidden]{display:none}'),'hidden mode controls cannot resurrect stale save');
assert.ok(s.includes("current=loadSnapshot(localStorage,saveKey,dataUrl)"),'resume reads current snapshot, not boot-time copy');
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
console.log('PASS 13 static runtime persistence/input contracts (not browser tests)');
