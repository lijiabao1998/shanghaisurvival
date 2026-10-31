// Exact exported request function with disposable event sink; no browser layout claim.
import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/touch-controls.ts',import.meta.url),'utf8');
const line=source.split('\n').find(x=>x.startsWith('export function requestUnarmedToggle'));
assert.ok(line);const events=[];const sandbox={meleeCapabilities:{unarmed:false,shove:false},controlsSuspended:false,unarmedEnabled:false,window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};
vm.createContext(sandbox);vm.runInContext(line.replace('export ',''),sandbox);sandbox.requestUnarmedToggle();assert.equal(events.length,0,'not enabled until real gameplay advertises capability');
sandbox.meleeCapabilities.unarmed=true;sandbox.requestUnarmedToggle();assert.equal(events[0].type,'survivor-unarmed');assert.equal(events[0].detail.enabled,true);assert.equal(sandbox.unarmedEnabled,false,'requests never pretend action completed');
sandbox.unarmedEnabled=true;sandbox.requestUnarmedToggle();assert.equal(events[1].detail.enabled,false);sandbox.controlsSuspended=true;sandbox.requestUnarmedToggle();assert.equal(events.length,2);
assert.match(source,/survivor-unarmed-state/);assert.match(source,/survivor-melee-capabilities/);assert.match(source,/id="survivor-touch-unarmed"[^>]*hidden/);assert.match(source,/id="survivor-touch-shove"[^>]*hidden/);
console.log('PASS actual unarmed request: capability-gated, pause-gated, explicit desired state, no fabricated completion; new action buttons initially hidden');
