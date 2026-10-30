import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {createStreetDetails,applyPavementGrain} from './src/street-details.ts';export {makeInsideTest,makeCollider,wallGridOf,doorEdgeIndex} from './src/world.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {createStreetDetails,applyPavementGrain,makeInsideTest,makeCollider,wallGridOf,doorEdgeIndex}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),before=JSON.stringify(data);
const points=data.buildings.flatMap(b=>b.footprint),bounds={minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
const detail=createStreetDetails(data.roads,data.buildings,bounds);
assert.equal(JSON.stringify(data),before);assert.equal(detail.group.children.length,3);assert.ok(detail.stats.slabs>100);assert.ok(detail.stats.vertices<260000);
const inside=makeInsideTest(data),collides=makeCollider(wallGridOf(data));
for(const mesh of detail.group.children){const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color');assert.equal(p.count,c.count);for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));assert.ok(p.getX(i)>=bounds.minX-.001&&p.getX(i)<=bounds.maxX+.001);assert.ok(-p.getZ(i)>=bounds.minY-.001&&-p.getZ(i)<=bounds.maxY+.001);}}
for(const p of detail.placements){assert.equal(inside(p.x,p.z),false);assert.equal(collides(p.x,p.z,.8),false);for(const b of data.buildings){const i=doorEdgeIndex(b.footprint);if(i<0)continue;const a=b.footprint[i],z=b.footprint[(i+1)%b.footprint.length];assert.ok(Math.hypot(p.x-(a[0]+z[0])/2,p.z-(a[1]+z[1])/2)>=3.2);}}
const lamp=detail.group.children[2].material;detail.setNight(1);assert.equal(lamp.emissiveIntensity,1.8);detail.setNight(-2);assert.equal(lamp.emissiveIntensity,0);detail.setNight(NaN);assert.equal(lamp.emissiveIntensity,0);
const empty=createStreetDetails([{id:'invalid',width_m:NaN,type:'road',centerline:[[0,0],[10,10]]}],[],bounds);assert.equal(empty.stats.slabs,0);empty.dispose();
const duplicate=createStreetDetails(data.roads,data.buildings,bounds);assert.deepEqual(duplicate.stats,detail.stats);assert.deepEqual(duplicate.placements,detail.placements);duplicate.dispose();
console.log('PASS deterministic streetscape, 3 meshes, source unchanged, bounds/door/collision exclusions, daylight emissive reset',detail.stats);detail.dispose();
const fixtureBounds={minX:-100,maxX:100,minY:-100,maxY:100};
const narrow={id:'lane',type:'service',width_m:4,centerline:[[-50,0],[50,0]]};
const lane=createStreetDetails([narrow],[],fixtureBounds);assert.equal(lane.stats.slabs,0,'narrow lanes are not widened');lane.dispose();
const wide={...narrow,id:'street',type:'residential',width_m:6};
const crossing={...narrow,id:'crossing',type:'footway',width_m:2,centerline:[[0,-50],[0,50]]};
const crossed=createStreetDetails([wide,crossing],[],fixtureBounds);assert.ok(crossed.stats.slabs>0);const paving=crossed.group.children[0].geometry.getAttribute('position');
for(let i=0;i<paving.count;i++)assert.ok(Math.abs(paving.getX(i))>=1,'no raised paving across existing footway');crossed.dispose();
console.log('PASS narrow lanes unchanged and intersecting pedestrian approach unblocked');

const neutral=createStreetDetails([wide],[],fixtureBounds);
const palette=neutral.group.children[0].geometry.getAttribute('color');
for(let i=0;i<palette.count;i++)assert.ok(Math.max(palette.getX(i),palette.getY(i),palette.getZ(i))-Math.min(palette.getX(i),palette.getY(i),palette.getZ(i))<.035,'pavement palette stays low-chroma neutral gray, not beige');
assert.ok(neutral.stats.joints<neutral.stats.slabs,'no seam grid on every large panel');
assert.ok(neutral.stats.patches<neutral.stats.slabs/2,'patching remains sparse');
const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
neutral.group.children[0].material.onBeforeCompile(shader);
assert.equal(shader.uniforms.pavementGrainStrength.value,.055);assert.match(shader.vertexShader,/modelMatrix/);assert.match(shader.fragmentShader,/grainA/);assert.doesNotMatch(shader.fragmentShader,/texture2D|sampler2D/);
assert.ok(shader.vertexShader.includes('#include <begin_vertex>'));assert.ok(shader.fragmentShader.includes('#include <color_fragment>'),'standard lighting pipeline retained');
assert.match(neutral.group.children[0].material.customProgramCacheKey(),/neutral-pavement-v1/);neutral.dispose();
console.log('PASS low-chroma gray pavement, sparse joints/patches and Node-safe texture-free fine aggregate shader injection');
