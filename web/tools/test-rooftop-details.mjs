import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const result=await build({stdin:{contents:"export {rooftopDetails} from './src/rooftop-details.ts'; export {makeInsideTest} from './src/world.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {rooftopDetails,makeInsideTest}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync('public/data/block.json','utf8'));let count=0,vertices=0;
for(const b of data.buildings){const before=JSON.stringify(b),d=rooftopDetails({...b,height_m:Math.min(b.height_m,6.4)});assert.equal(JSON.stringify(b),before);assert.deepEqual(d,rooftopDetails({...b,height_m:Math.min(b.height_m,6.4)}));assert.equal(d.positions.length,d.colors.length);assert.ok(d.positions.length/3<=600);const inside=makeInsideTest({buildings:[b],spawn:b.footprint[0]});for(let i=0;i<d.positions.length;i+=3){assert.ok(inside(d.positions[i],-d.positions[i+2]));assert.ok(d.positions[i+1]>=Math.min(b.height_m,6.4)-1e-6);}count+=d.features>0?1:0;vertices+=d.positions.length/3;}
assert.ok(count>100);console.log(`PASS ${count} footprint-contained rooftop groups, ${vertices} vertices, deterministic bounded existing roof batch; no map/save mutation`);
