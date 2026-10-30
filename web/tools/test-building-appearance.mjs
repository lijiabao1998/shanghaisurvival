import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const b=await build({stdin:{contents:`export {lilongFacade,buildingAppearance} from './src/shanghai-details.ts';export {doorEdgeIndex} from './src/world.ts';export {createCityVisibility} from './src/city-visibility.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {lilongFacade,buildingAppearance,doorEdgeIndex,createCityVisibility}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),before=JSON.stringify(data),states={maintained:0,shuttered:0,weathered:0};let vertices=0,maxVertices=0;
for(const source of data.buildings){
 const rendered={...source,height_m:Math.min(source.height_m,6.4)},g=lilongFacade(rendered),count=g.positions.length/3;vertices+=count;maxVertices=Math.max(maxVertices,count);states[buildingAppearance(source.id)]++;
 assert.deepEqual(g,lilongFacade(rendered));assert.equal(g.positions.length,g.colors.length);assert.ok(g.positions.every(Number.isFinite));assert.ok(count<=700,'per-building hard art budget');
 const door=doorEdgeIndex(source.footprint);if(door<0)continue;const a=source.footprint[door],z=source.footprint[(door+1)%source.footprint.length],dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy);
 for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i],y=g.positions[i+1],q=-g.positions[i+2];const u=((x-a[0])*dx+(q-a[1])*dy)/len,depth=Math.abs((x-a[0])*dy-(q-a[1])*dx)/len;
  assert.ok(!(y<2.2&&depth<.5&&Math.abs(u-len/2)<.8),'visual boards never seal traversable gateway');
 }
}
assert.equal(JSON.stringify(data),before);assert.ok(vertices<300000,'whole map detail budget');for(const count of Object.values(states))assert.ok(count>40,'each appearance meaningfully represented');
const group=createCityVisibility(data.buildings,true);assert.equal(group.stats().meshes,3);const beforeCount=group.stats().wallVertices;group.update(...data.spawn);assert.equal(group.stats().wallVertices,beforeCount,'fade changes indices, not detail geometry');
console.log('PASS deterministic original ID-based appearances, clear real doors, bounded geometry and 3 city meshes', {states,vertices,maxVertices});
