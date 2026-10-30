// Exercise the actual survival.ts attack and animation functions with a real rig.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { segmentClear } from '../src/combat.ts';
import { MELEE_PROFILES, meleePose, sweptMeleeAngle, angleInSweep } from '../src/melee-motion.ts';
import { buildRig, ROSTER } from '../src/characters.ts';
import { applyMeleePose, resetRigJoints, applyLocomotionJoints, applyThrowJoints } from '../src/rig-motion.ts';

const source = readFileSync(new URL('../src/survival.ts', import.meta.url), 'utf8');
function extract(name) {
  const start=source.indexOf(`function ${name}(`); assert.ok(start >= 0, name);
  const body=source.indexOf('{',start); let end=body+1, depth=1;
  while(depth && end<source.length) { if(source[end]==='{') depth++; if(source[end]==='}') depth--; end++; }
  assert.equal(depth,0); return stripTypeScriptTypes(source.slice(start,end));
}
function runtime(extra={}) {
  const hits=[];
  const c=vm.createContext({MELEE_PROFILES,meleePose,sweptMeleeAngle,angleInSweep,segmentClear,
    applyMeleePose,resetRigJoints,applyLocomotionJoints,applyThrowJoints,
    rig:buildRig(ROSTER[0]), arsenal:{equipped:null}, stamina:100,action:'none',actionT:0,actionDur:0,actionFired:false,
    swingCount:0,swingHand:'right',swingHits:new Set(),px:0,pz:0,facing:0,zombies:[],collides:()=>false,
    HEAR_SWING:1,makeNoise(){},damageZombie(z,damage){hits.push(z);z.hp-=damage;},camShake:0,
    walkPhase:0,RUN_SPEED:5.9,grounded:true,WEAPONS:{},throwBrick(){},...extra});
  for(const name of ['canSee','startSwing','meleeHit','animateRig']) vm.runInContext(extract(name),c);
  return {c,hits};
}
const target=(angle,d=1.3)=>({x:Math.sin(angle)*d,z:-Math.cos(angle)*d,state:'sleep',hp:100,attackCd:0});
const advance=(c,seconds,step=.02)=>{for(let t=0;t<seconds-1e-9;t+=step)c.animateRig(Math.min(step,seconds-t),0);};
let count=0;function test(name,fn){fn();count++;console.log(`PASS ${name}`);}
test('actual start rejects low stamina and commits one action per press',()=>{
 const {c}=runtime({stamina:5});c.startSwing();assert.equal(c.action,'none');assert.equal(c.stamina,5);
 c.stamina=6;c.startSwing();assert.equal(c.action,'swing');assert.equal(c.stamina,0);c.startSwing();assert.equal(c.swingCount,1);
 advance(c,MELEE_PROFILES.blunt.duration+.02);assert.equal(c.action,'none');c.startSwing();assert.equal(c.swingCount,1);
 c.stamina=6;c.startSwing();assert.equal(c.swingCount,2);
});
test('actual swept strike hits each visible target once, in arc, and stuns',()=>{
 const {c,hits}=runtime(); const a=target(.65),b=target(-.45),behind=target(2.4),far=target(0,2.1);
 c.zombies=[a,b,behind,far];c.startSwing();advance(c,.7,.01);
 assert.equal(hits.filter(z=>z===a).length,1);assert.equal(hits.filter(z=>z===b).length,1);
 assert.equal(hits.includes(behind),false);assert.equal(hits.includes(far),false);
 assert.equal(a.hp,55);assert.ok(a.attackCd>=.5);assert.ok(c.camShake>0);
});
test('actual swing cannot damage through a wall even in its arc',()=>{
 const {c,hits}=runtime({collides:(_x,z,r)=>z < -.55+r});c.zombies=[target(0)];c.startSwing();advance(c,.7);assert.equal(hits.length,0);
});
test('equipped firearm blocks pipe swing until unequipped',()=>{
 const {c}=runtime({arsenal:{equipped:'qsz92-9'}});c.startSwing();assert.equal(c.action,'none');assert.equal(c.stamina,100);
 c.arsenal.equipped=null;c.startSwing();assert.equal(c.action,'swing');assert.equal(c.stamina,94);
});
test('a large animation step still sweeps entire active window',()=>{
 const {c,hits}=runtime();const a=target(.7),b=target(-.7);c.zombies=[a,b];c.startSwing();advance(c,.7,.7);assert.deepEqual(hits,[a,b]);
});
test('actual input release cancels a committed attack and clears held controls',()=>{
 const {c}=runtime({keys:new Set(['KeyW']),attackHeld:true,touchActionHeld:true,lootProgress:0,setRing(){}});
 vm.runInContext(extract('releaseGameplayInput'),c);c.startSwing();advance(c,.1);c.releaseGameplayInput();
 assert.equal(c.action,'none');assert.equal(c.actionT,0);assert.equal(c.attackHeld,false);assert.equal(c.touchActionHeld,false);assert.equal(c.keys.size,0);
});
test('held attacks spend stamina, then wait for recovery before the next swing',()=>{
 const {c}=runtime({stamina:6,keys:new Set(),sneaking:false,outbreak:{hydration:100},WALK_SPEED:3.3,
  lightOn:false,invuln:0,playerRoot:null,torch:null,halo:null});
 vm.runInContext(extract('updatePlayer'),c);
 const tick=()=>{if(c.action==='none')c.startSwing();c.updatePlayer(.05);};
 tick();for(let i=0;i<13;i++)tick();assert.equal(c.swingCount,1);assert.equal(c.stamina,0);assert.equal(c.action,'none');
 for(let i=0;i<8;i++)tick();assert.equal(c.swingCount,1);assert.ok(c.stamina<6);
 tick();assert.equal(c.swingCount,1);assert.ok(c.stamina>=6);
 tick();assert.equal(c.swingCount,2);assert.equal(c.action,'swing');assert.ok(c.stamina<1);
});
console.log(`${count} melee runtime checks passed`);
