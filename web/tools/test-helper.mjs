import assert from 'node:assert/strict';
import { createHelperState, exchangeWithHelper, aidHelper, receiveHelperCare } from '../src/helper.ts';
import { emptyInventory, parseSnapshot, saveSnapshot, loadSnapshot } from '../src/campaign.ts';
let passed=0;
const test=(name,run)=>{run();console.log(`PASS ${name}`);passed++;};
const bag=()=>({...emptyInventory(),food:5,medkit:1});
const save=()=>({version:1,mapId:'block.json',characterId:'guard',elapsed:0,hp:80,stamina:100,battery:50,outbreak:{hydration:50,satiety:50,exposure:20},inventory:bag(),stash:emptyInventory(),ammo:0,hasPistol:false,pistolEquipped:false,position:[1,2],shelterId:'home',inShelter:false,looted:0,kills:0,containers:[],enemies:[],status:'alive',restCount:0});
const json=JSON.stringify;
const unchanged=(objects,action)=>{const before=json(objects);assert.equal(action(),false);assert.equal(json(objects),before);};
test('fresh helpers are independent and have no remembered favors',()=>{const a=createHelperState(),b=createHelperState();assert.deepEqual(a,{helped:false,exchanges:0,exchangeDay:0,healDay:0});a.helped=true;assert.equal(b.helped,false);});
test('two daily exchanges; opening again cannot reset quota',()=>{const h=createHelperState(),i=bag();assert.ok(exchangeWithHelper(h,i,1));assert.ok(exchangeWithHelper(h,i,1));unchanged([h,i],()=>exchangeWithHelper(h,i,1));assert.equal(i.food,3);assert.equal(i.water,2);});
test('new day grants two not cumulative exchanges and rejects past days',()=>{const h=createHelperState(),i=bag();exchangeWithHelper(h,i,1);exchangeWithHelper(h,i,1);assert.ok(exchangeWithHelper(h,i,5));assert.equal(h.exchanges,1);assert.ok(exchangeWithHelper(h,i,5));unchanged([h,i],()=>exchangeWithHelper(h,i,4));unchanged([h,i],()=>exchangeWithHelper(h,i,5));});
test('failed new-day trade leaves old allowance unchanged',()=>{const h={helped:false,exchanges:2,exchangeDay:1,healDay:0},i=emptyInventory();unchanged([h,i],()=>exchangeWithHelper(h,i,2));});
test('one aid spends one kit and rewards exactly two waters once',()=>{const h=createHelperState(),i=bag();assert.ok(aidHelper(h,i));assert.equal(i.medkit,0);assert.equal(i.water,2);assert.equal(h.helped,true);i.medkit=1;unchanged([h,i],()=>aidHelper(h,i));});
test('aid missing kit or overflow does not spend or remember',()=>{for(const i of [emptyInventory(),{...bag(),water:999999}]){const h=createHelperState();unchanged([h,i],()=>aidHelper(h,i));}});
test('care needs favor and injury; full health does not spend daily care',()=>{const h=createHelperState(),p={hp:80,exposure:20};unchanged([h,p],()=>receiveHelperCare(h,p,1));h.helped=true;p.hp=100;unchanged([h,p],()=>receiveHelperCare(h,p,1));p.hp=99;assert.ok(receiveHelperCare(h,p,1));assert.deepEqual(p,{hp:100,exposure:15});assert.equal(h.healDay,1);});
test('care once daily clamps and never revives',()=>{const h={...createHelperState(),helped:true},p={hp:40,exposure:3};assert.ok(receiveHelperCare(h,p,1));assert.deepEqual(p,{hp:55,exposure:0});unchanged([h,p],()=>receiveHelperCare(h,p,1));assert.ok(receiveHelperCare(h,p,2));p.hp=0;unchanged([h,p],()=>receiveHelperCare(h,p,3));});
test('past dates rejected across both interaction types',()=>{const h={helped:true,exchanges:1,exchangeDay:3,healDay:1},i=bag(),p={hp:50,exposure:10};unchanged([h,p],()=>receiveHelperCare(h,p,2));h.healDay=4;unchanged([h,i],()=>exchangeWithHelper(h,i,3));});
test('invalid days, values and overflow leave all transactions atomic',()=>{
 for(const day of [0,-1,.5,NaN,Infinity,1000001]){const h={...createHelperState(),helped:true},i=bag(),p={hp:40,exposure:10};unchanged([h,i],()=>exchangeWithHelper(h,i,day));unchanged([h,p],()=>receiveHelperCare(h,p,day));}
 for(const v of [-1,.5,NaN,Infinity,1000001]){const h=createHelperState(),i={...bag(),food:v};unchanged([h,i],()=>exchangeWithHelper(h,i,1));unchanged([h,i],()=>aidHelper(h,i));}
 for(const p of [{hp:NaN,exposure:0},{hp:50,exposure:Infinity},{hp:-1,exposure:0}]){const h={...createHelperState(),helped:true};unchanged([h,p],()=>receiveHelperCare(h,p,1));}
 const h=createHelperState(),i={...bag(),water:1000000};unchanged([h,i],()=>exchangeWithHelper(h,i,1));
});
test('old version 1 missing helper remains valid',()=>{const s=save();assert.deepEqual(parseSnapshot(json(s),'block.json'),s);});
test('helper schema rejects future days, malformed and impossible state',()=>{
 for(const helper of [null,{}, {...createHelperState(),exchanges:3},{...createHelperState(),exchangeDay:2},{...createHelperState(),healDay:2},{...createHelperState(),exchangeDay:-1},{...createHelperState(),exchanges:1},{...createHelperState(),healDay:1},{...createHelperState(),exchanges:.5}])assert.equal(parseSnapshot(json({...save(),helper}),'block.json'),null);
});
test('roundtrip preserves aid, exchange quota and care without granting again',()=>{const s=save();s.helper=createHelperState();aidHelper(s.helper,s.inventory);exchangeWithHelper(s.helper,s.inventory,1);exchangeWithHelper(s.helper,s.inventory,1);const p={hp:s.hp,exposure:s.outbreak.exposure};receiveHelperCare(s.helper,p,1);s.hp=p.hp;s.outbreak.exposure=p.exposure;
 const m=new Map(),store={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};assert.ok(saveSnapshot(store,'s',s));const r=loadSnapshot(store,'s','block.json');assert.deepEqual(r,s);unchanged([r.helper,r.inventory],()=>aidHelper(r.helper,r.inventory));unchanged([r.helper,r.inventory],()=>exchangeWithHelper(r.helper,r.inventory,1));unchanged([r.helper,p],()=>receiveHelperCare(r.helper,p,1));
});
test('dead snapshot persists memory but care cannot resurrect it',()=>{const s={...save(),status:'dead',hp:0,helper:{helped:true,exchanges:2,exchangeDay:1,healDay:1}};const r=parseSnapshot(json(s),'block.json');assert.deepEqual(r,s);const p={hp:r.hp,exposure:r.outbreak.exposure};unchanged([r.helper,p],()=>receiveHelperCare(r.helper,p,2));});
console.log(`${passed} helper tests passed`);
