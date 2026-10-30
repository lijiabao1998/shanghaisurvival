import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roadGeometries,nearbyRoadName} from '../src/road-geometry.ts';
const r=(points,width=6)=>({id:'test',centerline:points,width_m:width,type:'residential'});
const east=roadGeometries([r([[10,20],[40,20]])]);
assert.equal(east.segments,1);assert.equal(east.surface.getAttribute('position').count,6);
assert.equal(east.surface.boundingBox.min.x,10);assert.equal(east.surface.boundingBox.min.z,-23);assert.ok(Math.abs(east.surface.boundingBox.min.y-.015)<1e-7);
assert.equal(east.surface.boundingBox.max.x,40);assert.equal(east.surface.boundingBox.max.z,-17);assert.ok(Math.abs(east.surface.boundingBox.max.y-.015)<1e-7);
const north=roadGeometries([r([[10,20],[10,40]],4)]);
assert.equal(north.surface.boundingBox.min.x,8);assert.equal(north.surface.boundingBox.max.x,12);
assert.equal(north.surface.boundingBox.min.z,-40);assert.equal(north.surface.boundingBox.max.z,-20);
assert.equal(roadGeometries([r([[0,0],[0,0]]),r([[0,0],[1,1]],NaN),r([[0,0],[Infinity,1]])]).segments,0);
const data=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const before=JSON.stringify(data.roads),g=roadGeometries(data.roads);
assert.ok(g.segments>100);assert.equal(JSON.stringify(data.roads),before,'source map never mutated');
assert.equal(g.surface.getAttribute('position').count,g.segments*6);
assert.equal(g.edges.getAttribute('position').count,g.segments*12);
assert.equal(g.surface.getAttribute('color').count,g.segments*6);
assert.ok([...g.surface.getAttribute('position').array].every(Number.isFinite));
console.log(`PASS real OSM ${data.roads.length} roads / ${g.segments} segments: metre coordinates, north flip, widths, finite merged geometry, source unchanged`);

assert.equal(nearbyRoadName([{...r([[0,0],[10,0]]),name:'文廟路'}],5,1),'文廟路');
assert.equal(nearbyRoadName([{...r([[0,0],[10,0]]),name:'文廟路'}],5,50),null);

const palette=g.surface.getAttribute('color');for(let i=0;i<palette.count;i++)assert.ok(Math.max(palette.getX(i),palette.getY(i),palette.getZ(i))-Math.min(palette.getX(i),palette.getY(i),palette.getZ(i))<.035,'road and footway use low-chroma gray');
console.log('PASS road palette neutralized without changing original segment vertices/widths');
