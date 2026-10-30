import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
// Freeze the released planning/collision section: this revision may change art only.
const source=readFileSync(new URL('../src/interior-rooms.ts',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(source.split('export function createInteriorRoomGeometry')[0]).digest('hex'),'4035bbb5ea466b4254231ab6bb16da97d1e23835bacdf40168e204c4dc8e5eaa','planning/IDs/layout/loot/collision remain byte-identical to released base');
const bundle=await build({stdin:{contents:`export * from './src/interior-rooms';export {makeCollider,makeInsideTest,wallGridOf} from './src/world';export {selectShelter} from './src/shelter';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`),block=JSON.parse(readFileSync(new URL('../public/data/block.json',import.meta.url),'utf8'));
const base=m.makeCollider(m.wallGridOf(block,false)),s=m.selectShelter(block.buildings,block.spawn,base,m.makeInsideTest(block)),rooms=m.planInteriorRooms(block,[s.id],9),planBefore=JSON.stringify(rooms);
const required={home:['decorative-cleaver-on-board','quilt-stitching','pillow-seams','basin-edge-wear','soap-block','open-enamel-cup','open-meal-bowl'],grocer:['paper-stock-labels','tin-lid-seams','slat-nail-heads'],repair:['decorative-wrench','oil-wear','partitioned-parts-tray','worktop-grain']};
let vertices=0,meshes=0;for(const room of rooms){const building=block.buildings.find(b=>b.id===room.buildingId),g=m.createInteriorRoomGeometry(room,building),again=m.createInteriorRoomGeometry(room,building);assert.equal(g.children.length,2);
 for(const feature of required[room.kind])assert.ok(g.userData.detailKinds.includes(feature),`${room.kind}: ${feature}`);
 for(let i=0;i<g.children.length;i++){const a=g.children[i],b=again.children[i];assert.deepEqual(a.geometry.getAttribute('position').array,b.geometry.getAttribute('position').array);assert.deepEqual(a.geometry.getAttribute('color')?.array,b.geometry.getAttribute('color')?.array);assert.equal(a.material.map,null,'no new per-room raster textures');vertices+=a.geometry.getAttribute('position').count;meshes++;a.geometry.dispose();a.material.dispose();b.geometry.dispose();b.material.dispose();}}
assert.equal(JSON.stringify(rooms),planBefore,'visual building does not mutate room layouts');assert.equal(meshes,18);assert.ok(vertices<60000);console.log('PASS released planning/collision unchanged; material details deterministic, no textures,',meshes,'meshes and',vertices,'vertices');
