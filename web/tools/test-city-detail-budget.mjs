import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export {createCityVisibility} from './src/city-visibility.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {createCityVisibility}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync('public/data/block.json','utf8')),before=JSON.stringify(data);const start=performance.now(),city=createCityVisibility(data.buildings,true),s=city.stats();
assert.equal(s.meshes,3);assert.ok(s.wallVertices+s.roofVertices<1000000,'bounded total city detail budget, not a device FPS guarantee');
const buffers=city.group.children.map(m=>m.geometry.getAttribute('position'));
for(let i=0;i<30;i++){city.update(data.spawn[0]+i,data.spawn[1]+i/2);city.group.children.forEach((m,j)=>assert.equal(m.geometry.getAttribute('position'),buffers[j],'no new GPU geometry per movement'));const current=city.stats();assert.equal(current.solidIndices+current.fadedIndices,current.wallVertices);}
assert.equal(JSON.stringify(data),before);console.log(`PASS 3 existing meshes, ${s.wallVertices} wall + ${s.roofVertices} roof vertices, stable buffers; ${(performance.now()-start).toFixed(0)}ms Node construction/update only, NOT mobile FPS`);
