import assert from 'node:assert/strict';
import {emptyInventory, saveSnapshot, loadSnapshot} from '../src/campaign.ts';
import {createLegacyArsenal, grantWeapon} from '../src/arsenal.ts';
import {createSurvivorSystems, migrateSurvivorSystems, validSurvivorSystems, equipHand, primaryGun, grantTool, carriedWeight, TOOL_WEIGHT} from '../src/survivor-systems.ts';
const inv={water:0,food:0,medkit:0,battery:0,ammo:0,pistol:0};
const setup=()=>{const a=createLegacyArsenal(true,7); return [a,createSurvivorSystems(a)];};
const rejects=(values,fn)=>{const before=JSON.stringify(values);assert.equal(fn(),false);assert.equal(JSON.stringify(values),before);};
let tests=0;const test=(name,fn)=>{fn();tests++;console.log(`PASS ${name}`);};
test('old snapshot retains exact three keys and grants no tools',()=>{
 const [a,s]=setup(),old=JSON.parse(JSON.stringify(s));assert.deepEqual(Object.keys(old),['version','hands','condition']);
 assert.deepEqual(migrateSurvivorSystems(old,a),old);assert.deepEqual(migrateSurvivorSystems(undefined,a),old);
 assert.equal(carriedWeight(inv,a,s),carriedWeight(inv,a));for(const t of ['cleaver','wrench'])rejects([s,a],()=>equipHand(s,a,'primary',t));
});
test('grant is atomic, unique, never auto-equips or grants rounds',()=>{
 const [a,s]=setup(),before=structuredClone(a);assert.ok(grantTool(s,a,'cleaver'));assert.deepEqual(s.ownedTools,['cleaver']);
 assert.deepEqual(s.hands,{primary:'pipe',secondary:null});assert.deepEqual(a,before);
 rejects([s,a],()=>grantTool(s,a,'cleaver'));rejects([s,a],()=>grantTool(s,a,'knife'));
 assert.ok(grantTool(s,a,'wrench'));assert.deepEqual(s.ownedTools,['cleaver','wrench']);assert.deepEqual(a,before);
});
test('new fourth field strictly rejects unknown, duplicate and corrupt data',()=>{
 const [a,s]=setup();for(const v of [null,undefined,{},'cleaver',['pipe'],['cleaver','cleaver'],['cleaver','wrench','knife'],[1]]){
 const bad={...s,ownedTools:v};assert.equal(validSurvivorSystems(bad,a),false);assert.equal(migrateSurvivorSystems(bad,a),null);
 rejects([bad,a],()=>grantTool(bad,a,'cleaver'));assert.equal(carriedWeight(inv,a,bad),null);
 }
 assert.ok(validSurvivorSystems({...s,ownedTools:[]},a));assert.equal(validSurvivorSystems({...s,ownedTools:[],extra:true},a),false);
 const corrupt={...a,rounds:{'9mm':-1,'5.8-rifle':0}};rejects([s,corrupt],()=>grantTool(s,corrupt,'wrench'));
});
test('tools swap hands without duplicate items and primaryGun recognizes guns only',()=>{
 const [a,s]=setup();grantTool(s,a,'cleaver');grantTool(s,a,'wrench');
 assert.ok(equipHand(s,a,'primary','cleaver'));assert.equal(primaryGun(s),null);assert.equal(a.equipped,null);
 assert.ok(equipHand(s,a,'secondary','wrench'));assert.ok(equipHand(s,a,'primary','wrench'));
 assert.deepEqual(s.hands,{primary:'wrench',secondary:'cleaver'});
 assert.ok(equipHand(s,a,'secondary','wrench'));assert.deepEqual(s.hands,{primary:'cleaver',secondary:'wrench'});
 assert.ok(equipHand(s,a,'primary','qsz92-9'));assert.equal(primaryGun(s),'qsz92-9');assert.equal(a.equipped,'qsz92-9');
 assert.ok(equipHand(s,a,'secondary','qsz92-9'));assert.deepEqual(s.hands,{primary:'wrench',secondary:'qsz92-9'});
 assert.equal(primaryGun(s),null);assert.equal(a.equipped,null);assert.equal(a.rounds['9mm'],7);
 assert.equal(validSurvivorSystems({...s,hands:{primary:'wrench',secondary:'wrench'}},a),false);
 rejects([s,a],()=>equipHand(s,a,'primary',null));
});
test('rifles retain two-handed restrictions after tool ownership',()=>{
 const [a,s]=setup();grantTool(s,a,'cleaver');grantWeapon(a,'qbz191');equipHand(s,a,'secondary','cleaver');
 assert.ok(equipHand(s,a,'primary','qbz191'));assert.equal(s.hands.secondary,null);assert.equal(primaryGun(s),'qbz191');
 rejects([s,a],()=>equipHand(s,a,'secondary','cleaver'));assert.ok(equipHand(s,a,'primary','cleaver'));
 rejects([s,a],()=>equipHand(s,a,'secondary','qbz191'));
 assert.equal(validSurvivorSystems(s,{...a,equipped:'qsz92-9'}),false);
});
test('JSON reload preserves tool ownership/equipment and counts each carried tool once',()=>{
 const [a,s]=setup(),base=carriedWeight(inv,a);grantTool(s,a,'cleaver');grantTool(s,a,'wrench');
 equipHand(s,a,'primary','cleaver');equipHand(s,a,'secondary','wrench');
 const loaded=JSON.parse(JSON.stringify({a,s}));assert.ok(validSurvivorSystems(loaded.s,loaded.a));
 assert.deepEqual(migrateSurvivorSystems(loaded.s,loaded.a),s);
 rejects([loaded.s,loaded.a],()=>grantTool(loaded.s,loaded.a,'cleaver'));
 assert.equal(carriedWeight(inv,a,s),Math.round((base+TOOL_WEIGHT.cleaver+TOOL_WEIGHT.wrench)*1000)/1000);
 equipHand(s,a,'primary','pipe');equipHand(s,a,'secondary',null);
 assert.equal(carriedWeight(inv,a,s),Math.round((base+1.5)*1000)/1000);assert.equal(carriedWeight(inv,a),base);
});
test('campaign persistence accepts old and tool states, rejects corruption without overwriting',()=>{
 const [a,s]=setup();const snap={version:1,mapId:'block.json',characterId:'guard',elapsed:10,hp:75,stamina:40,battery:80,outbreak:{hydration:50,satiety:40,exposure:25},inventory:emptyInventory(),stash:emptyInventory(),ammo:7,hasPistol:true,pistolEquipped:false,position:[3,4],shelterId:'building-1',inShelter:false,looted:0,kills:0,containers:[],enemies:[],status:'alive',restCount:0,arsenal:a,survivorSystems:s};
 const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 assert.ok(saveSnapshot(store,'tools',snap));assert.deepEqual(loadSnapshot(store,'tools','block.json'),snap);
 assert.equal(Object.hasOwn(loadSnapshot(store,'tools','block.json').survivorSystems,'ownedTools'),false);
 grantTool(s,a,'cleaver');equipHand(s,a,'primary','cleaver');assert.ok(saveSnapshot(store,'tools',snap));
 const reload=loadSnapshot(store,'tools','block.json');assert.deepEqual(reload,snap);assert.equal(primaryGun(reload.survivorSystems),null);
 const prior=data.get('tools'),bad=structuredClone(snap);bad.survivorSystems.ownedTools.push('cleaver');
 assert.equal(saveSnapshot(store,'tools',bad),false);assert.equal(data.get('tools'),prior);
});
console.log(`${tests} tool ownership/equipment tests passed (pure logic, not browser combat validation)`);
