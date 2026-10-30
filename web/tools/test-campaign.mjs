import {createSurvivorSystems,equipHand} from '../src/survivor-systems.ts';
import { createLegacyArsenal, grantWeapon, equipWeapon, consumeRound } from '../src/arsenal.ts';
import assert from 'node:assert/strict';
import { emptyInventory, parseSnapshot, saveSnapshot, loadSnapshot, transferItem, restAtShelter, dayPhase, replenishCaches, applyCacheLoot } from '../src/campaign.ts';
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
test('legacy saves without interior loot remain unchanged',()=>{
 const s=fresh(),loaded=parseSnapshot(encode(s),'block.json');
 assert.deepEqual(loaded,s);assert.equal('interiorLoot' in loaded,false);
});
test('interior depletion survives repeated reload without changing ordinary container indices',()=>{
 const s={...fresh(),interiorLoot:{'room-v1:cmab_327821_0:supply':true,'room-v1:cmab_327816_0:supply':false}};
 const store=memory();assert.ok(saveSnapshot(store,'save',s));
 for(let i=0;i<3;i++){
  const loaded=loadSnapshot(store,'save','block.json');
  assert.deepEqual(loaded.interiorLoot,s.interiorLoot);assert.deepEqual(loaded.containers,s.containers);
  assert.ok(saveSnapshot(store,'save',loaded));
 }
});
test('interior loot table allows empty and at most 64 stable boolean entries',()=>{
 for(const interiorLoot of [{},Object.fromEntries(Array.from({length:64},(_,i)=>[`room-v1:building_${i}:supply`,i%2===0]))]){
  const s={...fresh(),interiorLoot};assert.deepEqual(parseSnapshot(encode(s),'block.json'),s);
 }
 const s={...fresh(),interiorLoot:Object.fromEntries(Array.from({length:65},(_,i)=>[`room-v1:building_${i}:supply`,true]))};
 assert.equal(parseSnapshot(encode(s),'block.json'),null);
});
test('malformed interior loot rejects atomically and never overwrites the previous save',()=>{
 const store=memory(),good={...fresh(),interiorLoot:{'room-v1:cmab_327821_0:supply':true}};
 assert.ok(saveSnapshot(store,'save',good));const before=store.getItem('save');
 const invalid=[null,[],true,0,'yes',{'room-v1:cmab_327821_0:supply':1},{'room-v1:cmab_327821_0:supply':'true'},
  {'room-v1:cmab_327821_0:supply':null},{'room-v1::supply':true},{'room-v2:a:supply':true},{'room-v1:a:other':true},
  {'room-v1:a:b:supply':true},{'room-v1:a/supply':true},{'room-v1:a:supply\n':true},
  {[`room-v1:${'a'.repeat(129)}:supply`]:true},JSON.parse('{"__proto__":true}'),{'constructor':true},
  Object.fromEntries(Array.from({length:65},(_,i)=>[`room-v1:b${i}:supply`,true]))];
 for(const interiorLoot of invalid){
  const bad={...fresh(),interiorLoot};assert.equal(parseSnapshot(encode(bad),'block.json'),null);
  assert.equal(saveSnapshot(store,'save',bad),false);assert.equal(store.getItem('save'),before);
 }
 assert.deepEqual(loadSnapshot(store,'save','block.json'),good);
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

test('old version 1 without cache fields still loads unchanged',()=>{
 const old=fresh(); const loaded=parseSnapshot(encode(old),'block.json'); assert.deepEqual(loaded,old); assert.equal('cacheKind' in loaded.containers[0],false);
});
test('cache kind and day must coexist and cannot claim a future or invalid day',()=>{
 for(const fields of [{cacheKind:'water'},{cacheDay:1},{cacheKind:'fake',cacheDay:1},{cacheKind:'food',cacheDay:0},{cacheKind:'food',cacheDay:1.5},{cacheKind:'ammo',cacheDay:2},{cacheKind:'water',cacheDay:1000001},{cacheKind:null,cacheDay:null}]) {
  const s=fresh();Object.assign(s.containers[0],fields);assert.equal(parseSnapshot(encode(s),'block.json'),null);
 }
 const s=fresh();Object.assign(s.containers[0],{cacheKind:'water',cacheDay:1});assert.deepEqual(parseSnapshot(encode(s),'block.json'),s);
});
test('each cache grants its fixed resource once and conserves other items',()=>{
 for(const [id,amount] of [['water',2],['food',2],['ammo',1]]) {
  const inv=emptyInventory(),c={x:1,z:2,looted:false,cacheKind:id,cacheDay:1};
  assert.equal(applyCacheLoot(inv,c),true);assert.equal(inv[id],amount);assert.equal(c.looted,true);
  assert.equal(applyCacheLoot(inv,c),false);assert.equal(inv[id],amount);
 }
});
test('same-day reload cannot repeat a claimed cache',()=>{
 const s=fresh();Object.assign(s.containers[0],{looted:false,cacheKind:'food',cacheDay:1});
 assert.ok(applyCacheLoot(s.inventory,s.containers[0])); const store=memory();assert.ok(saveSnapshot(store,'save',s));
 const loaded=loadSnapshot(store,'save','block.json');assert.equal(replenishCaches(loaded.containers,loaded.elapsed),0);
 assert.equal(applyCacheLoot(loaded.inventory,loaded.containers[0]),false);assert.equal(loaded.inventory.food,2);
});
test('rest crossing midnight refreshes cache once but never ordinary depletion',()=>{
 const s=fresh();s.elapsed=400;Object.assign(s.containers[0],{cacheKind:'water',cacheDay:1});s.containers[1].looted=true;
 assert.ok(restAtShelter(s));assert.equal(dayPhase(s.elapsed).day,2);assert.equal(replenishCaches(s.containers,s.elapsed),1);
 assert.equal(s.containers[0].looted,false);assert.equal(s.containers[0].cacheDay,2);assert.equal(s.containers[1].looted,true);
 assert.equal(replenishCaches(s.containers,s.elapsed),0);
});
test('missed days only refresh once and time rollback does not replenish',()=>{
 const c={x:0,z:0,looted:true,cacheKind:'ammo',cacheDay:1};assert.equal(replenishCaches([c],480+720*10),1);
 assert.equal(c.cacheDay,12);const inv=emptyInventory();assert.ok(applyCacheLoot(inv,c));assert.equal(inv.ammo,1);
 assert.equal(replenishCaches([c],480),0);assert.equal(c.looted,true);assert.equal(replenishCaches([c],480+720*10),0);
});
test('overflow or corrupt inventory never consumes a cache',()=>{
 for(const [id,n] of [['water',999999],['food',1000000],['ammo',1000000],['water',-1],['water',0.5]]) {
  const inv={...emptyInventory(),[id]:n},c={x:0,z:0,looted:false,cacheKind:id,cacheDay:1};const before=encode([inv,c]);
  assert.equal(applyCacheLoot(inv,c),false);assert.equal(encode([inv,c]),before);
 }
 const inv={...emptyInventory(),water:999998},c={x:0,z:0,looted:false,cacheKind:'water',cacheDay:1};assert.ok(applyCacheLoot(inv,c));assert.equal(inv.water,1000000);
});
test('ordinary and malformed caches never mutate through cache APIs',()=>{
 for(const c of [{x:0,z:0,looted:true},{x:0,z:0,looted:false,cacheKind:'water'},{x:0,z:0,looted:false,cacheKind:'food',cacheDay:0}]) {
  const inv=emptyInventory(),before=encode([inv,c]);assert.equal(replenishCaches([c],2000),0);assert.equal(applyCacheLoot(inv,c),false);assert.equal(encode([inv,c]),before);
 }
 const c={x:0,z:0,looted:true,cacheKind:'food',cacheDay:1};for(const elapsed of [-1,NaN,Infinity])assert.equal(replenishCaches([c],elapsed),0);assert.equal(c.looted,true);
});

test('legacy enemies without encounter metadata retain positions health and death',()=>{
 const old=fresh(),before=encode(old);const restored=parseSnapshot(before,'block.json');assert.equal(encode(restored),before);
 assert.equal('encounterVersion' in restored,false);assert.equal('home' in restored.enemies[0],false);assert.equal(restored.enemies[0].state,'dead');
});
test('encounter homes and patrols roundtrip without moving any enemy',()=>{
 const s={...fresh(),encounterVersion:1};s.enemies[0].home=[100,200];s.enemies[0].patrol=[105,205];s.enemies[1].home=[300,400];
 const store=memory();assert.ok(saveSnapshot(store,'save',s));const restored=loadSnapshot(store,'save','block.json');assert.deepEqual(restored,s);
 assert.deepEqual([restored.enemies[0].x,restored.enemies[0].z],[8,9]);assert.equal(restored.enemies[0].hp,0);assert.equal(restored.enemies[0].state,'dead');
 assert.equal(restored.enemies[1].hp,50);assert.equal(restored.enemies[1].state,'chase');assert.deepEqual(restored.inventory,s.inventory);
});
test('home and patrol require exact finite coordinate pairs',()=>{
 for(const field of ['home','patrol']) for(const value of [null,{},[],[1],[1,2,3],['1',2],[NaN,2],[1,Infinity],[10000001,2],[-10000001,2]]){
  const s=fresh();s.enemies[1][field]=value;assert.equal(parseSnapshot(encode(s),'block.json'),null);
 }
 const s=fresh();s.enemies[1].patrol=[-10000000,10000000];assert.ok(parseSnapshot(encode(s),'block.json'));
});
test('unknown encounter versions reject the snapshot',()=>{
 for(const encounterVersion of [null,0,2,'1',{},[],1.5]) assert.equal(parseSnapshot(encode({...fresh(),encounterVersion}),'block.json'),null);
});

test('enemy memory and retreat state roundtrip without changing chase or death',()=>{
 const s=fresh();Object.assign(s.enemies[1],{lastKnown:[25,35],returning:true,retreat:12.5});Object.assign(s.enemies[0],{returning:false,retreat:0});
 const before=encode(s),store=memory();assert.ok(saveSnapshot(store,'save',s));assert.deepEqual(loadSnapshot(store,'save','block.json'),s);assert.equal(encode(s),before);
 assert.equal(parseSnapshot(before,'block.json').enemies[1].state,'chase');
});
test('invalid memory coordinates return flags and retreat timers reject',()=>{
 for(const [field,values] of [['lastKnown',[null,{},[],[1],[1,2,3],[NaN,2],[1,Infinity],['1',2],[10000001,0]]],['returning',[null,0,1,'true',{}]],['retreat',[-1,60.001,NaN,Infinity,null,'2']]])for(const value of values){const s=fresh();s.enemies[1][field]=value;assert.equal(parseSnapshot(encode(s),'block.json'),null);}
 for(const retreat of [0,.01,60]){const s=fresh();s.enemies[1].retreat=retreat;assert.ok(parseSnapshot(encode(s),'block.json'));}
});

test('old snapshot without arsenal preserves legacy pistol rounds and inventory',()=>{
 const s=fresh();s.ammo=0;s.inventory.pistol=2;const restored=parseSnapshot(encode(s),'block.json');assert.deepEqual(restored,s);assert.equal('arsenal' in restored,false);assert.equal(restored.hasPistol,true);assert.equal(restored.inventory.pistol,2);
});
test('arsenal roundtrip preserves independently consumed calibres and equipment',()=>{
 const s=fresh();s.arsenal=createLegacyArsenal(true,13);grantWeapon(s.arsenal,'qbz95-1');grantWeapon(s.arsenal,'qbz191');equipWeapon(s.arsenal,'qbz191');consumeRound(s.arsenal);
 const store=memory();assert.ok(saveSnapshot(store,'save',s));const loaded=loadSnapshot(store,'save','block.json');assert.deepEqual(loaded,s);
 assert.equal(loaded.arsenal.rounds['9mm'],13);assert.equal(loaded.arsenal.rounds['5.8-rifle'],11);assert.equal(loaded.arsenal.equipped,'qbz191');
 equipWeapon(loaded.arsenal,'qsz92-9');consumeRound(loaded.arsenal);assert.equal(loaded.arsenal.rounds['9mm'],12);assert.equal(loaded.arsenal.rounds['5.8-rifle'],11);
});
test('corrupt or unknown arsenal rejects entire snapshot rather than resetting weapons',()=>{
 const good=createLegacyArsenal(true,10);
 for(const arsenal of [null,{},[],{...good,version:2},{...good,owned:['unknown']},{...good,owned:['qsz92-9','qsz92-9']},{...good,equipped:'qbz191'},{...good,rounds:{'9mm':1,'5.8-rifle':-1}},{...good,rounds:{'9mm':Infinity,'5.8-rifle':0}},{...good,rounds:{'9mm':0,'5.8-rifle':0,'other':10}}])assert.equal(parseSnapshot(encode({...fresh(),arsenal}),'block.json'),null);
});
test('rejected arsenal write leaves previous full save untouched',()=>{
 const s=fresh(),store=memory();s.arsenal=createLegacyArsenal(true,7);grantWeapon(s.arsenal,'qbz191');assert.ok(saveSnapshot(store,'save',s));const before=store.getItem('save');
 const corrupt=structuredClone(s);corrupt.arsenal.rounds['5.8-rifle']=NaN;corrupt.inventory.water=99;
 assert.equal(saveSnapshot(store,'save',corrupt),false);assert.equal(store.getItem('save'),before);assert.deepEqual(loadSnapshot(store,'save','block.json'),s);
});
test('death persists arsenal and spent rounds without revival or duplicate awards',()=>{
 const s={...fresh(),status:'dead',hp:0};s.arsenal=createLegacyArsenal(true,0);grantWeapon(s.arsenal,'qbz95-1');equipWeapon(s.arsenal,'qbz95-1');consumeRound(s.arsenal);
 const store=memory();assert.ok(saveSnapshot(store,'save',s));const r=loadSnapshot(store,'save','block.json');assert.deepEqual(r,s);assert.equal(r.status,'dead');assert.equal(r.hp,0);assert.equal(r.arsenal.rounds['5.8-rifle'],5);assert.equal(r.arsenal.rounds['9mm'],0);
});

test('survivor extension is optional for both legacy and current arsenal saves',()=>{
 for(const withArsenal of [false,true]){const s=fresh();if(withArsenal)s.arsenal=createLegacyArsenal(true,7);const before=encode(s),r=parseSnapshot(before,'block.json');assert.equal(encode(r),before);assert.equal('survivorSystems' in r,false);}
});
test('survivor hand and injury state roundtrip keeps supplies enemies and ammunition exact',()=>{
 const s=fresh();s.arsenal=createLegacyArsenal(true,7);s.survivorSystems=createSurvivorSystems(s.arsenal);assert.ok(equipHand(s.survivorSystems,s.arsenal,'secondary','qsz92-9'));s.survivorSystems.condition={bleeding:12,pain:26};s.inventory.water=4;
 const store=memory();assert.ok(saveSnapshot(store,'save',s));const r=loadSnapshot(store,'save','block.json');assert.deepEqual(r,s);assert.equal(r.arsenal.rounds['9mm'],7);assert.equal(r.survivorSystems.hands.primary,'pipe');assert.equal(r.survivorSystems.hands.secondary,'qsz92-9');r.survivorSystems.condition.bleeding=0;assert.equal(s.survivorSystems.condition.bleeding,12);
});
test('invalid survivor extension rejects entire save without silently treating injuries',()=>{
 const s=fresh();s.arsenal=createLegacyArsenal(true,7);const good=createSurvivorSystems(s.arsenal);
 for(const bad of [null,{},[],{...good,version:2},{...good,extra:1},{...good,hands:{primary:'pipe'}},{...good,hands:{primary:'pipe',secondary:'pipe'}},{...good,hands:{primary:'pipe',secondary:'qbz191'}},{...good,condition:{bleeding:-1,pain:0}},{...good,condition:{bleeding:NaN,pain:0}},{...good,condition:{bleeding:0,pain:101}},{...good,condition:{bleeding:0,pain:0,extra:1}}])assert.equal(parseSnapshot(encode({...s,survivorSystems:bad}),'block.json'),null);
});
test('survivor primary must agree with canonical equipped and rifles cannot have an offhand',()=>{
 const s=fresh();s.arsenal=createLegacyArsenal(true,7);grantWeapon(s.arsenal,'qbz191');s.survivorSystems=createSurvivorSystems(s.arsenal);s.survivorSystems.hands.primary='qsz92-9';assert.equal(parseSnapshot(encode(s),'block.json'),null);equipWeapon(s.arsenal,'qsz92-9');assert.ok(parseSnapshot(encode(s),'block.json'));
 s.survivorSystems.hands={primary:'qbz191',secondary:'pipe'};equipWeapon(s.arsenal,'qbz191');assert.equal(parseSnapshot(encode(s),'block.json'),null);s.survivorSystems.hands.secondary=null;assert.ok(parseSnapshot(encode(s),'block.json'));
});
test('legacy pistol equipped mirror and survivor extension use the same migration rule',()=>{
 const s=fresh();s.pistolEquipped=true;const legacy=createLegacyArsenal(true,s.ammo);equipWeapon(legacy,'qsz92-9');s.survivorSystems=createSurvivorSystems(legacy);assert.ok(parseSnapshot(encode(s),'block.json'));
 s.survivorSystems.hands.primary='pipe';assert.equal(parseSnapshot(encode(s),'block.json'),null);
});
test('failed survivor extension write retains the complete previous snapshot',()=>{
 const s=fresh(),store=memory();s.arsenal=createLegacyArsenal(true,7);s.survivorSystems=createSurvivorSystems(s.arsenal);s.survivorSystems.condition.bleeding=20;assert.ok(saveSnapshot(store,'save',s));const before=store.getItem('save');
 const bad=structuredClone(s);bad.survivorSystems.condition.pain=Infinity;bad.inventory.water=99;assert.equal(saveSnapshot(store,'save',bad),false);assert.equal(store.getItem('save'),before);
 const denied={...store,setItem(){throw new Error('quota');}};const good=structuredClone(s);good.survivorSystems.condition.bleeding=0;assert.equal(saveSnapshot(denied,'save',good),false);assert.equal(store.getItem('save'),before);assert.deepEqual(loadSnapshot(store,'save','block.json'),s);
});

console.log(`${passed} campaign tests passed`);
