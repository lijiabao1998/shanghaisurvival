import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {build} from 'esbuild';
const bundled=await build({stdin:{contents:"export * from './src/density-plan.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {planDensityBuildings,densityEnabledForLayout}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url))),before=JSON.stringify(data),plan=planDensityBuildings(data);
assert.equal(plan.buildings.length,4);assert.equal(plan.rejected.length,0);assert.deepEqual(plan,planDensityBuildings(data));assert.equal(JSON.stringify(data),before);
assert.equal(new Set(plan.buildings.map(b=>b.id)).size,4);for(const b of plan.buildings){assert.equal(b.height_m,4.2);assert.equal(b.holes.length,0);assert.ok(b.id.startsWith('fictional:menghua-infill:v2:'));}
for(const e of plan.evidence){assert.ok(e.wallClearance>=3);assert.ok(e.roadClearance>=2);assert.ok(e.spawnClearance>=15);}
assert.equal(planDensityBuildings(data,plan.evidence.map(e=>e.center)).buildings.length,0,'protected save/container positions veto occupied sites');
for(const v of [undefined,null,0,1,2,'2',3])assert.equal(densityEnabledForLayout(v),false);assert.equal(densityEnabledForLayout('menghua-infill-v1'),true);
console.log('PASS pure fictional 4-building layout proposal, exact segment clearances, legacy opt-in boundary, unchanged source',plan.evidence);
