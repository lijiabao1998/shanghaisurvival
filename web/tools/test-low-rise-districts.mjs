import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {createCityVisibility} from './src/city-visibility.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {createCityVisibility}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const before=JSON.stringify(data);
const city=createCityVisibility(data.buildings,true);
assert.equal(JSON.stringify(data),before,'source geometry, heights, IDs and save targets unchanged');
assert.equal(city.group.children.length,3,'no per-building draw calls');
for(const mesh of city.group.children){
 const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color');
 assert.equal(p.count,c.count,'each vertex gets color');
 for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert.ok(p.getY(i)<=12.01,'visual height capped at three storeys');}
 assert.ok(mesh.material.vertexColors);
}
const colors=city.group.children[0].geometry.getAttribute('color');
assert.ok(new Set(Array.from({length:colors.count},(_,i)=>`${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`)).size>=7,'varied walls, frames, windows, eaves');
const indices=city.group.children.map(m=>m.geometry.index);
for(let i=0;i<100;i++){
 city.update(data.spawn[0]+Math.cos(i*.1)*80,data.spawn[1]+Math.sin(i*.1)*80);
 const s=city.stats();assert.equal(s.solidIndices+s.fadedIndices,s.wallVertices);assert.ok(s.roofIndices<=s.roofVertices);
 assert.ok(city.group.children.every((m,j)=>m.geometry.index===indices[j]));
}
const again=createCityVisibility(data.buildings,true);
for(let i=0;i<3;i++)assert.deepEqual(again.group.children[i].geometry.getAttribute('position').array,city.group.children[i].geometry.getAttribute('position').array,'deterministic appearance');
console.log(`PASS ${data.buildings.length} buildings: <=12 m visual height, varied facades, unchanged sources, deterministic output, 3 stable meshes, occlusion conservation`);
