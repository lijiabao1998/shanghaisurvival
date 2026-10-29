import assert from 'node:assert/strict';
import { decideEncounterBehavior as decide, canAcquireTarget as acquire } from '../src/encounter-behavior.ts';
const base = { faction:'infected', distance:10, homeDistance:10, visible:true, lostSeconds:0, carryingStolenItem:false, dt:.1 };
const sight = { faction:'infected', distance:22, visible:true, sightRange:22, heardNoise:false };
let checks=0;
function test(name, run) { run(); checks++; console.log(`ok ${name}`); }
test('visible contact chases and resets lost timer', () => {
  assert.deepEqual(decide({...base,lostSeconds:5}), {action:'chase',lostSeconds:0,canAttack:true});
});
test('every faction loses contact behind walls after six continuous seconds', () => {
  for (const faction of ['infected','military','police','raider']) {
    const hidden={...base,faction,visible:false,lostSeconds:5.8};
    assert.equal(decide(hidden).action,'chase');
    assert.equal(decide(hidden).canAttack,false);
    assert.equal(decide({...hidden,lostSeconds:5.9}).action,'return');
    assert.equal(decide({...hidden,lostSeconds:6,dt:100}).lostSeconds,6);
  }
});
test('distance boundary and either cause of lost contact', () => {
  assert.equal(decide({...base,distance:44,lostSeconds:5.9}).action,'chase');
  assert.equal(decide({...base,distance:44.001,lostSeconds:5.9}).action,'return');
  assert.equal(decide({...base,distance:1,visible:false,lostSeconds:5.9}).action,'return');
});
test('military and police are leashed to stable home at 28 metres', () => {
  for (const faction of ['military','police']) {
    assert.equal(decide({...base,faction,homeDistance:28}).action,'chase');
    assert.deepEqual(decide({...base,faction,homeDistance:28.001}),{action:'return',lostSeconds:0,canAttack:false});
  }
  assert.equal(decide({...base,homeDistance:29}).action,'chase');
});
test('raider retreats after stealing rather than repeatedly attacking', () => {
  assert.deepEqual(decide({...base,faction:'raider',carryingStolenItem:true}),{action:'retreat',lostSeconds:0,canAttack:false});
  assert.equal(decide({...base,carryingStolenItem:true}).action,'chase');
});
test('infected and raiders return within the local navigation range', () => {
  for (const faction of ['infected','raider']) {
    assert.equal(decide({...base,faction,homeDistance:32}).action,'chase');
    assert.equal(decide({...base,faction,homeDistance:32.001}).action,'return');
  }
});
test('vision respects walls and range; infected acquire a fresh audible event', () => {
  assert.equal(acquire(sight),true);
  assert.equal(acquire({...sight,distance:22.01}),false);
  assert.equal(acquire({...sight,visible:false}),false);
  assert.equal(acquire({...sight,visible:false,heardNoise:true}),true);
  assert.equal(acquire({...sight,faction:'military',visible:false,heardNoise:true}),false);
  assert.equal(acquire({...sight,sightRange:10}),false);
});
test('invalid numeric values fail closed', () => {
  for (const field of ['distance','homeDistance','lostSeconds','dt']) {
    for (const invalid of [NaN,Infinity,-.1]) assert.deepEqual(decide({...base,[field]:invalid}),{action:'return',lostSeconds:6,canAttack:false});
  }
  assert.equal(acquire({...sight,distance:NaN,heardNoise:true}),false);
  assert.equal(acquire({...sight,sightRange:-1}),false);
});
test('timer is continuous, deterministic and independent of split timestep', () => {
  let state={...base,visible:false};
  for (let i=0;i<60;i++) state={...state,lostSeconds:decide(state).lostSeconds};
  // Floating point sums may be a few ulps below six, so use the timer's actual value.
  assert.ok(Math.abs(state.lostSeconds-6)<1e-12);
  assert.equal(decide({...state,dt:.001}).action,'return');
  assert.deepEqual(decide({...base,visible:false,dt:6}),{action:'return',lostSeconds:6,canAttack:false});
  assert.deepEqual(decide(base),decide(base));
});
console.log(`${checks} encounter behavior checks passed; movement and feel require integration and owner play.`);
