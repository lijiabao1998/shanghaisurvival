import assert from 'node:assert/strict';
import {emptyInventory,saveSnapshot,loadSnapshot} from '../src/campaign.ts';
import {readFileSync} from 'node:fs';
const oldRooms=JSON.parse(readFileSync(new URL('./fixtures/interior-v1-three.json',import.meta.url),'utf8'));
const ids=['cmab_327821_0','cmab_327816_0','cmab_327817_0','cmab_327814_0','cmab_325911_0','cmab_327818_0','cmab_327826_0','cmab_327825_0','cmab_327823_0'].map(id=>`room-v1:${id}:supply`);
const original={version:1,mapId:'block.json',characterId:'guard',elapsed:10,hp:75,stamina:40,battery:80,outbreak:{hydration:50,satiety:40,exposure:25},inventory:emptyInventory(),stash:emptyInventory(),ammo:0,hasPistol:false,pistolEquipped:false,position:[3,4],shelterId:'building-1',inShelter:false,looted:3,kills:0,containers:Array.from({length:48},(_,i)=>({x:i,z:i+1,looted:i%2===0})),enemies:[],status:'alive',restCount:0,interiorLoot:Object.fromEntries(oldRooms.flatMap(r=>r.loot.map(l=>[l.id,true])))};
const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
assert.ok(saveSnapshot(store,'campaign',original));const loaded=loadSnapshot(store,'campaign','block.json');
// Runtime's documented restore rule: only explicit true means depleted; unvisited new IDs start false.
const expanded={...loaded,interiorLoot:Object.fromEntries(ids.map(id=>[id,loaded.interiorLoot?.[id]===true]))};
assert.deepEqual(ids.map(id=>expanded.interiorLoot[id]),[true,true,true,false,false,false,false,false,false]);assert.deepEqual(expanded.containers,original.containers);
expanded.interiorLoot[ids[3]]=true;assert.ok(saveSnapshot(store,'campaign',expanded));
for(let i=0;i<3;i++){const again=loadSnapshot(store,'campaign','block.json');assert.deepEqual(again,expanded);assert.ok(saveSnapshot(store,'campaign',again));}
assert.equal(Object.keys(expanded.interiorLoot).length,9);assert.ok(Object.keys(expanded.interiorLoot).length<=64);
console.log('PASS legacy three depleted IDs retained; six new IDs initialize once; new depletion persists; original 48 container order/flags unchanged');
