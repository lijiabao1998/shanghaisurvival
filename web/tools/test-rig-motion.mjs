import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import * as THREE from 'three';
import { buildRig, buildWeapon, ROSTER } from '../src/characters.ts';
import { meleePose, MELEE_PROFILES, sweptMeleeAngle } from '../src/melee-motion.ts';
import { applyMeleePose, resetRigJoints, applyLocomotionJoints, applyThrowJoints } from '../src/rig-motion.ts';

for (const stroke of [0, 1]) for (const hand of ['right', 'left']) {
  const spec = ROSTER[0], rig = buildRig(spec);
  const elbow = hand === 'right' ? rig.elbowR : rig.elbowL;
  const tool = buildWeapon('pipe');
  tool.position.set(0, -spec.height * .27 + spec.height * .29 * .52, .03);
  tool.rotation.x = Math.PI;
  elbow.add(tool);
  const p = MELEE_PROFILES.blunt;
  const bearings = [];
  for (const t of Array.from({length:61},(_,i)=>p.activeStart+(p.activeEnd-p.activeStart)*i/60)) {
    resetRigJoints(rig);
    const pose = meleePose('blunt', t, hand, stroke);
    applyMeleePose(rig, pose, hand);
    rig.root.updateMatrixWorld(true);
    const shoulder = new THREE.Vector3();
    (hand === 'right' ? rig.armR : rig.armL).getWorldPosition(shoulder);
    const tip = tool.localToWorld(new THREE.Vector3(0, .72, 0));
    const delta = tip.sub(shoulder);
    const bearing = Math.atan2(delta.x, delta.z);
    assert.ok(Math.abs(bearing - pose.sweepAngle) < .2, `${hand}: visible tool and damage arc agree at ${t}: ${bearing} vs ${pose.sweepAngle}`);
    bearings.push(bearing);
  }
  const sign = (hand === 'right' ? 1 : -1) * (stroke === 1 ? -1 : 1);
  assert.ok(bearings.every((b,i)=>i===0||sign*bearings[i-1]>sign*b), `${hand}: tool sweeps across body: ${bearings}`);
  resetRigJoints(rig);
  assert.equal(rig.armR.rotation.y, 0, 'right shoulder yaw resets after a swing');
  assert.equal(rig.armL.rotation.y, 0, 'left shoulder yaw resets after a swing');
  assert.equal(rig.elbowR.rotation.x, 0);
  assert.equal(rig.elbowL.rotation.x, 0);
  applyLocomotionJoints(rig, Math.PI / 2, true, true);
  assert.ok(rig.kneeL.rotation.x > 0 && rig.kneeR.rotation.x === 0);
  applyThrowJoints(rig, .45);
  assert.ok(rig.elbowR.rotation.x < 0);
  applyThrowJoints(rig, .7);
  assert.ok(Math.abs(rig.elbowR.rotation.x) < 1e-9);
  console.log(`${hand}: tip bearings ${[bearings[0],bearings[30],bearings[60]].map(x => x.toFixed(2)).join(', ')}`);
}
console.log('Joint animation checks passed.');
// Entering/leaving melee does not erase an in-progress walking stride.
for(const progress of [0,1]){
 const rig=buildRig(ROSTER[0]);rig.legL.rotation.x=.4;rig.legR.rotation.x=-.4;
 rig.armR.rotation.x=.2;rig.armL.rotation.x=-.3;rig.torso.rotation.x=.08;
 applyMeleePose(rig,meleePose('blunt',progress));
 assert.ok(Math.abs(rig.legL.rotation.x-.4)<1e-9);
 assert.ok(Math.abs(rig.legR.rotation.x+.4)<1e-9);
 assert.ok(Math.abs(rig.armR.rotation.x-.2)<1e-9);
 assert.ok(Math.abs(rig.armL.rotation.x+.3)<1e-9);
 assert.ok(Math.abs(rig.torso.rotation.x-.08)<1e-9);
}
console.log('Locomotion/melee boundary blending passed.');

// Regression: evaluate the composited pose, not only shoulder X or isolated pose data.
// In particular reverse strokes must return to the same handed resting roll.
const wrapAngle=x=>Math.atan2(Math.sin(x),Math.cos(x));
function locomotionBase(rig,phase=Math.PI/2){
 resetRigJoints(rig);
 const stride=Math.sin(phase)*.6;
 rig.legL.rotation.set(stride,0,0);rig.legR.rotation.set(-stride,0,0);
 rig.armL.rotation.set(-stride*.75,0,-.05,'XYZ');rig.armR.rotation.set(stride*.55,0,.05,'XYZ');
 rig.torso.rotation.set(.08,.065*Math.sin(phase),.025*Math.sin(phase));
 applyLocomotionJoints(rig,phase,true,true);
 rig.body.position.set(.012*Math.sin(phase),.018*Math.cos(phase*2),0);
}
const jointNames=['armR','armL','elbowR','elbowL','torso','legL','legR','kneeL','kneeR'];
for(const hand of ['right','left'])for(const stroke of [0,1]){
 const rig=buildRig(ROSTER[0]);
 for(const gait of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const progress of [0,1]){
  locomotionBase(rig,gait);const before=Object.fromEntries(jointNames.map(n=>[n,rig[n].quaternion.clone()]));const basePosition=rig.body.position.clone();
  applyMeleePose(rig,meleePose('blunt',progress,hand,stroke),hand);
  for(const n of jointNames)assert.ok(rig[n].quaternion.angleTo(before[n])<1e-6,`${hand} stroke${stroke} ${n} exactly preserves gait at boundary ${progress}`);
  assert.ok(rig.body.position.distanceTo(basePosition)<1e-9,`${hand} stroke${stroke} weight shift returns to gait`);
 }
 const p=MELEE_PROFILES.blunt;
 // Every phase boundary has a small angular displacement on either side, including elbows.
 for(const at of [p.activeStart,p.activeEnd]){
  locomotionBase(rig);applyMeleePose(rig,meleePose('blunt',at-1e-5,hand,stroke),hand);
  const before=Object.fromEntries(jointNames.map(n=>[n,rig[n].quaternion.clone()]));
  locomotionBase(rig);applyMeleePose(rig,meleePose('blunt',at+1e-5,hand,stroke),hand);
  for(const n of jointNames)assert.ok(rig[n].quaternion.angleTo(before[n])<.002,`${hand} stroke${stroke} ${n} has no phase-boundary snap at ${at}`);
 }
 const active=(p.activeStart+p.activeEnd)/2;
 locomotionBase(rig,Math.PI/2);applyMeleePose(rig,meleePose('blunt',active,hand,stroke),hand);const forwardStride=[rig.legL.rotation.x,rig.legR.rotation.x,rig.kneeL.rotation.x,rig.kneeR.rotation.x];
 locomotionBase(rig,Math.PI*1.5);applyMeleePose(rig,meleePose('blunt',active,hand,stroke),hand);const reverseStride=[rig.legL.rotation.x,rig.legR.rotation.x,rig.kneeL.rotation.x,rig.kneeR.rotation.x];
 assert.ok(Math.abs(forwardStride[0]-reverseStride[0])>.6&&Math.abs(forwardStride[1]-reverseStride[1])>.6,`${hand} stroke${stroke} keeps supporting leg stride during contact`);
 assert.ok(Math.abs(forwardStride[2]-reverseStride[2])>.3&&Math.abs(forwardStride[3]-reverseStride[3])>.3,`${hand} stroke${stroke} knees continue gait during contact`);
 const loaded=meleePose('blunt',p.activeStart,hand,stroke),extended=meleePose('blunt',p.activeEnd,hand,stroke);
 assert.ok(extended.elbowBend-loaded.elbowBend>.5,`${hand} stroke${stroke} elbow genuinely extends through active cut`);
}
console.log('Active gait, both-hand reverse-stroke boundary quaternions, and elbow extension checks passed.');
// The visual pose and hit sweep use the same handedness AND stroke direction.
for(const kind of ['blunt','blade','unarmed'])for(const hand of ['right','left'])for(const stroke of [0,1]){
 const p=MELEE_PROFILES[kind];
 for(let i=1;i<=60;i++){
  const a=p.activeStart+(p.activeEnd-p.activeStart)*(i-1)/60,b=p.activeStart+(p.activeEnd-p.activeStart)*i/60;
  const arc=sweptMeleeAngle(kind,a,b,hand,stroke);assert.ok(arc);
  assert.ok(Math.abs(wrapAngle(arc.from-meleePose(kind,a,hand,stroke).sweepAngle))<1e-9);
  assert.ok(Math.abs(wrapAngle(arc.to-meleePose(kind,b,hand,stroke).sweepAngle))<1e-9);
  const mirror=hand==='right'?'left':'right';
  assert.ok(Math.abs(wrapAngle(meleePose(kind,b,hand,stroke).sweepAngle+meleePose(kind,b,mirror,stroke).sweepAngle))<1e-9);
 }
}
console.log('Dense both-hand/both-stroke visual sweep and damage-arc consistency passed.');

// Execute the real updatePlayer body so this fails if a later refactor again
// gates all movement on action==='none'. Render/audio peripherals alone are stubbed.
const survivalSource=readFileSync(new URL('../src/survival.ts',import.meta.url),'utf8');
function extractFunction(name){
 const start=survivalSource.indexOf(`function ${name}(`);assert.ok(start>=0);const opening=survivalSource.indexOf('{',start);let depth=1,end=opening+1;
 while(depth&&end<survivalSource.length){if(survivalSource[end]==='{')depth++;if(survivalSource[end]==='}')depth--;end++;}
 assert.equal(depth,0);return stripTypeScriptTypes(survivalSource.slice(start,end));
}
function movementContext(overrides={}){
 const c=vm.createContext({keys:new Set(['KeyW']),sneaking:false,stamina:80,action:'swing',WALK_SPEED:3.3,RUN_SPEED:5.9,
  outbreak:{hydration:100},inventory:{},arsenal:{},carriedWeight:()=>0,loadEffects:()=>({speedMultiplier:1,staminaMultiplier:1}),
  px:0,pz:0,py:0,vy:0,bounds:{minX:-10,maxX:10,minY:-10,maxY:10},collides:()=>false,facing:.73,mouseAimActive:false,touchActionHeld:false,walkPhase:0,
  lightOn:false,battery:100,grounded:true,invuln:0,playerRoot:new THREE.Group(),torch:null,halo:null,runNoiseTimer:10,makeNoise(){},HEAR_RUN:1,
  reportedSpeed:0,animateRig(_dt,speed){c.reportedSpeed=speed;},...overrides});
 vm.runInContext(extractFunction('updatePlayer'),c);return c;
}
for(const keyset of [new Set(['KeyW']),new Set(['KeyW','KeyD']),new Set(['KeyW','ShiftLeft'])]){
 const c=movementContext({keys:keyset});c.updatePlayer(.05);
 assert.ok(Math.abs(Math.hypot(c.px,c.pz)-3.3*.38*.05)<1e-9,'swing allows a normalized 38% walking step, never sprinting');
 assert.equal(c.facing,.73,'committed swing facing stays locked while moving');assert.equal(c.stamina,80,'moving swing cannot regenerate stamina or start a sprint drain');
 assert.ok(c.walkPhase>0&&c.reportedSpeed>0,'actual movement advances visible stride');assert.equal(c.playerRoot.position.x,c.px);assert.equal(c.playerRoot.position.z,-c.pz);
}
{
 const c=movementContext({keys:new Set(['KeyD']),collides:(x,_z)=>x>.02});c.updatePlayer(.05);
 assert.equal(c.px,0,'swing movement still respects blocked city X');assert.ok(c.pz>0,'unblocked city Z can slide');assert.ok(c.reportedSpeed<3.3*.38);
 const stopped=movementContext({collides:()=>true});stopped.updatePlayer(.05);assert.equal(stopped.px,0);assert.equal(stopped.pz,0);assert.equal(stopped.walkPhase,0);assert.equal(stopped.reportedSpeed,0);
 const bounded=movementContext({px:18,pz:18,keys:new Set(['KeyD'])});bounded.updatePlayer(.05);assert.equal(bounded.px,18);assert.equal(bounded.pz,18,'swing cannot cross map bounds');
}
for(const action of ['shoot','throw','loot']){const c=movementContext({action});c.updatePlayer(.05);assert.equal(c.px,0);assert.equal(c.pz,0,`${action} still has its own movement gate`);}
{
 const c=movementContext({action:'none'});c.updatePlayer(.05);assert.ok(Math.abs(Math.hypot(c.px,c.pz)-3.3*.05)<1e-9);assert.notEqual(c.facing,.73,'ordinary movement may face its direction after swing');
}
console.log('Actual moving-melee update: controlled step, locked facing, stamina, city collision, bounds and stride passed.');
