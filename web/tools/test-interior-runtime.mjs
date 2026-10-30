// Execute the actual interaction function with a tiny DOM/world adapter; not a browser screenshot test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
const js=(await transform(source,{loader:'ts',target:'es2022'})).code;
function fn(name){const start=js.indexOf(`function ${name}(`);assert.ok(start>=0);let p=js.indexOf('{',start),depth=1,end=p+1;for(;depth;end++){if(js[end]==='{')depth++;if(js[end]==='}')depth--;}return js.slice(start,end);}
const noop=()=>{};
const ordinary=[{x:100,z:100,looted:true},{x:110,z:110,looted:false}];
const room={x:0,z:0,looted:false,roomId:'room-v1:cmab_327821_0:supply',roomItem:'water',roomLabel:'住家'};
const ctx={containers:[...ordinary,room],px:0,pz:0,lootTarget:null,lootProgress:0,action:'none',actionT:0,actionDur:0,lootNoiseTimer:0,looted:0,
 inventory:{water:0},keys:new Set(),canSee:()=>true,el:{prompt:{classList:{add:noop,remove:noop}},promptText:{}},CACHE_RULES:{},LOOT_SECONDS:2,HEAR_LOOT:10,
 setRing:noop,makeNoise:noop,flashHint:noop,paintContainer:noop,updateBag:noop,persistCalls:0,persistCampaign(){ctx.persistCalls++},ITEMS:{water:{label:'水'}},
 phase:'play',paused:false,bagOpen:false,inShelter:false,helperOpen:false,mode:'sandbox',shelter:null,block:{spawn:[100,100]}};
vm.createContext(ctx);vm.runInContext(fn('updateLoot')+'\n'+fn('contextualInteract'),ctx);
ctx.updateLoot(3);assert.equal(room.looted,false,'proximity alone never loots');assert.equal(ctx.contextualInteract(),true,'E targets room loot, not shelter teleport');
ctx.keys.add('KeyE');ctx.updateLoot(1);assert.equal(room.looted,false,'requires hold duration');ctx.updateLoot(1.1);
assert.equal(room.looted,true);assert.equal(ctx.inventory.water,1);assert.equal(ctx.persistCalls,1);
ctx.updateLoot(10);assert.equal(ctx.inventory.water,1,'held E cannot claim depleted room twice');assert.equal(ctx.persistCalls,1);
room.looted=false;ctx.inventory.water=999;ctx.updateLoot(3);assert.equal(room.looted,false,'full bag retains supply');assert.equal(ctx.inventory.water,999);
ctx.inventory.water=0;ctx.canSee=()=>false;ctx.updateLoot(3);assert.equal(room.looted,false,'wall-blocked target cannot be looted');assert.equal(ctx.lootTarget,null);
ctx.canSee=()=>true;ctx.px=3;ctx.updateLoot(3);assert.equal(room.looted,false,'out of range cannot loot');
for(const flag of ['paused','bagOpen','inShelter','helperOpen']){ctx[flag]=true;assert.equal(ctx.contextualInteract(),false);ctx[flag]=false;}
// Serialization/restore filters are checked against the actual integration, not a duplicate model.
const compact=source.replace(/\s+/g,'');
assert.ok(compact.includes('interiorLoot:Object.fromEntries(containers.filter(c=>c.roomId).map(c=>[c.roomId!,c.looted]))'));
assert.ok(compact.includes('containers:containers.filter(c=>!c.roomId).map('),'ordinary save order excludes append-only rooms');
assert.ok(compact.includes('s.containers.length!==containers.filter(c=>!c.roomId).length'),'legacy exact count stays authoritative');
assert.ok(compact.includes('c.looted=s.interiorLoot?.[c.roomId!]===true'),'restore only true flags, missing legacy field starts unlooted');
assert.ok(compact.includes('constordered=containers.filter(c=>!c.roomId).sort('),'indoor supply never becomes daily cache');
assert.ok(compact.includes('baseWallCollision(x,z,r)||interiorRooms.some(room=>roomFurnitureCollision(room,x,z,r))'),'walls retained alongside furniture');
assert.ok(compact.includes('roomId:loot.id'),'save IDs include supply suffix');
const basicIndex=source.indexOf('containers.push({ x: 0, z: 0, mesh, looted: false })');
assert.ok(basicIndex>=0&&basicIndex<source.indexOf('roomId:loot.id'),'rooms appended after ordinary indices');
console.log('PASS actual updateLoot: hold E, one claim, immediate persistence, full bag retention, range/LOS; context guards and save/collision integration structure');
