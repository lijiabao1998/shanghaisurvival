import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRig, ROSTER } from '../src/characters.ts';

for (const spec of ROSTER) {
  const rig = buildRig(spec);
  const box = new THREE.Box3().setFromObject(rig.root);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(box.min.y) < 1e-6, `${spec.id}: feet rest on ground`);
  assert.ok(Math.abs(box.max.y - spec.height) <= spec.height * 0.025, `${spec.id}: declared height incl. optional headgear tolerance`);
  assert.ok(size.x >= 0.40 && size.x <= 0.66, `${spec.id}: human-scale body width within collider diameter`);
  assert.ok(size.z >= 0.18 && size.z <= 0.4, `${spec.id}: human-scale depth`);
  for (const foot of [rig.legL.children[1], rig.legR.children[1]]) {
    assert.ok(foot, `${spec.id}: shoe is parented to leg pivot`);
    const fb = new THREE.Box3().setFromObject(foot);
    assert.ok(Math.abs(fb.min.y) < 1e-6, `${spec.id}: neither shoe is underground`);
  }
  console.log(`PASS ${spec.id}: ground=${box.min.y.toFixed(4)}, top=${box.max.y.toFixed(3)}m, width=${size.x.toFixed(3)}m`);
}
console.log(`${ROSTER.length} character geometry checks passed (no rendering or browser)`);
