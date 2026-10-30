import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './src/interior-rooms.ts';export {makeInsideTest,makeCollider,wallGridOf} from './src/world.ts';export {selectShelter} from './src/shelter.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {planInteriorRooms,roomFurnitureCollision,createInteriorRoomGeometry,makeInsideTest,makeCollider,wallGridOf,selectShelter}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const block=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),before=JSON.stringify(block),collides=makeCollider(wallGridOf(block,false)),inside=makeInsideTest(block),s=selectShelter(block.buildings,block.spawn,collides,inside);
const rooms=planInteriorRooms(block,[s.id]);
assert.equal(rooms.length,9,'nine fixed-catalog real non-shelter buildings fitted');assert.deepEqual(rooms,planInteriorRooms(block,[s.id]),'stable IDs and layout across reload');
const ids=new Set();for(const room of rooms){assert.notEqual(room.buildingId,s.id);assert.ok(room.furniture.length>=2);assert.ok(!ids.has(room.id));ids.add(room.id);
 const b=block.buildings.find(b=>b.id===room.buildingId),within=makeInsideTest({buildings:[b],spawn:room.entrance.inside});
 for(const f of room.furniture){assert.ok(f.corners.every(p=>within(...p)));assert.equal(roomFurnitureCollision(room,...f.center),true);}
 const dx=room.entrance.inside[0]-room.entrance.door[0],dz=room.entrance.inside[1]-room.entrance.door[1],len=Math.hypot(dx,dz);
 for(let d=-1.8;d<4.7;d+=.1){const p=[room.entrance.door[0]+dx/len*d,room.entrance.door[1]+dz/len*d];assert.equal(collides(...p,.36),false,'doorway and room central route wall-clear');assert.equal(roomFurnitureCollision(room,...p,.36),false,'furniture not blocking central route');}
 for(const l of room.loot){assert.ok(within(...l.position));assert.equal(roomFurnitureCollision(room,...l.position),false);assert.ok(room.furniture.some(f=>f.id===l.furnitureId));}
 const group=createInteriorRoomGeometry(room,b);assert.equal(group.children.length,2);
 assert.equal(group.userData.drawCalls,2);assert.ok(group.userData.detailKinds.length>=5,'recognizable use-specific furnishings');const props=group.children[1].geometry.getAttribute('position');assert.ok(props.count<=6000,'bounded merged-geometry vertex budget');
 const ax=room.entrance.inside[0]-room.entrance.door[0],az=room.entrance.inside[1]-room.entrance.door[1],al=Math.hypot(ax,az);
 for(let i=0;i<props.count;i++){const x=props.getX(i),z=-props.getZ(i);assert.ok(room.furniture.some(f=>{const dx=x-f.center[0],dz=z-f.center[1];return Math.abs(dx*az/al-dz*ax/al)<=f.width/2+.001&&Math.abs(dx*ax/al+dz*az/al)<=f.depth/2+.001;}),'visible details stay in collision footprints');}
 const floor=group.children[0].geometry.getAttribute('position');for(let i=0;i<floor.count;i++)assert.ok(Math.abs(floor.getY(i)-.04)<1e-6,'floor not roof height');for(const mesh of group.children){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));}
}
assert.equal(JSON.stringify(block),before,'no map/saves/input mutation');assert.deepEqual(planInteriorRooms(block,[],0),[]);assert.deepEqual(planInteriorRooms({buildings:[],spawn:[0,0]}),[]);
console.log('PASS 9 deterministic real-footprint rooms, unique loot IDs, furniture collision, clear door corridors, bounded meshes, no mutation');console.log(JSON.stringify(rooms.map(r=>({id:r.id,kind:r.kind,entrance:r.entrance,furniture:r.furniture.length,loot:r.loot})),null,2));

assert.deepEqual(rooms.slice(0,3).map(r=>r.id),['room-v1:cmab_327821_0','room-v1:cmab_327816_0','room-v1:cmab_327817_0'],'existing room identity/order remains fixed');
assert.deepEqual(rooms.slice(0,3).map(r=>r.loot.map(l=>[l.id,l.item,l.count])),[['room-v1:cmab_327821_0:supply','water',1],['room-v1:cmab_327816_0:supply','food',1],['room-v1:cmab_327817_0:supply','battery',1]].map(l=>[l]),'detail update never adds loot or changes persistence IDs');
console.log('PASS detailed furniture within original collision envelopes, two draw calls/room, <=6000 vertices, unchanged save IDs and loot');

const originalThree=JSON.parse(readFileSync(new URL('./fixtures/interior-v1-three.json',import.meta.url),'utf8'));
assert.deepEqual(rooms.slice(0,3),originalThree,'old three exact entrance/furniture/focus/loot stay unchanged');
assert.deepEqual(planInteriorRooms(block,[s.id],3),originalThree);
assert.deepEqual(planInteriorRooms({...block,buildings:[...block.buildings].reverse()},[s.id]),rooms,'input order cannot reassign kinds or IDs');
const removed=planInteriorRooms({...block,buildings:block.buildings.filter(b=>b.id!==rooms[3].buildingId)},[s.id]);
assert.deepEqual(removed,rooms.filter((_,i)=>i!==3),'missing new footprint omitted without shifting remaining identities');
assert.equal(planInteriorRooms(block,[s.id],6).length,6);assert.equal(planInteriorRooms(block,[s.id],999).length,9);assert.deepEqual(planInteriorRooms(block,[s.id],NaN),[]);
let totalVertices=0;for(const room of rooms){const g=createInteriorRoomGeometry(room,block.buildings.find(b=>b.id===room.buildingId));totalVertices+=g.children.reduce((n,m)=>n+m.geometry.getAttribute('position').count,0);for(const m of g.children){m.geometry.dispose();m.material.dispose();}}
assert.ok(totalVertices<60000,'nine furnished rooms incl floors stay within total mobile geometry budget');
console.log('PASS nine stable rooms, exact legacy-three snapshot, reordered/removed footprint stability, <=18 meshes and',totalVertices,'total vertices');
