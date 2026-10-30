import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './src/interior-rooms.ts';export {makeInsideTest,makeCollider,wallGridOf} from './src/world.ts';export {selectShelter} from './src/shelter.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {planInteriorRooms,roomFurnitureCollision,createInteriorRoomGeometry,makeInsideTest,makeCollider,wallGridOf,selectShelter}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const block=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8')),before=JSON.stringify(block),collides=makeCollider(wallGridOf(block,false)),inside=makeInsideTest(block),s=selectShelter(block.buildings,block.spawn,collides,inside);
const rooms=planInteriorRooms(block,[s.id]);
assert.equal(rooms.length,3,'three real non-shelter buildings fitted');assert.deepEqual(rooms,planInteriorRooms(block,[s.id]),'stable IDs and layout across reload');
const ids=new Set();for(const room of rooms){assert.notEqual(room.buildingId,s.id);assert.ok(room.furniture.length>=2);assert.ok(!ids.has(room.id));ids.add(room.id);
 const b=block.buildings.find(b=>b.id===room.buildingId),within=makeInsideTest({buildings:[b],spawn:room.entrance.inside});
 for(const f of room.furniture){assert.ok(f.corners.every(p=>within(...p)));assert.equal(roomFurnitureCollision(room,...f.center),true);}
 const dx=room.entrance.inside[0]-room.entrance.door[0],dz=room.entrance.inside[1]-room.entrance.door[1],len=Math.hypot(dx,dz);
 for(let d=-1.8;d<4.7;d+=.1){const p=[room.entrance.door[0]+dx/len*d,room.entrance.door[1]+dz/len*d];assert.equal(collides(...p,.36),false,'doorway and room central route wall-clear');assert.equal(roomFurnitureCollision(room,...p,.36),false,'furniture not blocking central route');}
 for(const l of room.loot){assert.ok(within(...l.position));assert.equal(roomFurnitureCollision(room,...l.position),false);assert.ok(room.furniture.some(f=>f.id===l.furnitureId));}
 const group=createInteriorRoomGeometry(room,b);assert.equal(group.children.length,2);const floor=group.children[0].geometry.getAttribute('position');for(let i=0;i<floor.count;i++)assert.ok(Math.abs(floor.getY(i)-.04)<1e-6,'floor not roof height');for(const mesh of group.children){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));}
}
assert.equal(JSON.stringify(block),before,'no map/saves/input mutation');assert.deepEqual(planInteriorRooms(block,[],0),[]);assert.deepEqual(planInteriorRooms({buildings:[],spawn:[0,0]}),[]);
console.log('PASS 3 deterministic real-footprint rooms, unique loot IDs, furniture collision, clear door corridors, bounded meshes, no mutation');console.log(JSON.stringify(rooms.map(r=>({id:r.id,kind:r.kind,entrance:r.entrance,furniture:r.furniture.length,loot:r.loot})),null,2));
