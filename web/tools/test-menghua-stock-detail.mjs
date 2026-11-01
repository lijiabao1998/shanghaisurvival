import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {createStreetDetails} from './src/street-details.ts';export {planInteriorRooms,createInteriorRoomGeometry} from './src/interior-rooms.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {createStreetDetails,planInteriorRooms,createInteriorRoomGeometry}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const bounds={minX:-100,maxX:100,minY:-100,maxY:100};
const road={id:'osm_40109239_0',type:'residential',width_m:6,centerline:[[-30,0],[30,0]]};
const named=createStreetDetails([road],[],bounds),generic=createStreetDetails([{...road,id:'other'}],[],bounds);
assert.ok(named.stats.bevelledCurbs>0);assert.equal(generic.stats.bevelledCurbs,0,'historical source not generalized to every road');
assert.equal(named.stats.slabs,generic.stats.slabs);assert.equal(named.stats.curbs,generic.stats.curbs);
assert.deepEqual(named.placements,generic.placements,'no tree/lamp moved');
const position=named.group.children[0].geometry.getAttribute('position');
assert.ok([...position.array].every(Number.isFinite));
let bevel=false;const normals=named.group.children[0].geometry.getAttribute('normal');
for(let i=0;i<normals.count;i++)if(Math.abs(normals.getY(i))>.2&&Math.abs(normals.getY(i))<.95)bevel=true;
assert.ok(bevel,'actual sloped curb face rather than metadata');
for(const item of [named,generic])item.dispose();
const block=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url))),rooms=planInteriorRooms(block),before=JSON.stringify(rooms);
let total=0;
for(const room of rooms){
 const group=createInteriorRoomGeometry(room,block.buildings.find(b=>b.id===room.buildingId));
 assert.equal(group.children.length,2);total+=group.children[1].geometry.getAttribute('position').count;
 if(room.kind==='grocer')for(const feature of ['mixed-household-vessels','shelf-card-rail'])assert.ok(group.userData.detailKinds.includes(feature));
 if(room.kind==='repair')for(const feature of ['steel-parts-drawers','raised-drawer-pulls'])assert.ok(group.userData.detailKinds.includes(feature));
 for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();}
}
assert.equal(JSON.stringify(rooms),before);assert.ok(total<22000);
console.log('PASS named Menghua bevel geometry, unchanged placement, mixed stock / storage drawers; furniture vertices',total);
