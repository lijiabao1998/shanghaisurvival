// Geometry of the twelve survivors on the DefendTaipei mannequin rig. No rendering or browser.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRig, ROSTER, rigOptions } from '../src/characters.ts';
import { animate } from '../src/human.ts';

const lowestFoot = rig =>
  Math.min(new THREE.Box3().setFromObject(rig.ftL, true).min.y, new THREE.Box3().setFromObject(rig.ftR, true).min.y);
const ids = new Set();
for (const spec of ROSTER) {
  ids.add(spec.id);
  const rig = buildRig(spec);
  for (let i = 0; i < 3; i++) animate(rig, 'idle', 0, 1); // settle the standing pose (hip IK)
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root, true);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(box.min.y) < 0.02, `${spec.id}: feet rest on ground (${box.min.y})`);
  assert.ok(Math.abs(box.max.y - spec.height) <= spec.height * 0.02, `${spec.id}: declared height incl. headgear (${box.max.y})`);
  assert.ok(size.x >= 0.40 && size.x <= 0.7, `${spec.id}: human-scale width`);
  assert.ok(size.z >= 0.18 && size.z <= 0.5, `${spec.id}: human-scale depth incl. backpack`);
  const opts = rigOptions(spec);
  assert.equal(opts.gender, spec.sex);
  assert.equal(opts.top, spec.top);
  if (spec.gear) assert.ok(['apron', 'vest', 'helmet', 'pack', 'cap', 'coat'].some(k => opts[k] !== undefined), `${spec.id}: occupation cue kept`);
  // Stride-locked gait with hip IK: the stance foot stays on the ground while walking and running.
  let low = Infinity, high = -Infinity;
  for (const [state, speed] of [['walk', 3.3], ['run', 5.9]])
    for (let i = 0; i < 150; i++) {
      animate(rig, state, speed, 1 / 60);
      rig.root.updateMatrixWorld(true);
      if (i < 30) continue;
      const y = lowestFoot(rig);
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  assert.ok(low > -0.03 && high < 0.05, `${spec.id}: planted stance foot (${low.toFixed(3)}..${high.toFixed(3)} m)`);
  console.log(`PASS ${spec.id}: ground=${box.min.y.toFixed(3)}, top=${box.max.y.toFixed(3)}m, width=${size.x.toFixed(2)}m, stance foot ${low.toFixed(3)}..${high.toFixed(3)}m`);
}
assert.equal(ids.size, 12);
console.log(`${ROSTER.length} character geometry and foot-contact checks passed (no rendering or browser)`);
