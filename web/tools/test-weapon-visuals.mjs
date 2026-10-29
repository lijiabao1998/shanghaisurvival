import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFirearm } from '../src/weapon-visuals.ts';
const signatures = new Set();
const expected = {
  'qsz92-9': { min:[-.0215,-.1575,-.0995], max:[.0215,.0545,.067], triangles:72, parts:6 },
  'qbz95-1': { min:[-.0415,-.4,-.165], max:[.0415,.386,.1595], triangles:132, parts:10 },
  'qbz191': { min:[-.0365,-.435,-.165], max:[.0365,.3695,.1295], triangles:144, parts:11 },
};
for (const id of ['qsz92-9','qbz95-1','qbz191']) {
  const gun=buildFirearm(id);
  assert.ok(gun instanceof THREE.Group);
  assert.equal(gun.userData.muzzleAxis,'-Y');
  assert.deepEqual(gun.position.toArray(),[0,0,0]);
  const bounds=new THREE.Box3().setFromObject(gun),size=bounds.getSize(new THREE.Vector3());
  assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
  assert.ok(size.y>size.x && size.y>size.z,'long axis must be local Y');
  assert.ok(size.y<(id==='qsz92-9'?.3:.9));
  assert.ok(bounds.min.y<0 && bounds.max.y>0,'grip-origin prop extends both directions');
  assert.equal(gun.children.length,3,'batch by material, maximum three draw calls');
  assert.equal(gun.userData.parts.length,expected[id].parts);
  for(const [axis,index] of ['x','y','z'].map((a,i)=>[a,i])) {
    assert.ok(Math.abs(bounds.min[axis]-expected[id].min[index])<1e-6,'minimum bounds preserved');
    assert.ok(Math.abs(bounds.max[axis]-expected[id].max[index])<1e-6,'maximum bounds preserved');
  }
  const materials=new Set();let triangles=0;
  for (const mesh of gun.children) {
    assert.ok(mesh instanceof THREE.Mesh);
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(mesh.material.map,null);materials.add(mesh.material);
    const positions=mesh.geometry.getAttribute('position');
    assert.ok([...positions.array].every(Number.isFinite));
    const normals=mesh.geometry.getAttribute('normal');
    assert.equal(normals.count,positions.count);
    for(let i=0;i<normals.count;i++) assert.ok(Math.abs(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))-1)<1e-6,'unit normals preserved');
    triangles+=(mesh.geometry.index?.count??positions.count)/3;
  }
  assert.equal(materials.size,3);assert.equal(triangles,expected[id].triangles);
  if(id!=='qsz92-9') {
    assert.ok(gun.userData.parts.find(p=>p.name==='barrel').y<0);
    const mag=gun.userData.parts.find(p=>p.name==='magazine');
    assert.equal(Math.sign(mag.y),id==='qbz95-1'?1:-1);
  }
  signatures.add(JSON.stringify(gun.children.map(m=>[m.name,...m.geometry.getAttribute('position').array])));
  console.log(`ok ${id}: ${gun.children.length} meshes, ${materials.size} materials, ${triangles} triangles, length ${size.y.toFixed(3)}m`);
  gun.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
  materials.forEach(m=>m.dispose());
}
assert.equal(signatures.size,3);
assert.throws(()=>buildFirearm('unknown'),RangeError);
const a=buildFirearm('qbz191'),b=buildFirearm('qbz191');
assert.notEqual(a.children[0].material,b.children[0].material,'independent props may be disposed safely');
assert.notEqual(a.children[0].geometry,b.children[0].geometry);
assert.notEqual(a.children[0].geometry.getAttribute('position').array,b.children[0].geometry.getAttribute('position').array);
for(const g of [a,b]){const mats=new Set();g.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();mats.add(o.material);}});mats.forEach(m=>m.dispose());}
console.log('Weapon geometry checks passed. Rendering, hand placement and feel await owner play.');
