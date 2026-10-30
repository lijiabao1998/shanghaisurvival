import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMeleeTool, isMeleeTool, TOOL_COMBAT } from '../src/melee-tools.ts';
import { MELEE_PROFILES } from '../src/melee-motion.ts';
for (const value of [undefined,null,'pipe','knife','blade','toString',{},1]) assert.equal(isMeleeTool(value),false);
assert.throws(()=>buildMeleeTool('pipe'),RangeError);
const signatures=[];
for (const id of ['cleaver','wrench']) {
  assert.equal(isMeleeTool(id),true);
  const profile=TOOL_COMBAT[id]; assert.ok(MELEE_PROFILES[profile.kind]);
  for(const key of ['damage','reach','knockback']) assert.ok(Number.isFinite(profile[key])&&profile[key]>0);
  assert.ok(Object.isFrozen(profile));
  const group=buildMeleeTool(id); assert.equal(group.userData.shaftAxis,'+Y');
  assert.equal(group.children.length,2,'two material batches only');
  assert.deepEqual(group.position.toArray(),[0,0,0]);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  assert.ok(bounds.min.y<0&&bounds.max.y>0,'hand grip straddles origin');
  assert.ok(size.y<.5&&size.x<.2&&size.z<.06,'hand-held bounds, not world-scale geometry');
  assert.ok(size.y>size.x);
  let triangles=0;
  for(const mesh of group.children) {
    const pos=mesh.geometry.getAttribute('position'); assert.ok([...pos.array].every(Number.isFinite));
    assert.ok([...mesh.geometry.getAttribute('normal').array].every(Number.isFinite));
    assert.equal(mesh.material.map,null);
    triangles+=(mesh.geometry.index?.count??pos.count)/3;
  }
  assert.ok(triangles<=96,'small prop triangle budget');
  signatures.push(JSON.stringify(bounds));
  if(id==='wrench') {
    // Probe through actual jaw mouth, not only metadata; should see clear air.
    group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,.38,.2),new THREE.Vector3(0,0,-1));
    assert.equal(ray.intersectObject(group,true).length,0,'jaw must have real opening');
    ray.set(new THREE.Vector3(.0425,.38,.2),new THREE.Vector3(0,0,-1));
    assert.ok(ray.intersectObject(group,true).length>0,'jaw shoulder must be solid');
  }
  console.log(JSON.stringify({id,meshes:group.children.length,triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},profile}));
  for(const mesh of group.children) { mesh.geometry.dispose();mesh.material.dispose(); }
}
assert.notEqual(signatures[0],signatures[1]);
console.log('PASS melee tools: profiles, hand origin, finite geometry, budget and real wrench opening');
