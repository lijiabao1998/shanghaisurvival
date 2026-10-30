import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ROSTER,buildRig} from '../src/characters.ts';
const expected=['guard','rider','hardware','nurse','teacher','stall','driver','barber','sparky','pharmacy','student','chef'];
assert.deepEqual(ROSTER.map(c=>c.id),expected);
const stats=[];
for(const spec of ROSTER){
 const r=buildRig(spec);assert.equal(r.head.userData.faceless,true);
 assert.equal(r.elbowR.parent,r.armR);assert.equal(r.elbowL.parent,r.armL);assert.equal(r.kneeL.parent,r.legL);assert.equal(r.kneeR.parent,r.legR);
 assert.equal(r.elbowR.position.y,-spec.height*.29*.52);
 let meshes=0,vertices=0;const materials=new Set();r.root.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.getAttribute('position').count;materials.add(o.material);assert.ok(o.geometry.getAttribute('position').array.every(Number.isFinite));}});
 assert.equal(meshes,10,'one mesh per articulated joint');assert.equal(materials.size,1);assert.ok(vertices<9000,'phone-friendly per-player geometry budget');
 const bounds=new THREE.Box3().setFromObject(r.root);assert.ok(Math.abs(bounds.min.y)<.001);assert.ok(bounds.max.y<spec.height+.12);
 stats.push({id:spec.id,meshes,vertices,height:bounds.max.y});
}
console.log(JSON.stringify(stats,null,2));console.log('PASS all 12 persistent IDs, faceless marker, joint/hand offsets, finite geometry, 10 draw calls per rig, bounded geometry');
