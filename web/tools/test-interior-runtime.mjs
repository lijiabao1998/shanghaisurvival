// Execute the actual interaction function with a tiny DOM/world adapter; not a browser screenshot test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform,build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {claimRoomExtra} from './src/room-extras.ts';export {claimRoomTool} from './src/room-tools.ts';export {createSurvivorSystems} from './src/survivor-systems.ts';export {createLegacyArsenal} from './src/arsenal.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {claimRoomExtra,claimRoomTool,createSurvivorSystems,createLegacyArsenal}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
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
assert.ok(compact.includes('interiorLoot:Object.fromEntries(containers.filter(c=>c.roomId&&c.roomEnabled!==false).map(c=>[c.roomId!,c.looted]))'));
assert.ok(compact.includes('containers:containers.filter(c=>!c.roomId).map('),'ordinary save order excludes append-only rooms');
assert.ok(compact.includes('s.containers.length!==containers.filter(c=>!c.roomId).length'),'legacy exact count stays authoritative');
assert.ok(compact.includes('c.looted=s.interiorLoot?.[c.roomId!]===true'),'restore only true flags, missing legacy field starts unlooted');
assert.ok(compact.includes('constordered=containers.filter(c=>!c.roomId).sort('),'indoor supply never becomes daily cache');
assert.ok(compact.includes('baseWallCollision(x,z,r)||(densityEnabledForLayout(worldLayout)&&densityCollision(x,z,r))||interiorRooms.some(room=>roomFurnitureCollision(room,x,z,r))'),'walls retained alongside furniture');
assert.ok(compact.includes('roomId:loot.id'),'save IDs include supply suffix');
const basicIndex=source.indexOf('containers.push({ x: 0, z: 0, mesh, looted: false })');
assert.ok(basicIndex>=0&&basicIndex<source.indexOf('roomId:loot.id'),'rooms appended after ordinary indices');
console.log('PASS actual updateLoot: hold E, one claim, immediate persistence, full bag retention, range/LOS; context guards and save/collision integration structure');

// Extra pickup uses the same actual held-interact/visibility/persistence path.
ctx.claimRoomExtra=claimRoomExtra;ctx.inventory={water:0,food:0,medkit:0,battery:0,ammo:0,pistol:0};ctx.ITEMS.ammo={label:'9毫米補給包'};ctx.px=0;ctx.keys.add('KeyE');ctx.canSee=()=>true;
const extra={id:'room-extra-v1:cmab_327817_0:ammo',buildingId:'cmab_327817_0',position:[0,0],item:'ammo',amount:1};
room.roomExtra=extra;room.roomId=extra.id;room.roomItem='ammo';room.looted=false;ctx.lootTarget=null;ctx.lootProgress=0;
ctx.updateLoot(3);assert.equal(ctx.inventory.ammo,1);assert.equal(room.looted,true);const saves=ctx.persistCalls;ctx.updateLoot(3);assert.equal(ctx.inventory.ammo,1);assert.equal(ctx.persistCalls,saves);
room.looted=false;ctx.inventory.ammo=999;ctx.updateLoot(3);assert.equal(room.looted,false);assert.equal(ctx.inventory.ammo,999);
console.log('PASS actual extra-ammo interaction grants one usable inventory pack, persists once, and retains full-capacity loot');

ctx.claimRoomTool=claimRoomTool;ctx.arsenal=createLegacyArsenal(false,0);ctx.survivorSystems=createSurvivorSystems(ctx.arsenal);ctx.TOOL_COMBAT={cleaver:{name:'菜刀'}};
room.roomTool={id:'room-tool-v1:cmab_327821_0:cleaver',buildingId:'cmab_327821_0',tool:'cleaver',position:[0,0]};room.roomId=room.roomTool.id;delete room.roomExtra;room.looted=false;ctx.lootTarget=null;ctx.lootProgress=0;
ctx.updateLoot(3);assert.equal(room.looted,true);assert.deepEqual(ctx.survivorSystems.ownedTools,['cleaver']);const toolSaves=ctx.persistCalls;ctx.updateLoot(3);assert.equal(ctx.persistCalls,toolSaves);assert.equal(ctx.survivorSystems.ownedTools.length,1);
console.log('PASS actual held tool pickup grants ownership, depletes object and persists once');
