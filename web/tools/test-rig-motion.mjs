import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRig, buildWeapon, ROSTER } from '../src/characters.ts';
import { meleePose, MELEE_PROFILES } from '../src/melee-motion.ts';
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
  for (const t of [p.activeStart, (p.activeStart + p.activeEnd) / 2, p.activeEnd]) {
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
  assert.ok(sign * bearings[0] > sign * bearings[1] && sign * bearings[1] > sign * bearings[2], `${hand}: tool sweeps across body: ${bearings}`);
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
  console.log(`${hand}: tip bearings ${bearings.map(x => x.toFixed(2)).join(', ')}`);
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
