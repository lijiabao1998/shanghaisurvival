import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {createCityVisibility} from './src/city-visibility.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {createCityVisibility}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const rect=(id,x,z,h=20)=>({id,footprint:[[x,z],[x+4,z],[x+4,z+4],[x,z+4]],holes:[],height_m:h});
const source=[rect('front',4,-8),rect('behind',-10,6)];
const before=JSON.stringify(source),v=createCityVisibility(source);
assert.equal(v.group.children.length,3);assert.equal(v.stats().meshes,3);
const pos=v.group.children[0].geometry.getAttribute('position').array;
const original=Array.from(pos);
const indexBuffers=v.group.children.map(m=>m.geometry.index);
v.update(0,0);assert.ok(v.fadedIds().includes('front'));assert.ok(!v.fadedIds().includes('behind'));
assert.equal(v.stats().solidIndices+v.stats().fadedIndices,v.stats().wallVertices);
assert.ok(v.stats().roofIndices<v.stats().roofVertices);
assert.equal(v.update(0,0),false,'stationary view must not reallocate index buffers');
v.update(200,200);assert.deepEqual(v.fadedIds(),[]);assert.equal(v.stats().roofIndices,v.stats().roofVertices);
assert.equal(v.stats().fadedIndices,0);assert.ok(v.group.children.every((m,i)=>m.geometry.index===indexBuffers[i]),'GPU index buffers reused, not reallocated');assert.deepEqual(Array.from(pos),original);assert.equal(JSON.stringify(source),before);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const city=createCityVisibility(data.buildings),initial=city.stats();
let transitions=0;const start=performance.now();
for(let i=0;i<180;i++){
 if(city.update(data.spawn[0]+Math.cos(i*.08)*40,data.spawn[1]+Math.sin(i*.08)*40))transitions++;
 const s=city.stats();assert.equal(s.solidIndices+s.fadedIndices,s.wallVertices);assert.ok(s.roofIndices<=s.roofVertices);assert.equal(s.meshes,3);
}
assert.ok(transitions>0);assert.equal(city.group.children.length,3);assert.equal(initial.wallVertices,city.stats().wallVertices);
console.log(`PASS fixed 3 meshes; stable source vertices; solid/faded index conservation; 180 real-map samples, ${transitions} transitions in ${(performance.now()-start).toFixed(1)}ms (Node CPU only, not mobile/GPU benchmark)`);
