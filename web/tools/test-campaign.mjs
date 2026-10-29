import assert from 'node:assert/strict';
import { emptyInventory, parseSnapshot, saveSnapshot, loadSnapshot, transferItem, restAtShelter, dayPhase } from '../src/campaign.ts';
let passed = 0;
const test = (name, run) => { run(); console.log(`PASS ${name}`); passed++; };
const fresh = () => ({ version:1, mapId:'block.json', characterId:'guard', elapsed:10, hp:75, stamina:40, battery:80,
  outbreak:{hydration:50,satiety:40,exposure:25}, inventory:emptyInventory(), stash:{...emptyInventory(),water:2,food:2},
  ammo:6, hasPistol:true,pistolEquipped:false,position:[3,4],shelterId:'building-1',inShelter:true,looted:1,kills:1,
  containers:[{x:4,z:5,looted:true},{x:6,z:7,looted:false}],
  enemies:[{x:8,z:9,hp:0,state:'dead',faction:'infected'},{x:10,z:11,hp:50,state:'chase',faction:'raider'}],status:'alive',restCount:0 });
const encode = s => JSON.stringify(s);
const memory = () => { const data = new Map(); return { getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v) }; };
test('empty inventories are independent',()=>{ const a=emptyInventory(),b=emptyInventory(); a.water++; assert.equal(b.water,0); });
test('full roundtrip preserves looted containers, killed enemies and all resources',()=>{
  const s=fresh(), store=memory(); assert.ok(saveSnapshot(store,'save',s)); const restored=loadSnapshot(store,'save','block.json');
  assert.deepEqual(restored,s); restored.stash.water++; assert.equal(s.stash.water,2);
});
test('missing save starts without state',()=>assert.equal(loadSnapshot(memory(),'save','block.json'),null));
test('malformed, null, empty and old/unknown versions rejected',()=>{
  for(const raw of ['', '{', 'null', '[]', '{}', encode({...fresh(),version:0}),encode({...fresh(),version:2})]) assert.equal(parseSnapshot(raw,'block.json'),null);
});
test('foreign map rejected',()=>assert.equal(parseSnapshot(encode(fresh()),'another-map'),null));
test('invalid resource counts and meters rejected',()=>{
  for(const bad of [-1,0.5,1e12,null,'4']){const s=fresh();s.inventory.water=bad;assert.equal(parseSnapshot(encode(s),'block.json'),null);}
  for(const bad of [-1,101,null,'50']){const s=fresh();s.hp=bad;assert.equal(parseSnapshot(encode(s),'block.json'),null);}
  for(const n of [NaN,Infinity]){const s=fresh();s.position[0]=n;assert.equal(parseSnapshot(encode(s),'block.json'),null);}
});
test('invalid structure and excessive arrays rejected',()=>{
  for(const patch of [{position:[1]},{containers:Array(1001).fill({x:1,z:2,looted:false})},{enemies:[{x:0,z:0,hp:100,state:'fake',faction:'infected'}]},{hasPistol:false,pistolEquipped:true},{status:'dead'},{status:'alive',hp:0}]) assert.equal(parseSnapshot(encode({...fresh(),...patch}),'block.json'),null);
});
test('dead snapshot cannot resurrect by load',()=>{
 const s={...fresh(),status:'dead',hp:0};assert.equal(parseSnapshot(encode(s),'block.json').status,'dead');
});
test('failed storage writes preserve previous save and report false',()=>{
 const store=memory(); const s=fresh();saveSnapshot(store,'save',s);
 const failure={...store,setItem(){throw new Error('quota');}}; s.stash.water=1;
 assert.equal(saveSnapshot(failure,'save',s),false);assert.equal(loadSnapshot(store,'save','block.json').stash.water,2);
});
test('storage read denial and invalid writes are safe',()=>{
 assert.equal(loadSnapshot({getItem(){throw new Error('denied');}},'save','block.json'),null);
 let called=false;assert.equal(saveSnapshot({setItem(){called=true;}},'save',{...fresh(),hp:NaN}),false);assert.equal(called,false);
});
test('repeated stash transfers conserve resources with no overdraft',()=>{
 const a={...emptyInventory(),water:3},b=emptyInventory();for(let i=0;i<10;i++)transferItem(a,b,'water');assert.equal(a.water,0);assert.equal(b.water,3);
 for(let i=0;i<10;i++)transferItem(b,a,'water');assert.equal(a.water,3);assert.equal(b.water,0);
 assert.equal(transferItem(a,a,'water'),false);assert.equal(a.water,3);
});
test('invalid transfer never mutates either side',()=>{
 const a={...emptyInventory(),food:0.5},b=emptyInventory();const before=encode([a,b]);assert.equal(transferItem(a,b,'food'),false);assert.equal(encode([a,b]),before);
});
test('rest charges stash and advances time once, clamping recovery',()=>{
 const s=fresh();assert.ok(restAtShelter(s));assert.equal(s.stash.water,1);assert.equal(s.stash.food,1);assert.equal(s.elapsed,130);assert.equal(s.restCount,1);
 assert.equal(s.hp,100);assert.equal(s.stamina,100);assert.deepEqual(s.outbreak,{hydration:75,satiety:60,exposure:5});
});
test('insufficient supplies and dead character cannot rest; failure atomic',()=>{
 for(const patch of [{stash:{...emptyInventory(),water:1}},{hp:0}]){const s={...fresh(),...patch};const before=encode(s);assert.equal(restAtShelter(s),false);assert.equal(encode(s),before);}
});
test('resource mutations persist without duplication across reload',()=>{
 const store=memory(),s=fresh();transferItem(s.stash,s.inventory,'water');restAtShelter(s);saveSnapshot(store,'save',s);
 const loaded=loadSnapshot(store,'save','block.json');assert.equal(loaded.stash.water,0);assert.equal(loaded.inventory.water,1);assert.equal(loaded.containers[0].looted,true);assert.equal(loaded.enemies[0].state,'dead');
 assert.equal(restAtShelter(loaded),false);
});
test('day phase starts at 08 and changes at midnight without resetting elapsed',()=>{
 assert.equal(dayPhase(0).hour,8);assert.equal(dayPhase(0).day,1);assert.equal(dayPhase(480).hour,0);assert.equal(dayPhase(480).day,2);
 assert.equal(dayPhase(720).hour,8);assert.equal(dayPhase(720).day,2);assert.equal(dayPhase(300).daylight,0);assert.ok(dayPhase(120).daylight>.999);assert.deepEqual(dayPhase(NaN),dayPhase(0));
});
console.log(`${passed} campaign tests passed`);
