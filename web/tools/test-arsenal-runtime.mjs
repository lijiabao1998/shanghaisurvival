import {TOOL_COMBAT,isMeleeTool} from '../src/melee-tools.ts';
// Executes the actual game functions with minimal state, no browser or rendering.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
import {WEAPONS,WEAPON_IDS,createLegacyArsenal,grantWeapon,grantAmmo,equipWeapon,consumeRound} from '../src/arsenal.ts';
import {createSurvivorSystems,grantTool,equipHand,migrateSurvivorSystems,treatBody} from '../src/survivor-systems.ts';
import {segmentClear} from '../src/combat.ts';
import {applyCacheLoot,emptyInventory} from '../src/campaign.ts';
const source=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);const body=source.indexOf('{',start);let end=body+1,depth=1;while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}assert.equal(depth,0);return stripTypeScriptTypes(source.slice(start,end));}
const classes={add(){},remove(){},toggle(){}};
function runtime(extra={}){const c=vm.createContext({TOOL_COMBAT,isMeleeTool,WEAPONS,WEAPON_IDS,createLegacyArsenal,grantWeapon,grantAmmo,equipWeapon,consumeRound,segmentClear,applyCacheLoot,structuredClone,createSurvivorSystems,grantTool,equipHand,migrateSurvivorSystems,treatBody,
 survivorSystems:createSurvivorSystems(createLegacyArsenal(false,0)),bagOpen:false,inShelter:false,survivorPanel:null,shootHand:'right',
 arsenal:createLegacyArsenal(false,0),hasPistol:false,pistolEquipped:false,ammo:0,action:'none',actionT:0,actionDur:0,actionFired:false,muzzleT:0,camShake:0,px:0,pz:0,py:0,HEAR_GUN:70,muzzle:null,zombies:[],collides:()=>false,forwardXZ:()=>({x:1,z:0}),makeNoise(){},updateBag(){},persistCampaign(){},flashHint(){},damageZombie(){},phase:'play',paused:false,helperOpen:false,inventory:emptyInventory(),...extra});if(!('survivorSystems' in extra))c.survivorSystems=createSurvivorSystems(c.arsenal);for(const name of ['syncArsenal','canSee','fire','useItem'])vm.runInContext(extract(name),c);return c;}
let tests=0;function test(name,fn){fn();tests++;console.log(`PASS ${name}`);}
for(const id of WEAPON_IDS)test(`${id} actual fire uses matching rounds, manifest damage/range/cooldown`,()=>{
 const hits=[],c=runtime({damageZombie:(...a)=>hits.push(a)}),gun=WEAPONS[id];grantWeapon(c.arsenal,id);equipWeapon(c.arsenal,id);c.survivorSystems=createSurvivorSystems(c.arsenal);c.syncArsenal();
 c.zombies=[{x:gun.range+.01,z:0,state:'sleep'}];c.fire();assert.equal(hits.length,0);assert.equal(c.actionDur,gun.cooldown);assert.equal(c.action,'shoot');assert.equal(c.arsenal.rounds[gun.calibre],5);
 c.fire();assert.equal(c.arsenal.rounds[gun.calibre],5,'cooldown blocks second shot');
 c.action='none';const target={x:gun.range-.01,z:0,state:'sleep'};c.zombies=[target];c.fire();assert.equal(hits.length,1);assert.equal(hits[0][0],target);assert.equal(hits[0][1],gun.damage);assert.equal(c.arsenal.rounds[gun.calibre],4);
});
test('actual fire respects wall LOS and does not borrow other calibre',()=>{
 const hits=[],c=runtime({collides:(x,z,r)=>Math.abs(x-3)<r,damageZombie:(...a)=>hits.push(a)});grantWeapon(c.arsenal,'qbz191');equipWeapon(c.arsenal,'qbz191');c.survivorSystems=createSurvivorSystems(c.arsenal);c.zombies=[{x:6,z:0,state:'sleep'}];c.fire();assert.equal(hits.length,0);assert.equal(c.arsenal.rounds['5.8-rifle'],5);
 c.action='none';c.arsenal.rounds['5.8-rifle']=0;c.arsenal.rounds['9mm']=99;c.fire();assert.equal(c.action,'none');assert.equal(c.arsenal.rounds['9mm'],99);
});
test('actual useItem consumes legacy/daily ammo pack once; old pistol token gives nothing',()=>{
 const c=runtime();c.inventory.ammo=1;c.inventory.pistol=3;c.useItem('ammo');c.useItem('ammo');assert.equal(c.arsenal.rounds['9mm'],6);assert.equal(c.inventory.ammo,0);assert.equal(c.arsenal.rounds['5.8-rifle'],0);
 c.useItem('pistol');assert.equal(c.inventory.pistol,3);assert.equal(c.arsenal.owned.length,0);assert.equal(c.arsenal.rounds['9mm'],6);
 c.inventory.ammo=1;c.arsenal.rounds['9mm']=999999;c.useItem('ammo');assert.equal(c.inventory.ammo,1);assert.equal(c.arsenal.rounds['9mm'],999999);
});
function lootRuntime(item,random=.1,cacheKind){const target={x:1,z:0,looted:false,...(cacheKind?{cacheKind,cacheDay:1}:{})},math=Object.create(Math);math.random=()=>random;const c=runtime({Math:math,containers:[target],lootTarget:target,lootProgress:0,lootNoiseTimer:0,LOOT_SECONDS:1.3,HEAR_LOOT:26,keys:new Set(['KeyE']),setRing(){},paintContainer(){},looted:0,CACHE_RULES:{ammo:{name:'cache',seconds:1.3,noise:26}},ITEMS:{water:{label:'water',hint:''}},el:{prompt:{classList:classes},promptText:{textContent:''}},rollLoot:()=>item});vm.runInContext(extract('updateLoot'),c);return {c,target};}
test('ordinary weapon cache grants exactly six once, no inventory pistol bonus',()=>{
 const {c,target}=lootRuntime('pistol',.8);c.updateLoot(1.4);assert.ok(target.looted);assert.equal(c.arsenal.owned[0],'qbz191');assert.equal(c.arsenal.rounds['5.8-rifle'],6);assert.equal(c.inventory.pistol,0);c.updateLoot(1.4);assert.equal(c.arsenal.rounds['5.8-rifle'],6);
});
test('ordinary ammo directly grants chosen calibre; daily ammo remains a one-use 9mm pack',()=>{
 for(const [random,calibre] of [[.1,'9mm'],[.9,'5.8-rifle']]){const {c}=lootRuntime('ammo',random);c.updateLoot(1.4);assert.equal(c.arsenal.rounds[calibre],6);assert.equal(c.inventory.ammo,0);c.useItem('ammo');assert.equal(c.arsenal.rounds[calibre],6);}
 const {c}=lootRuntime('ammo',.9,'ammo');c.updateLoot(1.4);assert.equal(c.inventory.ammo,1);assert.equal(c.arsenal.rounds['9mm'],0);c.useItem('ammo');c.useItem('ammo');assert.equal(c.arsenal.rounds['9mm'],6);
});
test('actual restore migrates old ammo exactly; canonical arsenal overrides compatibility mirrors',()=>{
 const c=runtime({elapsed:0,timeLeft:0,NIGHT_SECONDS:480,hp:100,stamina:100,battery:100,helperState:{},createHelperState:()=>({}),outbreak:{},stash:{},shelter:null,inShelter:false,looted:0,kills:0,restCount:0,containers:[],zombies:[],playerRoot:null,syncEyes(){},updateDaylight(){}});vm.runInContext(extract('restoreCampaign'),c);
 const save={elapsed:0,hp:100,stamina:100,battery:100,outbreak:{},inventory:{...emptyInventory(),pistol:1},stash:emptyInventory(),ammo:7,hasPistol:true,pistolEquipped:true,position:[0,0],inShelter:false,looted:0,kills:0,restCount:0,containers:[],enemies:[]};
 c.restoreCampaign(save);assert.equal(c.arsenal.rounds['9mm'],7);assert.equal(c.arsenal.equipped,'qsz92-9');assert.equal(c.survivorSystems.hands.primary,'qsz92-9');c.useItem('pistol');assert.equal(c.arsenal.rounds['9mm'],7);
 const canonical=createLegacyArsenal(false,0);grantWeapon(canonical,'qbz95-1');equipWeapon(canonical,'qbz95-1');c.restoreCampaign({...save,ammo:999,arsenal:canonical});assert.equal(c.ammo,6);assert.equal(c.arsenal.rounds['9mm'],0);assert.equal(c.arsenal.equipped,'qbz95-1');assert.notEqual(c.arsenal,canonical);assert.equal(c.survivorSystems.hands.primary,'qbz95-1');
 const upgraded=createSurvivorSystems(canonical);upgraded.condition={bleeding:12,pain:25};c.restoreCampaign({...save,arsenal:canonical,survivorSystems:upgraded});assert.equal(c.survivorSystems.condition.bleeding,12);assert.equal(c.survivorSystems.condition.pain,25);assert.notEqual(c.survivorSystems,upgraded);
});
test('actual bag selection equips only owned gun, gives no rounds and updates geometry',()=>{
 const children=[];let visuals=0;
 const c=runtime({document:{createElement:()=>({setAttribute(){},append(){}})},BAG_ROWS:[],ITEM_COLOR:{},el:{bag:{set innerHTML(v){children.length=0;},append:(v)=>children.push(v)},kill:{},loot:{}},kills:0,looted:0,updateWeaponVisual(){visuals++;}});
 grantWeapon(c.arsenal,'qsz92-9');grantWeapon(c.arsenal,'qbz191');vm.runInContext(extract('updateBag'),c);c.updateBag();
 const gun=children.find(b=>(b.textContent??b.innerHTML??'').includes('QBZ-191'));assert.ok(gun);gun.onclick();assert.equal(c.arsenal.equipped,'qbz191');assert.equal(c.ammo,6);assert.equal(c.arsenal.rounds['5.8-rifle'],6);assert.equal(visuals,1);
 const melee=children.find(b=>(b.textContent??b.innerHTML??'').includes('鐵管／近戰'));melee.onclick();assert.equal(c.arsenal.equipped,null);assert.equal(c.arsenal.rounds['5.8-rifle'],6);assert.equal(visuals,2);
});
test('loot category weights and total box count formula unchanged',()=>{
 const m=source.match(/const LOOT_TABLE:[^=]+=(\s*\[[\s\S]*?\n\]);/);assert.ok(m);const table=vm.runInNewContext(m[1]);assert.equal(JSON.stringify(table),JSON.stringify([['water',28],['food',24],['battery',22],['medkit',10],['ammo',10],['pistol',6]]));
 assert.ok(source.includes('containerCount = Math.min(48, Math.max(12, Math.round(12 * area / REF_AREA)))'));assert.ok(source.includes('for (let i = 0; i < containerCount; i++)'));
});
test('actual secondary firearm dispatch consumes once without replacing primary or bypassing pause',()=>{
 const swings=[],c=runtime({startSwing:hand=>swings.push(hand)});grantWeapon(c.arsenal,'qsz92-9');assert.ok(equipHand(c.survivorSystems,c.arsenal,'secondary','qsz92-9'));vm.runInContext(extract('dispatchHandAttack'),c);
 c.dispatchHandAttack('secondary');assert.equal(c.shootHand,'left');assert.equal(c.arsenal.equipped,null);assert.equal(c.survivorSystems.hands.primary,'pipe');assert.equal(c.arsenal.rounds['9mm'],5);assert.equal(c.action,'shoot');c.dispatchHandAttack('secondary');c.dispatchHandAttack('primary');assert.equal(c.arsenal.rounds['9mm'],5);assert.equal(swings.length,0);
 c.action='none';for(const flag of ['paused','bagOpen','inShelter','helperOpen']){c[flag]=true;c.dispatchHandAttack('secondary');assert.equal(c.arsenal.rounds['9mm'],5);c[flag]=false;}c.phase='lose';c.dispatchHandAttack('secondary');assert.equal(c.arsenal.rounds['9mm'],5);c.phase='play';c.dispatchHandAttack('primary');assert.deepEqual(swings,['right']);
 assert.ok(equipHand(c.survivorSystems,c.arsenal,'secondary',null));c.dispatchHandAttack('secondary');assert.equal(c.arsenal.rounds['9mm'],5);assert.equal(c.action,'none');
});
console.log(`${tests} arsenal runtime checks passed (no browser/CI; not a playtest)`);

test('actual backpack exposes owned cleaver and selecting it changes hand without granting ammo',()=>{
 const children=[];let visuals=0;const c=runtime({document:{createElement:()=>({setAttribute(){},append(){}})},BAG_ROWS:[],ITEM_COLOR:{},el:{bag:{set innerHTML(v){children.length=0;},append:v=>children.push(v)},kill:{},loot:{}},kills:0,looted:0,updateWeaponVisual(){visuals++;}});
 assert.ok(grantTool(c.survivorSystems,c.arsenal,'cleaver'));vm.runInContext(extract('updateBag'),c);c.updateBag();const button=children.find(b=>(b.innerHTML??'').includes('菜刀'));assert.ok(button);button.onclick();assert.equal(c.survivorSystems.hands.primary,'cleaver');assert.equal(c.arsenal.equipped,null);assert.equal(c.ammo,0);assert.equal(visuals,1);
});
