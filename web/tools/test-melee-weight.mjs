// Actual survival.ts function execution with THREE rigs. Not a browser/visual test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import * as motion from '../src/melee-motion.ts';
import * as rigMotion from '../src/rig-motion.ts';
import * as combat from '../src/combat.ts';
import { TOOL_COMBAT, isMeleeTool } from '../src/melee-tools.ts';
import { buildRig, ROSTER } from '../src/characters.ts';
import { createLegacyArsenal, grantWeapon, equipWeapon, WEAPONS } from '../src/arsenal.ts';
import { createSurvivorSystems, grantTool, equipHand, carriedWeight, loadEffects, validSurvivorSystems } from '../src/survivor-systems.ts';
import { emptyInventory } from '../src/campaign.ts';
const source = fs.readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8');
function extract(name, text=source) {
  const start=text.indexOf(`function ${name}(`); assert.ok(start>=0, `actual function ${name} exists`);
  const body=text.indexOf('{',start); let end=body+1, depth=1;
  while(depth&&end<text.length){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}
  assert.equal(depth,0);return stripTypeScriptTypes(text.slice(start,end));
}
const helpers=['currentSwingProfile','canSee','forwardXZ','startSwing','meleeHit','shove','applyShoveImpact','animateRig','dispatchHandAttack','setUnarmedStance','releaseGameplayInput'];
function runtime(extra={}, text=source) {
  const hits=[],shots=[],noise=[];
  const arsenal=createLegacyArsenal(false,0);
  const math=Object.create(Math);math.random=()=>{throw Error('combat must not consume nondeterministic random');};
  const c=vm.createContext({THREE,Math:math,...motion,...rigMotion,...combat,TOOL_COMBAT,isMeleeTool,WEAPONS,carriedWeight,loadEffects,
    arsenal,survivorSystems:createSurvivorSystems(arsenal),inventory:emptyInventory(),rig:buildRig(ROSTER[0]),
    unarmedStance:false,swingTool:'pipe',swingHand:'right',swingStroke:0,swingCount:0,swingHits:new Set(),
    action:'none',actionT:0,actionDur:0,actionFired:false,comboWindow:0,impactPause:0,bufferedHand:null,
    stamina:100,px:0,pz:0,py:0,facing:0,shoveFacing:0,bounds:{minX:-100,maxX:100,minY:-100,maxY:100},zombies:[],collides:()=>false,camShake:0,
    phase:'play',paused:false,bagOpen:false,inShelter:false,helperOpen:false,
    HEAR_SWING:1,makeNoise:(...args)=>noise.push(args),damageZombie(z,damage){hits.push(z);z.hp-=damage;},fire:(...args)=>shots.push(args),
    updateWeaponVisual(){},updateBag(){},flashHint(){},weapon:null,offhandWeapon:null,
    visualMove:0,breathPhase:0,walkPhase:0,RUN_SPEED:5.9,grounded:true,throwBrick(){},
    keys:new Set(),attackHeld:false,touchActionHeld:false,lootProgress:0,setRing(){},
    ...extra});
  for(const name of helpers)vm.runInContext(extract(name,text),c);
  return {c,hits,shots,noise};
}
const target=(angle=0,d=.85)=>({x:Math.sin(angle)*d,z:-Math.cos(angle)*d,state:'chase',hp:100,attackCd:0,warning:1,
  mesh:new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()),chest:new THREE.Bone(),head:new THREE.Bone(),hips:new THREE.Bone(),flashT:0});
const advance=(c,seconds,step=.01)=>{for(let t=0;t<seconds-1e-9;t+=step)c.animateRig(Math.min(step,seconds-t),0);};
let count=0;function test(name,fn){fn();count++;console.log(`PASS ${name}`);}

for(const hand of ['left','right'])test(`real ${hand} punch hits once across low-FPS active window`,()=>{
 const {c,hits}=runtime({unarmedStance:true});const z=target(),behind=target(Math.PI),far=target(0,1.5);c.zombies=[z,behind,far];
 c.startSwing(hand);assert.equal(c.swingTool,'unarmed');assert.equal(c.action,'swing');assert.equal(c.swingHand,hand);
 advance(c,1,1);assert.deepEqual(hits,[z]);assert.equal(z.hp,84);assert.equal(c.stamina,94);assert.ok(z.attackCd>=.5);assert.equal(behind.hp,100);assert.equal(far.hp,100);
});
test('fine steps and one coarse step have equal punch damage, no repeated hit',()=>{
 for(const step of [.005,.05,1]){const {c,hits}=runtime({unarmedStance:true});const z=target();c.zombies=[z];c.startSwing();advance(c,1,step);assert.equal(hits.length,1);assert.equal(z.hp,84);}
});
test('empty swing and wall-blocked punch have no impact pause or reaction',()=>{
 for(const blocked of [false,true]){const {c,hits}=runtime({unarmedStance:true,collides:blocked?(_x,z,r)=>z<-.4+r:()=>false});const z=target();if(blocked)c.zombies=[z];c.startSwing();c.animateRig(.2,0);assert.equal(hits.length,0);assert.equal(c.impactPause,0);assert.equal(c.camShake,0);assert.equal(z.hp,100);}
});
test('actual punch contact retains exactly 35ms hitstop',()=>{
 const {c}=runtime({unarmedStance:true});c.zombies=[target()];c.startSwing();c.animateRig(.16,0);assert.equal(c.impactPause,.035);
 const before=c.actionT;c.animateRig(.02,0);assert.equal(c.actionT,before);c.animateRig(.02,0);assert.ok(Math.abs(c.actionT-before-.005)<1e-9);
});
test('low stamina and early spam cannot produce free attacks',()=>{
 const {c}=runtime({unarmedStance:true,stamina:5});c.startSwing();assert.equal(c.action,'none');assert.equal(c.stamina,5);
 c.stamina=6;c.startSwing();c.startSwing();assert.equal(c.swingCount,1);assert.equal(c.stamina,0);assert.equal(c.bufferedHand,null);advance(c,.3);c.startSwing('left');advance(c,1);assert.equal(c.swingCount,1);
});
test('one explicit late opposite-hand press buffers only one punch',()=>{
 const {c}=runtime({unarmedStance:true});c.startSwing('right');advance(c,.29);c.startSwing('left');c.startSwing('left');assert.equal(c.bufferedHand,'left');advance(c,.2);assert.equal(c.swingCount,2);assert.equal(c.swingHand,'left');assert.equal(c.stamina,88);advance(c,1);assert.equal(c.swingCount,2);
});
test('empty offhand punches next to pistol but occupied gun still dispatches gun',()=>{
 const a=createLegacyArsenal(true,7);equipWeapon(a,'qsz92-9');const s=createSurvivorSystems(a);const {c,shots}=runtime({arsenal:a,survivorSystems:s});
 c.dispatchHandAttack('secondary');assert.equal(c.action,'swing');assert.equal(c.swingTool,'unarmed');assert.equal(c.swingHand,'left');advance(c,1);
 c.dispatchHandAttack('primary');assert.deepEqual(shots,[['qsz92-9','right']]);assert.equal(a.rounds['9mm'],7);
});
test('two-handed rifle forbids free offhand until explicitly holstered',()=>{
 const a=createLegacyArsenal(false,0);grantWeapon(a,'qbz191');equipWeapon(a,'qbz191');const s=createSurvivorSystems(a);assert.ok(validSurvivorSystems(s,a));
 const {c}=runtime({arsenal:a,survivorSystems:s});c.startSwing('left');assert.equal(c.action,'none');c.dispatchHandAttack('secondary');assert.equal(c.action,'none');assert.equal(c.stamina,100);
 c.setUnarmedStance(true);c.startSwing('left');assert.equal(c.action,'swing');assert.equal(c.swingTool,'unarmed');assert.equal(a.equipped,'qbz191');assert.equal(s.hands.primary,'qbz191');
});
test('stance roundtrip leaves canonical save data untouched and rejects mid-swing changes',()=>{
 const {c}=runtime();const saved=JSON.stringify({a:c.arsenal,s:c.survivorSystems,i:c.inventory});c.setUnarmedStance(true);assert.equal(c.unarmedStance,true);c.startSwing();c.setUnarmedStance(false);assert.equal(c.unarmedStance,true);advance(c,1);c.setUnarmedStance(false);assert.equal(c.unarmedStance,false);assert.equal(JSON.stringify({a:c.arsenal,s:c.survivorSystems,i:c.inventory}),saved);assert.ok(validSurvivorSystems(c.survivorSystems,c.arsenal));
});
test('existing pipe/cleaver damage, and wrench independent timing, remain playable',()=>{
 for(const [id,damage,duration] of [['pipe',45,.68],['cleaver',39,.55],['wrench',34,.58]]){
  const a=createLegacyArsenal(false,0),s=createSurvivorSystems(a);if(id!=='pipe'){grantTool(s,a,id);equipHand(s,a,'primary',id);}
  const {c,hits}=runtime({arsenal:a,survivorSystems:s});c.zombies=[target(0,1.1)];c.startSwing();assert.equal(c.actionDur,duration);advance(c,1,1);assert.equal(hits.length,1);assert.equal(c.zombies[0].hp,100-damage);assert.equal(c.stamina,94);
 }
});
test('all twelve real rigs produce finite punch poses without changing roster identities',()=>{
 assert.equal(ROSTER.length,12);for(const spec of ROSTER){const {c}=runtime({unarmedStance:true,rig:buildRig(spec)});c.startSwing('left');advance(c,.18);c.rig.group?.updateMatrixWorld(true);for(const joint of ['armL','armR','elbowL','elbowR','kneeL','kneeR','torso','body']){assert.ok(c.rig[joint].position.toArray().every(Number.isFinite));assert.ok(c.rig[joint].rotation.toArray().slice(0,3).every(Number.isFinite));}}
});
test('shove winds up, pushes only front once, then retreats without damage',()=>{
 const {c,hits,noise}=runtime();const front=target(),back=target(Math.PI),side=target(Math.PI/2);c.zombies=[front,back,side];c.shove();assert.equal(c.action,'shove');assert.equal(c.stamina,90);c.shove();assert.equal(c.stamina,90);
 c.animateRig(.09,0);assert.equal(front.z,-.85);assert.equal(noise.length,0);c.animateRig(.02,0);assert.ok(Math.abs(front.z+1.55)<1e-9);assert.equal(front.attackCd,1.5);assert.equal(front.warning,0);assert.equal(front.hitReact,.24);assert.equal(back.attackCd,0);assert.equal(side.attackCd,0);assert.equal(c.pz,0);
 advance(c,.6);assert.ok(Math.abs(front.z+1.55)<1e-9);assert.ok(Math.abs(c.pz-.45)<1e-9);assert.equal(hits.length,0);assert.equal(front.hp,100);assert.equal(noise.length,1);assert.equal(c.action,'none');
});
test('whole shove in one slow frame equals fine steps with no double impulse',()=>{
 const results=[];for(const step of [.005,.1,1]){const {c,noise}=runtime();const z=target();c.zombies=[z];c.shove();advance(c,1,step);results.push([z.x,z.z,c.px,c.pz,z.hp,noise.length]);}for(const result of results)for(let i=0;i<result.length;i++)assert.ok(Math.abs(result[i]-results[0][i])<1e-8);
});
test('shove cannot see through wall, push through thin wall, or retreat through wall',()=>{
 const blocked=runtime({collides:(_x,z,r)=>Math.abs(z+.4)<r+.01});const shielded=target();blocked.c.zombies=[shielded];blocked.c.shove();advance(blocked.c,1,1);assert.equal(shielded.z,-.85);assert.equal(shielded.attackCd,0);
 const pushing=runtime({collides:(_x,z,r)=>Math.abs(z+1.3)<r+.01});const z=target();pushing.c.zombies=[z];pushing.c.shove();advance(pushing.c,1,1);assert.ok(z.z>-1.3+.34);assert.equal(z.hp,100);
 const retreat=runtime({collides:(_x,z,r)=>Math.abs(z-.5)<r+.01});retreat.c.shove();advance(retreat.c,1,1);assert.ok(retreat.c.pz<=.5-.36);assert.ok(retreat.c.pz>=0);
});
test('shove low stamina, cancel and action commitment prevent free or delayed effects',()=>{
 const {c,noise}=runtime({stamina:9});c.shove();assert.equal(c.action,'none');assert.equal(c.stamina,9);c.stamina=10;c.shove();assert.equal(c.stamina,0);c.startSwing();assert.equal(c.action,'shove');c.animateRig(.05,0);c.releaseGameplayInput();advance(c,1);assert.equal(noise.length,0);assert.equal(c.pz,0);assert.equal(c.action,'none');
});
test('new once-per-swing guard is mutation-sensitive',()=>{
 const broken=source.replace("zb.state === 'dead' || swingHits.has(zb)","zb.state === 'dead'");assert.notEqual(broken,source);const {c,hits}=runtime({unarmedStance:true},broken);c.zombies=[target()];c.startSwing();advance(c,1,.005);assert.throws(()=>assert.equal(hits.length,1),assert.AssertionError);
});
test('new shove once-only guard is mutation-sensitive',()=>{
 const broken=source.replace('if(!actionFired&&t>=.22)','if(t>=.22)');assert.notEqual(broken,source);const {c,noise}=runtime({},broken);c.zombies=[target()];c.shove();advance(c,1,.01);assert.throws(()=>assert.equal(noise.length,1),assert.AssertionError);
});
test('actual player low-FPS combat step cannot tunnel a thin wall and retains slide',()=>{
 const {c}=runtime({keys:new Set(['KeyW']),sneaking:false,outbreak:{hydration:100},WALK_SPEED:3.3,lightOn:false,invuln:0,playerRoot:null,torch:null,halo:null,mouseAimActive:false,
  collides:(x,_z,r)=>Math.abs(x+.5)<r+.01});vm.runInContext(extract('updatePlayer'),c);c.startSwing();c.updatePlayer(1);assert.ok(c.px>-.5+.36);assert.ok(c.pz>.3);assert.equal(c.facing,0);
});
test('real enemy hit reaction blocks AI during recoil and clears pose afterwards',()=>{
 const {c}=runtime({navigationBudget:0,syncEyes(){},mode:'quick',lightOn:false,sneaking:false,SENSE_DARK:10,SENSE_LIGHT:20});vm.runInContext(extract('updateZombies'),c);
 const z=target();Object.assign(z,{state:'sleep',think:100,hitReact:.24,hitSide:1,pathTimer:0,retreat:0,faction:{color:0x777777},walk:0,phase:0});c.zombies=[z];const before=[z.x,z.z];c.updateZombies(.12);assert.deepEqual([z.x,z.z],before);assert.ok(z.chest.rotation.x<0);assert.ok(z.mesh.rotation.z>0);assert.equal(z.think,100);
 c.updateZombies(.13);assert.equal(z.hitReact,0);assert.equal(z.mesh.rotation.z,0);assert.ok(z.chest.rotation.x>=0,'expired recoil must not leave sleeping enemy permanently bent');
});
test('lethal contact is immediate once; pooled enemy falls then hides with no saved timer',()=>{
 const {c}=runtime({kills:0,navigationBudget:0,syncEyes(){},wake(){}});
 vm.runInContext(extract('damageZombie'),c);vm.runInContext(extract('updateZombies'),c);
 const z=target();z.hitSide=1;c.zombies=[z];c.damageZombie(z,100,0,-1,.4);
 assert.equal(z.state,'dead');assert.equal(c.kills,1);assert.equal(z.mesh.visible,true);assert.equal(z.deathT,.48);
 c.damageZombie(z,100,0,-1,.4);assert.equal(c.kills,1);assert.equal(z.hp,0);
 const geometry=z.mesh.geometry,material=z.mesh.material;c.updateZombies(.24);assert.ok(z.mesh.rotation.x<-.5);assert.equal(z.mesh.visible,true);
 c.updateZombies(1);assert.equal(z.deathT,0);assert.equal(z.mesh.visible,false);assert.equal(z.mesh.geometry,geometry);assert.equal(z.mesh.material,material);
 assert.ok(!extract('snapshotCampaign').includes('deathT'),'transient visual not in save');
});
console.log(`${count} melee weight runtime checks passed; no browser launched`);
