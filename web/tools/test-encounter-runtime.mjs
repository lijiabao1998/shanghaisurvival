// Execute the actual isolated runtime steering/wake functions without a DOM,
// renderer or browser. This is not a gameplay/visual acceptance test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createLegacyArsenal, equipWeapon } from '../src/arsenal.ts';
import { migrateSurvivorSystems } from '../src/survivor-systems.ts';
import { sweepMove } from '../src/combat.ts';
import { decideEncounterBehavior } from '../src/encounter-behavior.ts';
const source = readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8');
function extract(name) {
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0, `missing runtime function ${name}`);
  const body=source.indexOf('{', start);
  let depth=1, end=body+1;
  while(depth && end<source.length) { if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++; }
  assert.equal(depth,0);
  return stripTypeScriptTypes(source.slice(start,end));
}
function enemy(overrides={}) {
  return {x:0,z:0,path:[],pathTimer:0,phase:0,walk:0,state:'sleep',retreat:0,returning:false,mesh:{rotation:{y:0}},...overrides};
}
function runtime(findLocalPath, collides=()=>false) {
  const context=vm.createContext({findLocalPath,collides,sweepMove,navigationBudget:2,px:999,pz:999});
  vm.runInContext(extract('steerEnemy')+'\n'+extract('wake'),context);
  return context;
}
let checks=0;
function test(name,run){run();checks++;console.log(`ok ${name}`);}
test('actual steering calls search at most twice per frame',()=>{
  let searches=0;
  const c=runtime(()=>{searches++;return [];});
  for(let i=0;i<20;i++) c.steerEnemy(enemy(),10,10,2,.1);
  assert.equal(searches,2);assert.equal(c.navigationBudget,0);
  assert.match(source,/function updateZombies\(dt: number\)\s*\{\s*navigationBudget=2;/);
});
test('no route or exhausted budget does not teleport',()=>{
  const c=runtime(()=>[]), z=enemy();
  c.steerEnemy(z,10,10,2,1);assert.equal(z.x,0);assert.equal(z.z,0);
  c.navigationBudget=0;c.steerEnemy(z,10,10,2,1);assert.equal(z.x,0);assert.equal(z.z,0);
});
test('movement sweeps even an obsolete route through a thin wall',()=>{
  const c=runtime(()=>[{x:10,z:0}],(x,z,r)=>x+r>=1 && x-r<=1.01);
  const z=enemy();c.steerEnemy(z,10,0,20,1);
  assert.ok(z.x<.67 && z.x>=0);assert.equal(z.z,0);
  assert.equal(z.path.length,0);assert.equal(z.pathTimer,0);
});
test('ordinary steering cannot exceed speed or target',()=>{
  const c=runtime(()=>[{x:10,z:0}]), z=enemy();
  c.steerEnemy(z,10,0,2,.1);assert.ok(Math.abs(z.x-.2)<1e-10);
  c.steerEnemy(z,10,0,100,1);assert.equal(z.x,10);
});
test('wake preserves retreat/return lock; explicit sound uses source not player',()=>{
  const c=runtime(()=>[]);
  for(const z of [enemy({returning:true}),enemy({retreat:1}),enemy({state:'dead'})]) {
    const before=z.state;c.wake(z,2,3);assert.equal(z.state,before);
  }
  const z=enemy();c.wake(z,2,3);assert.equal(z.lastX,2);assert.equal(z.lastZ,3);assert.equal(z.state,'chase');
});
test('chase updates live target only under visible contact',()=>{
  assert.ok(/if\(visible\)\{zb\.lastX=px;zb\.lastZ=pz;/.test(source));
  assert.ok(/steerEnemy\(zb,zb\.lastX,zb\.lastZ,/.test(source));
});
test('actual hidden chase uses remembered position and does not face hidden player',()=>{
  const z=enemy({state:'chase',hx:0,hz:0,lastX:7,lastZ:8,lose:0,attackCd:0,warning:0,flashT:0,
    faction:{id:'infected',color:0,range:1.3,speed:1.6},
    mesh:{material:{color:{setHex(){}}},position:{set(){}},rotation:{y:1.25}},
    chest:{rotation:{}},hips:{rotation:{}},head:{rotation:{}}});
  let steered;
  const c=vm.createContext({zombies:[z],px:99,pz:77,navigationBudget:0,canSee:()=>false,
    decideEncounterBehavior,steerEnemy:(_z,x,z)=>{steered=[x,z];},syncEyes(){}});
  vm.runInContext(extract('updateZombies'),c);c.updateZombies(.1);
  assert.deepEqual(steered,[7,8]);assert.equal(z.lastX,7);assert.equal(z.lastZ,8);assert.equal(z.mesh.rotation.y,1.25);
});
test('actual damage cannot break return lock or reveal hidden player position',()=>{
  const c=runtime(()=>[]);c.kills=0;vm.runInContext(extract('damageZombie'),c);
  const returning=enemy({hp:100,state:'wander',returning:true,lastX:3,lastZ:4});
  c.damageZombie(returning,10,1,0,1);assert.equal(returning.state,'wander');assert.equal(returning.lastX,3);
  const z=enemy({hp:100});c.damageZombie(z,10,1,0,1);
  assert.equal(z.lastX,-1);assert.equal(z.lastZ,0);assert.equal(z.state,'chase');
});
test('actual restore keeps last-known/return state and migrates old chase safely',()=>{
  for(const saved of [
    {x:1,z:2,hp:80,state:'chase',faction:'infected'},
    {x:1,z:2,hp:80,state:'wander',faction:'infected',home:[3,4],patrol:[5,6],lastKnown:[7,8],returning:true,retreat:9},
  ]) {
    const enemy={mesh:{visible:true,position:{set(){}}}};
    const c=vm.createContext({elapsed:0,timeLeft:0,NIGHT_SECONDS:480,hp:100,stamina:100,battery:100,
      arsenal:null,survivorSystems:null,migrateSurvivorSystems,structuredClone,createLegacyArsenal,equipWeapon,syncArsenal(){},helperState:{},createHelperState:()=>({}),outbreak:{},inventory:{},stash:{},ammo:0,hasPistol:false,pistolEquipped:false,
      px:999,pz:999,shelter:null,inShelter:false,looted:0,kills:0,restCount:0,containers:[],zombies:[enemy],
      profileFor:()=>({id:'infected'}),playerRoot:null,syncEyes(){},updateDaylight(){},collides:()=>false});
    vm.runInContext(extract('restoreCampaign'),c);
    c.restoreCampaign({hasPistol:false,ammo:0,pistolEquipped:false,elapsed:0,hp:100,stamina:100,battery:100,outbreak:{},inventory:{},stash:{},position:[999,999],
      inShelter:false,containers:[],enemies:[saved],looted:0,kills:0,restCount:0});
    assert.equal(enemy.returning,true);assert.equal(enemy.state,'wander');
    assert.equal(enemy.lastX,saved.lastKnown?.[0]??saved.x);
    assert.equal(enemy.lastZ,saved.lastKnown?.[1]??saved.z);
    assert.equal(enemy.wx,saved.home?.[0]??saved.x);assert.equal(enemy.wz,saved.home?.[1]??saved.z);
    assert.equal(enemy.retreat,saved.retreat??0);assert.equal(enemy.path.length,0);
  }
});
console.log(`${checks} runtime integration checks passed; full-world reachability and feel still need owner play.`);
