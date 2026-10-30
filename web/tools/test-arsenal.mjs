import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_IDS, createLegacyArsenal, validArsenal, grantWeapon, grantAmmo, equipWeapon, consumeRound } from '../src/arsenal.ts';
import { createSurvivorSystems, equipHand, carriedWeight, validSurvivorSystems } from '../src/survivor-systems.ts';
let passed=0;const test=(name,run)=>{run();console.log(`PASS ${name}`);passed++;};const json=JSON.stringify;
const unchanged=(s,run)=>{const before=json(s);assert.equal(run(),false);assert.equal(json(s),before);};
test('legacy migration preserves rounds exactly, including an empty pistol',()=>{for(const ammo of [0,1,6,1000000]){const a=createLegacyArsenal(true,ammo);assert.ok(validArsenal(a));assert.deepEqual(a.owned,['qsz92-9']);assert.equal(a.rounds['9mm'],ammo);assert.equal(a.rounds['5.8-rifle'],0);assert.equal(a.equipped,null);}assert.equal(createLegacyArsenal(false,7).rounds['9mm'],7);});
test('legacy invalid counters never create an arsenal',()=>{for(const ammo of [-1,.5,NaN,Infinity,1000001,'6',null])assert.equal(createLegacyArsenal(true,ammo),null);assert.equal(createLegacyArsenal('yes',6),null);});
test('manifest has nine distinct usable weapons with fictional balance',()=>{assert.equal(WEAPON_IDS.length,9);for(const id of WEAPON_IDS){assert.equal(WEAPONS[id].id,id);assert.ok(WEAPONS[id].cooldown>0);assert.ok(WEAPONS[id].damage>0);assert.ok(WEAPONS[id].range>0);}assert.equal(WEAPONS['qsz92-9'].calibre,'9mm');assert.equal(WEAPONS.qbz191.calibre,'5.8-rifle');});
test('weapon caches grant matching six rounds without duplicate ownership',()=>{const a=createLegacyArsenal(false,0);for(const id of WEAPON_IDS){assert.ok(grantWeapon(a,id));assert.ok(grantWeapon(a,id));}assert.deepEqual(a.owned,WEAPON_IDS);assert.equal(a.rounds['9mm'],48);assert.equal(a.rounds['5.8-rifle'],60);assert.equal(a.equipped,null);});
test('reloading JSON preserves every weapon and exact rounds',()=>{const a=createLegacyArsenal(true,3);grantWeapon(a,'qbz191');equipWeapon(a,'qbz191');consumeRound(a);const r=JSON.parse(json(a));assert.ok(validArsenal(r));assert.deepEqual(r,a);assert.equal(r.rounds['5.8-rifle'],5);});
test('each weapon consumes only its calibre and shares rifle reserve',()=>{const a=createLegacyArsenal(true,3);grantWeapon(a,'qbz95-1');grantWeapon(a,'qbz191');equipWeapon(a,'qsz92-9');assert.ok(consumeRound(a));assert.equal(a.rounds['9mm'],2);assert.equal(a.rounds['5.8-rifle'],12);equipWeapon(a,'qbz95-1');consumeRound(a);equipWeapon(a,'qbz191');consumeRound(a);assert.equal(a.rounds['5.8-rifle'],10);assert.equal(a.rounds['9mm'],2);});
test('empty calibre does not fall back to another ammo type',()=>{const a=createLegacyArsenal(true,0);grantWeapon(a,'qbz191');equipWeapon(a,'qsz92-9');unchanged(a,()=>consumeRound(a));assert.equal(a.rounds['5.8-rifle'],6);});
test('unowned and unknown weapon cannot equip; melee does not consume',()=>{const a=createLegacyArsenal(true,6);unchanged(a,()=>equipWeapon(a,'qbz191'));unchanged(a,()=>equipWeapon(a,'fake'));assert.ok(equipWeapon(a,'qsz92-9'));assert.ok(equipWeapon(a,null));unchanged(a,()=>consumeRound(a));});
test('ammunition grant cannot cross calibre or accept invalid amounts',()=>{const a=createLegacyArsenal(false,0);assert.ok(grantAmmo(a,'5.8-rifle',6));assert.equal(a.rounds['9mm'],0);for(const calibre of ['5.8','pistol','fake',null])unchanged(a,()=>grantAmmo(a,calibre,6));for(const amount of [0,-1,.5,NaN,Infinity,1000001])unchanged(a,()=>grantAmmo(a,'9mm',amount));});
test('overflow is atomic, including new weapon ownership',()=>{const a=createLegacyArsenal(false,999995);unchanged(a,()=>grantWeapon(a,'qsz92-9'));unchanged(a,()=>grantAmmo(a,'9mm',6));assert.ok(grantAmmo(a,'9mm',5));assert.equal(a.rounds['9mm'],1000000);assert.deepEqual(a.owned,[]);});
test('strict schema rejects duplicates, unknown versions, fields and counters',()=>{const a=createLegacyArsenal(true,0);for(const bad of [{...a,version:2},{...a,extra:1},{...a,owned:['qsz92-9','qsz92-9']},{...a,owned:['fake']},{...a,equipped:'qbz191'},{...a,rounds:{'9mm':0}},{...a,rounds:{'9mm':0,'5.8-rifle':0,extra:1}},null,[],{}])assert.equal(validArsenal(bad),false);for(const n of [-1,.1,NaN,Infinity,1000001,null,'0'])assert.equal(validArsenal({...a,rounds:{'9mm':n,'5.8-rifle':0}}),false);});
test('corrupt state never mutates through action APIs',()=>{const a={...createLegacyArsenal(true,6),owned:['fake']};unchanged(a,()=>grantAmmo(a,'9mm',6));unchanged(a,()=>grantWeapon(a,'qbz191'));unchanged(a,()=>equipWeapon(a,null));unchanged(a,()=>consumeRound(a));});
test('all new weapons retain strict save roundtrip, calibre consumption and category rules',()=>{
 const a=createLegacyArsenal(false,0);for(const id of WEAPON_IDS){assert.ok(grantWeapon(a,id));assert.ok(equipWeapon(a,id));const old={...a.rounds};assert.ok(consumeRound(a));assert.equal(a.rounds[WEAPONS[id].calibre],old[WEAPONS[id].calibre]-1);assert.ok(validArsenal(JSON.parse(json(a))));}
 assert.equal(new Set(WEAPON_IDS.map(id=>JSON.stringify([WEAPONS[id].damage,WEAPONS[id].cooldown,WEAPONS[id].range]))).size,9);
});
test('every firearm has finite carrying weight and correct two-hand rules',()=>{
 const inventory={water:0,food:0,medkit:0,battery:0,ammo:0,pistol:0};
 for(const id of WEAPON_IDS){
  const a=createLegacyArsenal(false,0);grantWeapon(a,id);const state=createSurvivorSystems(a);
  assert.ok(Number.isFinite(carriedWeight(inventory,a)));assert.ok(carriedWeight(inventory,a)>1.2);
  const before=json({state,a});const isRifle=WEAPONS[id].category==='rifle';
  assert.equal(equipHand(state,a,'secondary',id),!isRifle);
  if(isRifle)assert.equal(json({state,a}),before);
  assert.ok(equipHand(state,a,'primary',id));assert.ok(validSurvivorSystems(state,a));
  if(isRifle){assert.equal(state.hands.secondary,null);assert.equal(equipHand(state,a,'secondary','pipe'),false);}
 }
});
console.log(`${passed} arsenal tests passed`);
